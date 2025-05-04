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
import { Account } from "@solana/spl-token";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Protocol } from "../target/types/protocol";
import { enterContest, pythPriceFeedIds, UNITS_PER_USDC } from "./helpers";
import { fixtureWithContest } from "./fixtures";

describe.skip("resolve", () => {
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

  it("resolve a token draft contest", async () => {
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
          signers: [signer],
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

    // const tx = await connection.getTransaction(sigs[2], {
    //   commitment: "confirmed",
    //   maxSupportedTransactionVersion: 0,
    // });
    // console.log("tx:", tx);
    // console.log("logs:", tx?.meta?.logMessages);

    // const contest = await pg.account.tokenDraftContest.fetch(contestPda);
    // console.log("contest:", contest);
    // const contestEntry = await pg.account.tokenDraftContestEntry.fetch(
    //   contestEntryPda
    // );
    // expect(contest.isResolved).equal(true);
  });
});
