import { expect } from "chai";
import {
  AnchorProvider,
  setProvider,
  web3,
  workspace,
  BN,
} from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Protocol } from "../target/types/protocol";
import { hexToBase58, pythPriceFeedIds, UNITS_PER_USDC } from "./helpers";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { fixtureBase } from "./fixtures";

const { PublicKey } = web3;

describe.only("create", () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const pg = workspace.Protocol as Program<Protocol>;
  const programId = pg.programId;
  let mint: web3.PublicKey;
  let configPda: web3.PublicKey;
  let contestMetadataPda: web3.PublicKey;
  let signers: web3.Keypair[];
  let pythSolanaReceiver: PythSolanaReceiver;

  before(async () => {
    const res = await fixtureBase({ provider, program: pg });
    signers = res.signers;
    mint = res.mint;
    configPda = res.configPda;
    contestMetadataPda = res.contestMetadataPda;
    pythSolanaReceiver = res.pythSolanaReceiver;
    console.log("mint", mint.toBase58());
  });

  it("create a token draft contest", async () => {
    const signer = signers[0];
    const contestMetadata = await pg.account.contestMetadata.fetch(
      contestMetadataPda
    );
    const [contestPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("token_draft_contest"),
        contestMetadata.tokenDraftContestCount.toArrayLike(Buffer, "le", 8),
        signer.publicKey.toBuffer(),
      ],
      programId
    );
    const [contestCreditsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_draft_contest_credits"), contestPda.toBuffer()],
      programId
    );

    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = new BN(currentTime + 60 * 60); // 1 hour from now
    const endTime = new BN(startTime.toNumber() + 60 * 60 * 24); // 1 day from now
    const entryFee = new BN(10 * UNITS_PER_USDC);
    const maxEntries = 100;
    const priceFeedIds = [
      pythPriceFeedIds.bonk,
      pythPriceFeedIds.popcat,
      pythPriceFeedIds.wif,
      pythPriceFeedIds.trump,
    ];
    const tokenFeedIds = priceFeedIds.map((v) => new PublicKey(hexToBase58(v)));
    const feedAccounts = priceFeedIds.map((v) =>
      pythSolanaReceiver.getPriceFeedAccountAddress(0, v)
    );
    const winnerRewardAllocation = [40, 20, 20, 10, 10];
    const numWinners = winnerRewardAllocation.length;

    const accounts = {
      signer: signer.publicKey,
      contestMetadata: contestMetadataPda,
      contest: contestPda,
      contestCredits: contestCreditsPda,
      feed0: feedAccounts[0],
      feed1: feedAccounts[1] || null,
      feed2: feedAccounts[2] || null,
      feed3: feedAccounts[3] || null,
      feed4: feedAccounts[4] || null,
    };

    const sig = await pg.methods
      .createTokenDraftContest(
        startTime,
        endTime,
        entryFee,
        maxEntries,
        tokenFeedIds,
        Buffer.from(winnerRewardAllocation)
      )
      .accounts(accounts)
      .signers([signer])
      .rpc();
    console.log("Tx signature:", sig);
    console.log("Contest PDA:", contestPda.toBase58());

    const contest = await pg.account.tokenDraftContest.fetch(contestPda);
    const contestCredits = await pg.account.tokenDraftContestCredits.fetch(
      contestCreditsPda
    );

    expect(contest.id.toNumber()).equal(
      contestMetadata.tokenDraftContestCount.toNumber()
    );
    expect(contest.creator.toBase58()).equal(signer.publicKey.toBase58());
    expect(contest.startTime.toNumber()).equal(startTime.toNumber());
    expect(contest.endTime.toNumber()).equal(endTime.toNumber());
    expect(contest.entryFee.toString()).equal(entryFee.toString());
    expect(contest.maxEntries).equal(maxEntries);
    expect(contest.numEntries).equal(0);
    expect(contest.tokenFeedIds.length).equal(tokenFeedIds.length);
    for (let i = 0; i < tokenFeedIds.length; i++) {
      expect(contest.tokenFeedIds[i].toBase58()).equal(
        tokenFeedIds[i].toBase58()
      );
    }
    expect(contest.tokenStartPrices.length).equal(0);
    expect(contest.tokenRois.length).equal(0);
    expect(contestCredits.contestKey.toBase58()).equal(contestPda.toBase58());
    expect(contestCredits.creditAllocations.length).equal(0);
    expect(contest.winnerIds.length).equal(0);
    expect(contest.winnerRewardAllocation.length).equal(numWinners);
    for (let i = 0; i < numWinners; i++) {
      expect(contest.winnerRewardAllocation[i]).equal(
        winnerRewardAllocation[i]
      );
    }
  });
});
