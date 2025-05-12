import { web3 } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { Account, TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";
import { HermesClient } from "@pythnetwork/hermes-client";
import {
  getEnterContestTx,
  getPostPricesTxs,
  getResolveContestTx,
  ONE_DAY,
  ONE_HOUR,
  pythPriceFeedIds,
  sendSvmTransaction,
  UNITS_PER_USDC,
} from "../helpers";
import { Protocol } from "../../target/types/protocol";
import { fixtureWithContest } from "../fixtures/svm";
import { LiteSVM } from "litesvm";
import { setSvmTimeTo } from "../helpers/time";
import { expect } from "chai";
import { createAssociateTokenAccount } from "../fixtures/helpers";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

describe.only("withdrawFee", () => {
  let svm: LiteSVM;
  let pg: Program<Protocol>;
  let mint: web3.PublicKey;
  let configPda: web3.PublicKey;
  let contestMetadataPda: web3.PublicKey;
  let contestCreditsPda: web3.PublicKey;
  let contestPda: web3.PublicKey;
  let programTokenAccountPda: web3.PublicKey;
  let signers: web3.Keypair[];
  let signerTokenAccounts: Account[] = [];

  let pythSolanaReceiver: PythSolanaReceiver;
  let priceServiceConnection: HermesClient;
  let numWinners: number;
  const priceFeedIds = [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat];

  before(async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = currentTime - ONE_DAY; // 1 day ago
    const endTime = startTime + ONE_HOUR; // 1 hour from start
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
      contestParams,
    });

    svm = res.svm;
    pg = res.program;
    mint = res.mint;
    configPda = res.configPda;
    contestMetadataPda = res.contestMetadataPda;
    contestCreditsPda = res.contestCreditsPda;
    contestPda = res.contestPda;
    programTokenAccountPda = res.programTokenAccountPda;
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
      const { tx } = await getEnterContestTx({
        svm,
        signer: signers[i],
        program: pg,
        configPda,
        contestPda,
        mint,
        programTokenAccountPda,
        signerTokenAccount: signerTokenAccounts[i],
        creditAllocation: creditAllocations[i],
      });

      sendSvmTransaction(svm, signers[i], tx);
    }

    setSvmTimeTo(svm, contestParams.endTime + 1);

    // Post prices
    const { txs: txsPostPrices } = await getPostPricesTxs({
      svm,
      program: pg,
      signer: signers[0],
      contestPda,
      pythSolanaReceiver,
      hermesClient: priceServiceConnection,
    });
    for (const tx of txsPostPrices) {
      sendSvmTransaction(svm, signers[0], tx);
    }

    // Resolve contest
    const { txs: txResolve } = await getResolveContestTx({
      svm,
      program: pg,
      signer: signers[0],
      mint,
      contestPda,
      contestCreditsPda,
      contestMetadataPda,
      programTokenAccountPda,
      hermesClient: priceServiceConnection,
      pythSolanaReceiver,
    });
    for (const tx of txResolve) {
      sendSvmTransaction(svm, signers[0], tx);
    }
  });

  it("withdraw a token draft contest fee", async () => {
    const contestMetadataAccInfo = svm.getAccount(contestMetadataPda);
    const contestMetadata = pg.coder.accounts.decode(
      "contestMetadata",
      Buffer.from(contestMetadataAccInfo.data)
    );
    const signer = signers[0];

    const owner = web3.Keypair.generate();
    svm.airdrop(owner.publicKey, BigInt(LAMPORTS_PER_SOL));
    const withdrawalTokenAccountAddress = createAssociateTokenAccount(
      svm,
      owner,
      mint
    );
    const accounts = {
      signer: signer.publicKey,
      config: configPda,
      contestMetadata: contestMetadataPda,
      mint,
      programTokenAccount: programTokenAccountPda,
      withdrawalTokenAccount: withdrawalTokenAccountAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
    };

    const ixs = await pg.methods.withdrawFee().accounts(accounts).instruction();
    const msg = new web3.TransactionMessage({
      payerKey: signer.publicKey,
      instructions: [ixs],
      recentBlockhash: svm.latestBlockhash(),
    }).compileToV0Message();
    const tx = new web3.VersionedTransaction(msg);
    sendSvmTransaction(svm, signer, tx);

    const withdrawalTokenAccountAccInfo = svm.getAccount(
      withdrawalTokenAccountAddress
    );
    const withdrawalTokenAccount = unpackAccount(
      withdrawalTokenAccountAddress,
      withdrawalTokenAccountAccInfo as any
    );

    const feeAmount = contestMetadata.tokenDraftContestFeeAmount.toString();
    expect(withdrawalTokenAccount.amount.toString()).to.equal(feeAmount);
  });
});
