import { AnchorProvider, BN, Program, web3 } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createContest,
  createMint,
  initializeProgram,
  UNITS_PER_USDC,
} from "../helpers";
import {
  Account,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Protocol as IWinnr } from "../../target/types/protocol";

export const fixtureBase = async (args: {
  provider: AnchorProvider;
  program: Program<IWinnr>;
  numSigners?: number;
}) => {
  const { provider, program } = args;
  const connection = provider.connection;
  const tokenDraftContestFeePercent = 10;

  // Create multiple test signers
  const wallet = provider.wallet;
  const signersCount = args.numSigners || 10;
  const signers = [
    wallet.payer,
    // Generate fixed signers
    ...Array.from({ length: signersCount - 1 }).map((_, i) =>
      web3.Keypair.fromSeed(Buffer.from(Array(32).fill(i + 1)))
    ),
  ];
  const signerTokenAccounts: Account[] = [];

  // Airdrop SOL to all signers
  for (const s of signers) {
    await connection.requestAirdrop(s.publicKey, 10000 * LAMPORTS_PER_SOL);
  }

  // Create a mint and airdrop minted token to all signers
  const mint = await createMint({ connection, owner: wallet.payer });
  for (const s of signers) {
    const tokenAcc = await getOrCreateAssociatedTokenAccount(
      connection,
      s,
      mint,
      s.publicKey
    );

    signerTokenAccounts.push(tokenAcc);

    await mintTo(
      connection,
      s,
      mint,
      tokenAcc.address,
      signers[0],
      10000 * UNITS_PER_USDC
    );
  }

  // Initialize the PythSolanaReceiver and HermesClient
  const pythSolanaReceiver = new PythSolanaReceiver({
    connection,
    wallet: wallet as any,
  });
  const priceServiceConnection = new HermesClient(
    "https://hermes.pyth.network/",
    {}
  );

  // Initialize the program
  const {
    txSignature,
    configPda,
    contestMetadataPda,
    escrowTokenAccountPda,
    feeTokenAccountPda,
  } = await initializeProgram({
    program,
    provider,
    initParams: { mint, tokenDraftContestFeePercent },
  });

  return {
    signers,
    signerTokenAccounts,
    mint,
    pythSolanaReceiver,
    priceServiceConnection,
    initializeTxSignature: txSignature,
    configPda,
    contestMetadataPda,
    escrowTokenAccountPda,
    feeTokenAccountPda,
  };
};

export const fixtureWithContest = async (args: {
  provider: AnchorProvider;
  program: Program<IWinnr>;
  contestParams?: {
    startTime: number;
    endTime: number;
    entryFee: bigint;
    maxEntries: number;
    priceFeedIds: string[];
    rewardAllocation: number[];
  };
  numSigners?: number;
}) => {
  const { provider, program, contestParams } = args;
  const baseFixture = await fixtureBase({ provider, program, ...args });
  const { pythSolanaReceiver, contestMetadataPda } = baseFixture;

  // Create a contest
  const contestRes = await createContest({
    program,
    provider,
    pythSolanaReceiver,
    contestMetadataPda,
    contestParams,
  });

  return {
    ...baseFixture,
    ...contestRes,
  };
};
