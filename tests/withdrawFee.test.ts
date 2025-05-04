import {
  AnchorProvider,
  setProvider,
  web3,
  workspace,
  utils,
} from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  InstructionWithEphemeralSigners,
  PythSolanaReceiver,
} from "@pythnetwork/pyth-solana-receiver";
import {
  Account,
  getAccount,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Protocol } from "../target/types/protocol";
import { enterContest, pythPriceFeedIds, UNITS_PER_USDC } from "./helpers";
import { fixtureWithContest } from "./fixtures";
import { expect } from "chai";

describe("withdrawFee", () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const pg = workspace.Protocol as Program<Protocol>;

  let mint: web3.PublicKey;
  let configPda: web3.PublicKey;
  let contestMetadataPda: web3.PublicKey;
  let contestCreditsPda: web3.PublicKey;
  let contestPda: web3.PublicKey;
  let escrowTokenAccountPda: web3.PublicKey;
  let feeTokenAccountPda: web3.PublicKey;
  let signers: web3.Keypair[];
  let signerTokenAccounts: Account[] = [];

  let pythSolanaReceiver: PythSolanaReceiver;
  let priceServiceConnection: HermesClient;
  const priceFeedIds = [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat];
  let numEntries;
  let numWinners;

  before(async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = currentTime + 60 * 60; // 1 hour from now
    const endTime = startTime + 60 * 60 * 24; // 1 day from now
    const contestParams = {
      startTime,
      endTime,
      entryFee: BigInt(10 * UNITS_PER_USDC),
      maxEntries: 100,
      priceFeedIds,
      rewardAllocation: [75, 25],
    };

    numWinners = contestParams.rewardAllocation.length;

    const res = await fixtureWithContest({
      provider,
      program: pg,
      contestParams,
    });

    mint = res.mint;
    configPda = res.configPda;
    contestMetadataPda = res.contestMetadataPda;
    contestCreditsPda = res.contestCreditsPda;
    contestPda = res.contestPda;
    escrowTokenAccountPda = res.escrowTokenAccountPda;
    feeTokenAccountPda = res.feeTokenAccountPda;
    signers = res.signers;
    signerTokenAccounts = res.signerTokenAccounts;
    pythSolanaReceiver = res.pythSolanaReceiver;
    priceServiceConnection = res.priceServiceConnection;
    const creditAllocations = [
      [25, 75],
      [50, 50],
      [40, 60],
      [75, 25],
    ];
    numEntries = creditAllocations.length;

    for (let i = 0; i < creditAllocations.length; i++) {
      const { txSignature } = await enterContest({
        signer: signers[i],
        program: pg,
        configPda,
        contestPda,
        mint,
        escrowTokenAccountPda: escrowTokenAccountPda,
        feeTokenAccountPda: feeTokenAccountPda,
        signerTokenAccount: signerTokenAccounts[i],
        creditAllocation: creditAllocations[i],
      });

      console.log("enter:", txSignature);
    }
  });

  it("withdraw fee of token draft contest", async () => {
    const signer = signers[0];
    const priceFeedIds = [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat];
    const timestamp = Math.floor(Date.now() / 1000) - 60 * 60 * 24; // 1 day ago
    const priceUpdates =
      await priceServiceConnection.getPriceUpdatesAtTimestamp(
        timestamp,
        priceFeedIds,
        { encoding: "base64" }
      );
    const priceUpdatesData = priceUpdates.binary.data;

    const txBuilder = pythSolanaReceiver.newTransactionBuilder({
      closeUpdateAccounts: true,
    });
    await txBuilder.addPostPriceUpdates(priceUpdatesData);
    await txBuilder.addPriceConsumerInstructions(
      async (getPriceUpdateAccount) => {
        const priceUpdateAccounts = priceFeedIds.map((id) =>
          getPriceUpdateAccount(id)
        );

        const accounts = {
          signer: signer.publicKey,
          contest: contestPda,
          contestCredits: contestCreditsPda,
          contestMetadata: contestMetadataPda,
          mint,
          escrowTokenAccount: escrowTokenAccountPda,
          feeTokenAccount: feeTokenAccountPda,
          feed0: priceUpdateAccounts[0],
          feed1: priceUpdateAccounts[1] || null,
          feed2: priceUpdateAccounts[2] || null,
          feed3: priceUpdateAccounts[3] || null,
          feed4: priceUpdateAccounts[4] || null,
          tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        };

        const txInstruction = await pg.methods
          .resolveTokenDraftContest()
          .accounts(accounts)
          .instruction();

        const instruction: InstructionWithEphemeralSigners = {
          instruction: txInstruction,
          signers: [],
        };

        return [instruction];
      }
    );

    const versionedTxs = await txBuilder.buildVersionedTransactions({
      computeUnitPriceMicroLamports: 50000,
    });

    const sigs = await pythSolanaReceiver.provider.sendAll(versionedTxs, {
      skipPreflight: false,
    });

    console.log("signatures:", sigs);

    const contest = await pg.account.tokenDraftContest.fetch(contestPda);
    // console.log("contest:", contest);
    expect(contest.isResolved).equal(true);
    expect(contest.numEntries).equal(numEntries);
    expect(contest.winnerIds.length).equal(numWinners);

    const contestMetadata = await pg.account.contestMetadata.fetch(
      contestMetadataPda
    );
    const escrowTokenAccount = await getAccount(
      provider.connection,
      escrowTokenAccountPda
    );
    const feeTokenAccount = await getAccount(
      provider.connection,
      feeTokenAccountPda
    );
    const feePercent = contestMetadata.tokenDraftContestFeePercent;
    const feeAmount = feeTokenAccount.amount;

    console.log("escrowTokenAccount:", escrowTokenAccount.amount.toString());
    console.log("feeTokenAccount:", feeTokenAccount.amount.toString());
    console.log("feePercent:", feePercent.toString());

    // const ownerWithdrawal = web3.Keypair.generate();
    const ownerWithdrawal = signers[1];
    await provider.connection.requestAirdrop(
      ownerWithdrawal.publicKey,
      10 * 1_000_000_000
    );
    console.log("ownerWithdrawal:", ownerWithdrawal.publicKey.toString());
    let withdrawTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      ownerWithdrawal,
      mint,
      ownerWithdrawal.publicKey
    );
    console.log(
      "withdrawTokenAccount:",
      withdrawTokenAccount.amount.toString()
    );

    const withdrawFeeAccounts = {
      signer: signer.publicKey,
      config: configPda,
      feeTokenAccount: feeTokenAccountPda,
      withdrawalTokenAccount: withdrawTokenAccount.address,
      mint,
      tokenProgram: utils.token.TOKEN_PROGRAM_ID,
    };

    const withdrawFeeTx = await pg.methods
      .withdrawFee()
      .accounts(withdrawFeeAccounts)
      .signers([signer])
      .rpc();
    console.log("withdraw fee tx:", withdrawFeeTx);
    withdrawTokenAccount = await getAccount(
      provider.connection,
      withdrawTokenAccount.address
    );
    console.log(
      "withdrawTokenAccount:",
      withdrawTokenAccount.amount.toString()
    );
  });
});
