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

export const pythPriceFeedIds = {
  bonk: "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
  popcat: "0xb9312a7ee50e189ef045aa3c7842e099b061bd9bdc99ac645956c3b660dc8cce",
  wif: "0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc",
  trump: "0x879551021853eec7a7dc827578e8e69da7e4fa8148339aa0d3d5296405be4b1a",
  bome: "0x30e4780570973e438fdb3f1b7ad22618b2fc7333b65c7853a7ca144c39052f7a",
};

export const usdcDecimals = 6;
export const unitsPerUsdc = 10 ** usdcDecimals;
