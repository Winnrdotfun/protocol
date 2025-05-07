import { expect } from "chai";
import {
  AnchorProvider,
  setProvider,
  web3,
  workspace,
  BN,
  utils,
} from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { Account, getAccount } from "@solana/spl-token";
import { Protocol } from "../target/types/protocol";
import { ContestParams, pythPriceFeedIds, UNITS_PER_USDC } from "./helpers";
import { fixtureWithContest } from "./fixtures";

const { PublicKey } = web3;

describe("enter", () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const connection = provider.connection;
  const pg = workspace.Protocol as Program<Protocol>;
  const programId = pg.programId;

  let mint: web3.PublicKey;
  let configPda: web3.PublicKey;
  let contestMetadataPda: web3.PublicKey;
  let contestPda: web3.PublicKey;
  let escrowTokenAccountPda: web3.PublicKey;
  let feeTokenAccountPda: web3.PublicKey;
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

    const res = await fixtureWithContest({
      provider,
      program: pg,
      contestParams,
    });
    signers = res.signers;
    mint = res.mint;
    configPda = res.configPda;
    contestMetadataPda = res.contestMetadataPda;
    contestPda = res.contestPda;
    escrowTokenAccountPda = res.escrowTokenAccountPda;
    feeTokenAccountPda = res.feeTokenAccountPda;
    pythSolanaReceiver = res.pythSolanaReceiver;
    signerTokenAccounts = res.signerTokenAccounts;
  });

  it("enter a token draft contest", async () => {
    const signer = signers[0];
    const signerTokenAccount = signerTokenAccounts[0];

    const [contestEntryPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("token_draft_contest_entry"),
        contestPda.toBuffer(),
        signer.publicKey.toBuffer(),
      ],
      programId
    );
    const [contestCreditsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_draft_contest_credits"), contestPda.toBuffer()],
      programId
    );

    const accounts = {
      signer: signer.publicKey,
      config: configPda,
      contest: contestPda,
      contestEntry: contestEntryPda,
      contestCredits: contestCreditsPda,
      mint,
      escrowTokenAccount: escrowTokenAccountPda,
      feeTokenAccount: feeTokenAccountPda,
      signerTokenAccount: signerTokenAccount.address,
      tokenProgram: utils.token.TOKEN_PROGRAM_ID,
    };

    const creditAllocation = [35, 65];
    const creditAllocationInput = Buffer.from(creditAllocation);
    const txSignature = await pg.methods
      .enterTokenDraftContest(creditAllocationInput)
      .accounts(accounts)
      .signers([signer])
      .rpc();

    console.log("Transaction signature", txSignature);

    const programTokenAccount = await getAccount(
      connection,
      escrowTokenAccountPda
    );

    const contest = await pg.account.tokenDraftContest.fetch(contestPda);
    const contestEntry = await pg.account.tokenDraftContestEntry.fetch(
      contestEntryPda
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

    const contestCredits = await pg.account.tokenDraftContestCredits.fetch(
      contestCreditsPda
    );
    expect(contestCredits.contestKey.toBase58()).equal(contestPda.toBase58());
    for (let i = 0; i < creditAllocation.length; i++) {
      expect(creditAllocation[i]).equal(contestCredits.creditAllocations[i]);
    }
  });
});
