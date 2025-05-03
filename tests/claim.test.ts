import {
  AnchorProvider,
  setProvider,
  web3,
  workspace,
  BN,
  utils,
} from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import {
  Account,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Protocol } from "../target/types/protocol";
import {
  createContest,
  createMint,
  enterContest,
  initializeProgram,
  pythPriceFeedIds,
  resolveContest,
} from "./helpers";

describe.skip("claim", () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const connection = provider.connection;
  const wallet = provider.wallet;
  const pg = workspace.Protocol as Program<Protocol>;
  const programId = pg.programId;
  const signer = wallet.payer;
  const signers = [
    signer,
    ...Array.from({ length: 5 }, () => web3.Keypair.generate()),
  ];

  let mint: web3.PublicKey;
  let configPda: web3.PublicKey;
  let contestMetadataPda: web3.PublicKey;
  let contestPda: web3.PublicKey;
  let programTokenAccountPda: web3.PublicKey;
  let signerTokenAccounts: Account[] = [];
  let contestEntryPda: web3.PublicKey;

  const pythSolanaReceiver = new PythSolanaReceiver({
    connection,
    wallet: wallet as any,
  });
  const priceServiceConnection = new HermesClient(
    "https://hermes.pyth.network/",
    {}
  );
  const priceFeedIds = [
    pythPriceFeedIds.bonk,
    pythPriceFeedIds.popcat,
    // pythPriceFeedIds.wif,
    // pythPriceFeedIds.trump,
  ];

  before(async () => {
    mint = await createMint({ connection, owner: signer });
    for (const s of signers) {
      await connection.requestAirdrop(s.publicKey, 100 * LAMPORTS_PER_SOL);
    }

    // Initialize the program
    const initRes = await initializeProgram({ program: pg, provider, mint });
    configPda = initRes.configPda;
    contestMetadataPda = initRes.contestMetadataPda;
    programTokenAccountPda = initRes.programTokenAccountPda;
    console.log("init:", initRes.txSignature);

    // Mint tokens
    for (const s of signers) {
      const acc = await getOrCreateAssociatedTokenAccount(
        connection,
        s,
        mint,
        s.publicKey
      );

      signerTokenAccounts.push(acc);

      await mintTo(
        connection,
        s,
        mint,
        acc.address,
        signer,
        10000 * LAMPORTS_PER_SOL
      );
    }

    // Create a contest
    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = new BN(currentTime + 60 * 60); // 1 hour from now
    const endTime = new BN(startTime.toNumber() + 60 * 60 * 24); // 1 day from now
    const contestParams = {
      startTime,
      endTime,
      entryFee: new BN(10 * LAMPORTS_PER_SOL),
      maxEntries: 100,
      priceFeedIds,
      rewardAllocation: [75, 25],
    };
    const createRes = await createContest({
      provider,
      program: pg,
      contestMetadataPda,
      pythSolanaReceiver,
      contestParams,
    });
    contestPda = createRes.contestPda;
    console.log("create:", createRes.txSignature);

    // Create contest entry for users
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
        programTokenAccountPda,
        signerTokenAccount: signerTokenAccounts[i],
        creditAllocation: creditAllocations[i],
      });

      console.log("enter:", txSignature);
    }

    // Resolve contest
    const resolveRes = await resolveContest({
      program: pg,
      signer,
      contestPda,
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
        programId
      );

      const accounts = {
        signer: signer.publicKey,
        config: configPda,
        contest: contestPda,
        contestEntry: contestEntryPda,
        mint,
        programTokenAccount: programTokenAccountPda,
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
