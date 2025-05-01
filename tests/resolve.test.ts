import { expect } from "chai";
import {
  AnchorProvider,
  setProvider,
  web3,
  workspace,
  BN,
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
  enterContest,
  initializeProgram,
  pythPriceFeedIds,
} from "./helpers";

describe.skip("resolve", () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const connection = provider.connection;
  const wallet = provider.wallet;
  const signer = wallet.payer;
  const pg = workspace.Protocol as Program<Protocol>;
  const programId = pg.programId;
  let mint: web3.PublicKey;
  let configPda: web3.PublicKey;
  let contestMetadataPda: web3.PublicKey;
  let contestPda: web3.PublicKey;
  let programTokenAccountPda: web3.PublicKey;
  let signerTokenAccount: Account;
  let contestEntryPda: web3.PublicKey;
  const pythSolanaReceiver = new PythSolanaReceiver({
    connection,
    wallet: wallet as any,
  });
  const priceServiceConnection = new HermesClient(
    "https://hermes.pyth.network/",
    {}
  );
  const priceFeedIds = [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat];

  before(async () => {
    // Initialize the program
    const initRes = await initializeProgram({ program: pg, provider });
    mint = initRes.mint;
    configPda = initRes.configPda;
    contestMetadataPda = initRes.contestMetadataPda;
    programTokenAccountPda = initRes.programTokenAccountPda;
    console.log("init:", initRes.txSignature);

    // Mint tokens
    signerTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      signer,
      mint,
      signer.publicKey
    );
    await mintTo(
      connection,
      signer,
      mint,
      signerTokenAccount.address,
      signer,
      10000 * LAMPORTS_PER_SOL
    );

    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = new BN(currentTime + 60 * 60); // 1 hour from now
    const endTime = new BN(startTime.toNumber() + 60 * 60 * 24); // 1 day from now
    const contestParams = {
      startTime,
      endTime,
      entryFee: new BN(10 * LAMPORTS_PER_SOL),
      maxEntries: 100,
      numWinners: 10,
      priceFeedIds,
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

    const pta = await pg.account.config.fetch(configPda);
    console.log("pta:", pta);
    console.log("programTokenAccountPda:", programTokenAccountPda.toBase58());

    const [ptaPda] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("token_account"), mint.toBuffer()],
      programId
    );

    const enterRes = await enterContest({
      provider,
      program: pg,
      configPda,
      contestPda,
      programTokenAccountPda: ptaPda,
      mint,
      signerTokenAccount: signerTokenAccount.address,
      creditAllocation: [50_000, 50_000],
    });
    contestEntryPda = enterRes.contestEntryPda;
    console.log("enter:", enterRes.txSignature);
  });

  it("resolve a token draft contest", async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 60 * 60 * 24; // 1 day ago
    const priceUpdates =
      await priceServiceConnection.getPriceUpdatesAtTimestamp(
        timestamp,
        priceFeedIds,
        { encoding: "base64" }
      );

    console.log("Price updates:", priceUpdates);

    // const accounts = {
    //   signer: signer.publicKey,
    //   contest: contestPda,
    // };

    // const txSignature = await pg.methods
    //   .resolveTokenDraftContest()
    //   .accounts(accounts)
    //   .signers([signer])
    //   .rpc();

    // console.log("Transaction signature", txSignature);
    // const contest = await pg.account.tokenDraftContest.fetch(contestPda);
    // console.log("Contest:", contest);
  });
});
