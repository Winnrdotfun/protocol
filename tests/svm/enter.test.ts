import { expect } from "chai";
import { LiteSVM } from "litesvm";
import { web3, BN } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { fixtureWithContest } from "../fixtures/svm";
import {
  SEED_TOKEN_DRAFT_CONTEST_CREDITS,
  SEED_TOKEN_DRAFT_CONTEST_ENTRY,
} from "../helpers/constants";
import {
  ContestParams,
  pythPriceFeedIds,
  sendSvmTransaction,
  UNITS_PER_USDC,
} from "../helpers";
import { Protocol } from "../../target/types/protocol";
import { Account, TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";

const { PublicKey } = web3;

describe("enter", () => {
  let svm: LiteSVM;
  let pg: Program<Protocol>;
  let programId: web3.PublicKey;

  let mint: web3.PublicKey;
  let configPda: web3.PublicKey;
  let contestMetadataPda: web3.PublicKey;
  let programTokenAccountPda: web3.PublicKey;
  let contestPda: web3.PublicKey;
  let signers: web3.Keypair[];
  let signerTokenAccounts: Account[];
  let pythSolanaReceiver: PythSolanaReceiver;
  let contestParams: ContestParams;

  before(async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = currentTime + 60 * 60; // 1 hour from now
    const endTime = startTime + 60 * 60 * 24; // 1 day from now
    contestParams = {
      startTime,
      endTime,
      entryFee: BigInt(10 * UNITS_PER_USDC),
      maxEntries: 100,
      priceFeedIds: [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat],
      rewardAllocation: [50, 50],
    };
    const res = await fixtureWithContest({ contestParams, numSigners: 10 });

    pg = res.program;
    programId = res.program.programId;
    svm = res.svm;
    signers = res.signers;
    mint = res.mint;
    configPda = res.configPda;
    contestMetadataPda = res.contestMetadataPda;
    contestPda = res.contestPda;
    programTokenAccountPda = res.programTokenAccountPda;
    signerTokenAccounts = res.signerTokenAccounts;
    pythSolanaReceiver = res.pythSolanaReceiver;
  });

  it("enter a token draft contest", async () => {
    const signer = signers[0];
    const signerTokenAccount = signerTokenAccounts[0];

    const [contestEntryPda] = PublicKey.findProgramAddressSync(
      [
        SEED_TOKEN_DRAFT_CONTEST_ENTRY,
        contestPda.toBuffer(),
        signer.publicKey.toBuffer(),
      ],
      programId
    );
    const [contestCreditsPda] = PublicKey.findProgramAddressSync(
      [SEED_TOKEN_DRAFT_CONTEST_CREDITS, contestPda.toBuffer()],
      programId
    );

    const accounts = {
      signer: signer.publicKey,
      config: configPda,
      contest: contestPda,
      contestEntry: contestEntryPda,
      contestCredits: contestCreditsPda,
      mint,
      programTokenAccount: programTokenAccountPda,
      signerTokenAccount: signerTokenAccount.address,
      tokenProgram: TOKEN_PROGRAM_ID,
    };

    const creditAllocation = [35, 65];
    const creditAllocationInput = Buffer.from(creditAllocation);
    const ixs = await pg.methods
      .enterTokenDraftContest(creditAllocationInput)
      .accounts(accounts)
      .instruction();
    const msg = new web3.TransactionMessage({
      payerKey: signer.publicKey,
      instructions: [ixs],
      recentBlockhash: svm.latestBlockhash(),
    }).compileToV0Message();
    const tx = new web3.VersionedTransaction(msg);

    sendSvmTransaction(svm, signer, tx);

    const programTokenAccountAccInfo = svm.getAccount(programTokenAccountPda);
    const programTokenAccount = unpackAccount(
      programTokenAccountPda,
      programTokenAccountAccInfo as any
    );
    const contestAccInfo = svm.getAccount(contestPda);
    const contestEntryAccInfo = svm.getAccount(contestEntryPda);
    const contestCreditsAccInfo = svm.getAccount(contestCreditsPda);

    const contest = pg.coder.accounts.decode(
      "tokenDraftContest",
      Buffer.from(contestAccInfo.data)
    );
    const contestEntry = pg.coder.accounts.decode(
      "tokenDraftContestEntry",
      Buffer.from(contestEntryAccInfo.data)
    );
    const contestCredits = pg.coder.accounts.decode(
      "tokenDraftContestCredits",
      Buffer.from(contestCreditsAccInfo.data)
    );

    expect(contest.numEntries).equal(1);
    expect(contestEntry.id).equal(0);
    expect(contestEntry.user.toBase58()).equal(signer.publicKey.toBase58());
    expect(contestEntry.contestKey.toBase58()).equal(contestPda.toBase58());
    expect(contestEntry.creditAllocation.length).equal(creditAllocation.length);
    for (let i = 0; i < creditAllocation.length; i++) {
      expect(contestEntry.creditAllocation[i]).equal(creditAllocation[i]);
    }
    expect(contestEntry.hasClaimed).equal(false);
    expect(programTokenAccount.amount.toString()).equal(
      new BN(10 * UNITS_PER_USDC).toString()
    );

    expect(contestCredits.contestKey.toBase58()).equal(contestPda.toBase58());
    for (let i = 0; i < creditAllocation.length; i++) {
      expect(creditAllocation[i]).equal(contestCredits.creditAllocations[i]);
    }
  });
});
