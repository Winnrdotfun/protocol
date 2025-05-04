import { AnchorProvider, Program, utils, web3 } from "@coral-xyz/anchor";
import { createMint as createSplMint } from "@solana/spl-token";
import { Protocol as IWinnr } from "../../target/types/protocol";

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
  program: Program<IWinnr>;
  provider: AnchorProvider;
  initParams: { mint: web3.PublicKey; tokenDraftContestFeePercent: number };
}) => {
  const { provider, program: pg, initParams } = args;
  const { mint, tokenDraftContestFeePercent } = initParams;

  const signer = provider.wallet.payer;
  const programId = pg.programId;

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

  return {
    txSignature,
    configPda,
    contestMetadataPda,
    escrowTokenAccountPda,
    feeTokenAccountPda,
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
