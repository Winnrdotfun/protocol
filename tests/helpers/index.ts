import { AnchorProvider, Program, utils, web3 } from "@coral-xyz/anchor";
import { createMint as createSplMint } from "@solana/spl-token";
import { Protocol as IWinnr } from "../../target/types/protocol";

const { PublicKey } = web3;

export type ContestParams = {
  startTime: number;
  endTime: number;
  entryFee: bigint;
  maxEntries: number;
  priceFeedIds: string[];
  rewardAllocation: number[];
};

export const createMint = async (args: {
  connection: web3.Connection;
  owner: web3.Keypair;
}) => {
  const mint = await createSplMint(
    args.connection,
    args.owner,
    args.owner.publicKey,
    args.owner.publicKey,
    USDC_DECIMALS
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
  const connection = provider.connection;

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

  const initConfigAccounts = {
    signer: signer.publicKey,
    config: configPda,
    contestMetadata: contestMetadataPda,
    mint,
  };

  const initTokenAccountsAccounts = {
    signer: signer.publicKey,
    config: configPda,
    mint,
    escrowTokenAccount: escrowTokenAccountPda,
    feeTokenAccount: feeTokenAccountPda,
    tokenProgram: utils.token.TOKEN_PROGRAM_ID,
  };

  const recentBlockhash = await connection.getLatestBlockhash();
  const ixs0 = await pg.methods
    .initConfig(tokenDraftContestFeePercent)
    .accounts(initConfigAccounts)
    .instruction();
  const ixs1 = await pg.methods
    .initTokenAccounts()
    .accounts(initTokenAccountsAccounts)
    .instruction();
  const msg = new web3.TransactionMessage({
    payerKey: signer.publicKey,
    instructions: [ixs0, ixs1],
    recentBlockhash: recentBlockhash.blockhash,
  }).compileToV0Message();

  const tx = new web3.VersionedTransaction(msg);
  tx.sign([signer]);
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  await connection.confirmTransaction({
    blockhash: recentBlockhash.blockhash,
    lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
    signature: sig,
  });
  console.log("Tx signature:", sig);

  return {
    txSignature: sig,
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

export const now = () => Math.floor(Date.now() / 1000);

export const USDC_DECIMALS = 6;
export const UNITS_PER_USDC = 10 ** USDC_DECIMALS;

export * from "./pyth";
export * from "./contest";
export * from "./tx";
export * from "./constants";
