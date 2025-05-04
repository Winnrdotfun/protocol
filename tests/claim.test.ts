import {
  AnchorProvider,
  setProvider,
  web3,
  workspace,
  utils,
} from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { Account } from "@solana/spl-token";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Protocol } from "../target/types/protocol";
import {
  enterContest,
  pythPriceFeedIds,
  resolveContest,
  UNITS_PER_USDC,
} from "./helpers";
import { fixtureWithContest } from "./fixtures";

describe.skip("claim", () => {
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
    // Resolve contest
    const resolveRes = await resolveContest({
      program: pg,
      signer: signers[0],
      mint,
      contestPda,
      contestCreditsPda,
      contestMetadataPda,
      escrowTokenAccountPda,
      feeTokenAccountPda,
      hermesClient: priceServiceConnection,
      pythSolanaReceiver,
    });
    console.log("resolve:", resolveRes.txSignatures);
  });

  it("resolve a token draft contest", async () => {
    const contest = await pg.account.tokenDraftContest.fetch(contestPda);
    const winnerIds = contest.winnerIds;

    for (const winnerId of winnerIds) {
      const signer = signers[winnerId];
      const [contestEntryPda] = web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("token_draft_contest_entry"),
          contestPda.toBuffer(),
          signer.publicKey.toBuffer(),
        ],
        pg.programId
      );

      const accounts = {
        signer: signer.publicKey,
        config: configPda,
        contest: contestPda,
        contestMetadata: contestMetadataPda,
        contestEntry: contestEntryPda,
        mint,
        escrowTokenAccount: escrowTokenAccountPda,
        feeTokenAccount: feeTokenAccountPda,
        signerTokenAccount: signerTokenAccounts[winnerId].address,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
      };

      const txSignature = await pg.methods
        .claimTokenDraftContest()
        .accounts(accounts)
        .signers([signer])
        .rpc();
      console.log("claim:", txSignature);
    }
  });
});
