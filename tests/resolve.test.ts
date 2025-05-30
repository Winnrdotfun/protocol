import { web3, BN } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { Account, unpackAccount } from "@solana/spl-token";
import { HermesClient } from "@pythnetwork/hermes-client";
import {
  ContestParams,
  getEnterContestTx,
  getPostPricesTxs,
  pythPriceFeedIds,
  sendSvmTransaction,
  UNITS_PER_USDC,
} from "./helpers";
import { expect } from "chai";
import { fixtureWithContest } from "./fixtures";
import { ONE_DAY, ONE_HOUR } from "./helpers";
import { LiteSVM } from "litesvm";
import { Protocol } from "../target/types/protocol";
import { setSvmTimeTo } from "./helpers/time";

describe("resolve", () => {
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
  const priceFeedIds = [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat];
  let numTokens: number = priceFeedIds.length;
  let numEntries: number;
  let numWinners: number;
  let contestParams: ContestParams;

  before(async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = currentTime - ONE_DAY; // 1 day ago
    const endTime = startTime + ONE_HOUR; // 1 hour from start
    contestParams = {
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
      numSigners: 10,
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

    for (let i = 0; i < creditAllocations.length; i++) {
      const { tx } = await getEnterContestTx({
        svm,
        program: pg,
        configPda,
        contestPda,
        mint,
        programTokenAccountPda,
        signer: signers[i],
        signerTokenAccount: signerTokenAccounts[i],
        creditAllocation: creditAllocations[i],
      });

      sendSvmTransaction(svm, signers[i], tx);
    }

    const { txs } = await getPostPricesTxs({
      svm,
      program: pg,
      signer: signers[0],
      contestPda,
      pythSolanaReceiver,
      hermesClient: priceServiceConnection,
    });

    setSvmTimeTo(svm, contestParams.endTime + 1);

    for (const tx of txs) {
      sendSvmTransaction(svm, signers[0], tx);
    }
  });
  it("resolve a token draft contest", async () => {
    const signer = signers[0];
    let contestMetadataAccInfo = svm.getAccount(contestMetadataPda);
    let contestMetadata = pg.coder.accounts.decode(
      "contestMetadata",
      Buffer.from(contestMetadataAccInfo.data)
    );
    let contestAccInfo = svm.getAccount(contestPda);
    let contest = pg.coder.accounts.decode(
      "tokenDraftContest",
      Buffer.from(contestAccInfo.data)
    );

    const accounts = {
      signer: signer.publicKey,
      contestMetadata: contestMetadataPda,
      contest: contestPda,
      contestCredits: contestCreditsPda,
    };

    const tx = await pg.methods
      .resolveTokenDraftContest()
      .accounts(accounts)
      .transaction();
    sendSvmTransaction(svm, signer, tx);

    contestAccInfo = svm.getAccount(contestPda);
    contest = pg.coder.accounts.decode(
      "tokenDraftContest",
      Buffer.from(contestAccInfo.data)
    );

    contestAccInfo = svm.getAccount(contestPda);
    contestMetadataAccInfo = svm.getAccount(contestMetadataPda);
    const programTokenAccountAccInfo = svm.getAccount(programTokenAccountPda);
    contest = pg.coder.accounts.decode(
      "tokenDraftContest",
      Buffer.from(contestAccInfo.data)
    );
    contestMetadata = pg.coder.accounts.decode(
      "contestMetadata",
      Buffer.from(contestMetadataAccInfo.data)
    );
    const programTokenAccount = unpackAccount(
      programTokenAccountPda,
      programTokenAccountAccInfo as any
    );

    const totalPoolAmount = contest.entryFee.mul(new BN(contest.numEntries));
    const feePercent = contestMetadata.tokenDraftContestFeePercent;
    const feeAmount = totalPoolAmount.mul(new BN(feePercent)).div(new BN(100));

    expect(contest.isResolved).equal(true);
    expect(contest.numEntries).equal(numEntries);
    expect(contest.winnerIds.length).equal(numWinners);
    expect(programTokenAccount.amount.toString()).equal(
      totalPoolAmount.toString()
    );
    expect(contestMetadata.tokenDraftContestFeeAmount.toString()).equal(
      feeAmount.toString()
    );
  });
});
