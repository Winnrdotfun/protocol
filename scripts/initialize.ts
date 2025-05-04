import fs from "fs";
import os from "os";
import path from "path";
import {
  AnchorProvider,
  Program,
  setProvider,
  utils,
  Wallet,
  web3,
  workspace,
} from "@coral-xyz/anchor";
import type { Protocol as IWinnr } from "../target/types/protocol";

const { PublicKey } = web3;

const mintAddress = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

const tokenDraftContestFeePercent = 10;
const cluster = "http://127.0.0.1:8899";
const walletPath = ".config/solana/id.json";

export const main = async () => {
  console.log("Initializing program...");
  const connection = new web3.Connection(cluster, "confirmed");
  const walletKeypair = loadWalletKey(path.join(os.homedir(), walletPath));
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet);
  setProvider(provider);
  const pg = workspace.Protocol as Program<IWinnr>;
  const programId = pg.programId;
  const signer = wallet.payer;

  const mint = new PublicKey(mintAddress);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );
  const [contestMetadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("contest_metadata")],
    programId
  );
  const [escrowTokenAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_token_account"), mint.toBuffer()],
    programId
  );
  const [feeTokenAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_token_account"), mint.toBuffer()],
    programId
  );

  const accounts = {
    signer: signer.publicKey,
    config: configPda,
    contestMetadata: contestMetadataPda,
    mint,
    escrowTokenAccount: escrowTokenAccountPda,
    feeTokenAccount: feeTokenAccountPda,
    tokenProgram: utils.token.TOKEN_PROGRAM_ID,
    systemProgram: web3.SystemProgram.programId,
  };

  const txSignature = await pg.methods
    .initialize(tokenDraftContestFeePercent)
    .accounts(accounts)
    .signers([signer])
    .rpc();
  console.log("Initialization tx signature:", txSignature);

  return {
    txSignature,
    configPda,
    contestMetadataPda,
    escrowTokenAccountPda,
    feeTokenAccountPda,
  };
};

function loadWalletKey(keypairPath: string): web3.Keypair {
  const loaded = web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );
  return loaded;
}

main()
  .then((result) => {
    console.log("Initialization successful!");
  })
  .catch((error) => {
    console.error("Error initializing program:", error);
  });
