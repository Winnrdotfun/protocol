import { AnchorProvider, Program, utils, web3 } from "@coral-xyz/anchor";
import { createMint as createSplMint } from "@solana/spl-token";
import { Protocol } from "../../target/types/protocol";

const { PublicKey } = web3;

export const createMint = async (args: {
  connection: web3.Connection;
  owner: web3.Keypair;
}) => {
  const mint = await createSplMint(
    args.connection,
    args.owner,
    args.owner.publicKey,
    args.owner.publicKey,
    9
  );

  return mint;
};

export const initializeProgram = async (args: {
  program: Program<Protocol>;
  provider: AnchorProvider;
  mint?: web3.PublicKey;
}) => {
  const { provider, program: pg } = args;
  let mint = args.mint;
  const connection = provider.connection;
  const signer = provider.wallet.payer;
  const programId = pg.programId;

  if (!mint) {
    mint = await createMint({ connection, owner: signer });
  }

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );
  const [contestMetadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("contest_metadata")],
    programId
  );
  const [programTokenAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_account"), mint.toBuffer()],
    programId
  );

  const accounts = {
    signer: signer.publicKey,
    config: configPda,
    contestMetadata: contestMetadataPda,
    mint,
    tokenAccount: programTokenAccountPda,
    tokenProgram: utils.token.TOKEN_PROGRAM_ID,
    systemProgram: web3.SystemProgram.programId,
  };

  const txSignature = await pg.methods
    .initialize()
    .accounts(accounts)
    .signers([signer])
    .rpc();

  return {
    txSignature,
    mint,
    configPda,
    contestMetadataPda,
    programTokenAccountPda,
  };
};

export const hexToBase58 = (hex: string) => {
  const x = hex.startsWith("0x") ? hex.slice(2) : hex;
  const buffer = Buffer.from(x, "hex");
  return utils.bytes.bs58.encode(buffer);
};

export const USDC_DECIMALS = 6;
export const UNITS_PER_USDC = 10 ** USDC_DECIMALS;

export * from "./pyth";
export * from "./contest";
