import { web3, utils } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { Account, unpackAccount } from "@solana/spl-token";
import { HermesClient } from "@pythnetwork/hermes-client";
import {
  getEnterContestTx,
  getPostPricesTxs,
  getResolveContestTx,
  ONE_DAY,
  ONE_HOUR,
  pythPriceFeedIds,
  SEED_TOKEN_DRAFT_CONTEST_ENTRY,
  sendSvmTransaction,
  UNITS_PER_USDC,
} from "./helpers";
import { Protocol } from "../target/types/protocol";
import { fixtureWithContest } from "./fixtures";
import { LiteSVM } from "litesvm";
import { setSvmTimeTo } from "./helpers/time";
import { expect } from "chai";

describe("withdraw", () => {
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
  let numEntries: number;
  const priceFeedIds = [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat];
  const numTokens: number = priceFeedIds.length;

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
    numEntries = creditAllocations.length;

    for (let i = 0; i < numWinners - 1; i++) {
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
    const { tx } = await getResolveContestTx({
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
    sendSvmTransaction(svm, signers[0], tx);
  });

  it("withdraw a token draft contest entry fee", async () => {
    let contestAccInfo = svm.getAccount(contestPda);
    let contest = pg.coder.accounts.decode(
      "tokenDraftContest",
      Buffer.from(contestAccInfo.data)
    );

    for (let i = 0; i < numWinners - 1; i++) {
      const signer = signers[i];
      const signerTokenAccount = signerTokenAccounts[i];
      const [contestEntryPda] = web3.PublicKey.findProgramAddressSync(
        [
          SEED_TOKEN_DRAFT_CONTEST_ENTRY,
          contestPda.toBuffer(),
          signer.publicKey.toBuffer(),
        ],
        pg.programId
      );

      const accounts = {
        signer: signer.publicKey,
        contest: contestPda,
        contestEntry: contestEntryPda,
        mint,
        programTokenAccount: programTokenAccountPda,
        signerTokenAccount: signerTokenAccount.address,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
      };

      const ix = await pg.methods
        .withdrawEntryFee()
        .accounts(accounts)
        .instruction();

      const msg = new web3.TransactionMessage({
        payerKey: signer.publicKey,
        instructions: [ix],
        recentBlockhash: svm.latestBlockhash(),
      }).compileToV0Message();
      const tx = new web3.VersionedTransaction(msg);
      sendSvmTransaction(svm, signers[i], tx);
    }

    contestAccInfo = svm.getAccount(contestPda);
    contest = pg.coder.accounts.decode(
      "tokenDraftContest",
      Buffer.from(contestAccInfo.data)
    );

    const programTokenAccountAccInfo = svm.getAccount(programTokenAccountPda);
    const programTokenAccount = unpackAccount(
      programTokenAccountPda,
      programTokenAccountAccInfo as any
    );

    expect(contest.winnerIds.length).to.equal(0);
    expect(programTokenAccount.amount.toString()).to.equal("0");
  });
});
