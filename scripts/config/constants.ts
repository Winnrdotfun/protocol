import { web3 } from "@coral-xyz/anchor";
import { chainConfig, program } from "../config";

const { PublicKey } = web3;
const programId = program.programId;

export const mint = new PublicKey(chainConfig.usdcAddress);

export const [configPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("config")],
  programId
);

export const [contestMetadataPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("contest_metadata")],
  programId
);

export const [escrowTokenAccountPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow_token_account"), mint.toBuffer()],
  programId
);

export const [feeTokenAccountPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("fee_token_account"), mint.toBuffer()],
  programId
);
