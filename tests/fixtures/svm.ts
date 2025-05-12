import fs from "fs";
import { LiteSVM } from "litesvm";
import {
  AnchorProvider,
  BN,
  Program,
  setProvider,
  web3,
  workspace,
} from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getCreateContestTx,
  sendSvmTransaction,
  USDC_DECIMALS,
} from "../helpers";
import { Account, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  createAssociateTokenAccount,
  createMint,
  getTokenAccount,
  mintTo,
} from "./helpers";
import { fixtureAccounts, fixturePrograms, programInfo } from "./constants";
import { Protocol } from "../../target/types/protocol";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { HermesClient } from "@pythnetwork/hermes-client";
import {
  SEED_CONFIG,
  SEED_CONTEST_METADATA,
  SEED_PROGRAM_TOKEN_ACCOUNT,
} from "../helpers/constants";

const { PublicKey } = web3;

export const fixtureSvmBase = async (args: { numSigners?: number }) => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const program = workspace.Protocol as Program<Protocol>;

  const svm = new LiteSVM().withSplPrograms();
  svm.addProgramFromFile(programInfo.address, programInfo.file);

  // Add present programs
  for (const program of Object.values(fixturePrograms)) {
    svm.addProgramFromFile(
      new web3.PublicKey(program.address),
      program.programFile
    );
  }

  // Add preset accounts
  for (const accountInfo of Object.values(fixtureAccounts)) {
    const accountData = JSON.parse(
      fs.readFileSync(accountInfo.accountFile, "utf-8")
    );
    const account = {
      lamports: accountData.account.lamports,
      data: Buffer.from(accountData.account.data[0], "base64"),
      owner: new web3.PublicKey(accountData.account.owner),
      executable: accountData.account.executable,
    };

    const address = new web3.PublicKey(accountInfo.address);
    svm.setAccount(address, account);
  }

  const signersCount = args.numSigners || 10;

  // Generate fixed signers
  const signers = [
    provider.wallet.payer,
    ...Array.from({ length: signersCount - 1 }).map((_, i) =>
      web3.Keypair.fromSeed(Buffer.from(Array(32).fill(i + 1)))
    ),
  ];

  // Airdrop SOL to all signers
  for (const s of signers) {
    svm.airdrop(s.publicKey, BigInt(10_000 * LAMPORTS_PER_SOL));
  }

  // Create mint
  const mintAuthority = signers[0];
  const mint = createMint(svm, mintAuthority, USDC_DECIMALS);

  // Airdrop minted token to all signers
  const signerTokenAccounts: Account[] = [];
  for (const s of signers) {
    const tokenAccountAddress = createAssociateTokenAccount(svm, s, mint);
    signerTokenAccounts.push(getTokenAccount(svm, tokenAccountAddress));

    mintTo(
      svm,
      mint,
      tokenAccountAddress,
      mintAuthority,
      10_000 * LAMPORTS_PER_SOL
    );
  }

  // Initialize the PythSolanaReceiver and HermesClient
  const pythSolanaReceiver = new PythSolanaReceiver({
    connection: provider.connection,
    wallet: provider.wallet as any,
  });
  const priceServiceConnection = new HermesClient(
    "https://hermes.pyth.network/",
    {}
  );

  return {
    svm,
    signers,
    signerTokenAccounts,
    mint,
    pythSolanaReceiver,
    priceServiceConnection,
    provider,
    program,
  };
};

export const fixtureInitialization = async (args: { numSigners?: number }) => {
  const res = await fixtureSvmBase(args);
  const { svm, signers, mint, program: pg } = res;

  const programId = pg.programId;
  const signer = signers[0];

  const [configPda] = PublicKey.findProgramAddressSync(
    [SEED_CONFIG],
    programId
  );
  const [contestMetadataPda] = PublicKey.findProgramAddressSync(
    [SEED_CONTEST_METADATA],
    programId
  );
  const [programTokenAccountPda] = PublicKey.findProgramAddressSync(
    [SEED_PROGRAM_TOKEN_ACCOUNT, mint.toBuffer()],
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
    programTokenAccount: programTokenAccountPda,
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const tokenDraftContestFeePercent = 10;

  const recentBlockhash = svm.latestBlockhash();
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
    recentBlockhash: recentBlockhash,
  }).compileToV0Message();

  const tx = new web3.VersionedTransaction(msg);
  tx.sign([signer]);

  sendSvmTransaction(svm, signer, tx);

  return {
    ...res,
    configPda,
    contestMetadataPda,
    programTokenAccountPda,
  };
};

export const fixtureWithContest = async (args: {
  contestParams: {
    startTime: number;
    endTime: number;
    entryFee: bigint;
    maxEntries: number;
    priceFeedIds: string[];
    rewardAllocation: number[];
  };
  numSigners?: number;
}) => {
  const { contestParams } = args;
  const baseFixture = await fixtureInitialization(args);
  const { svm, contestMetadataPda, program, pythSolanaReceiver, signers } =
    baseFixture;

  const signer = signers[0];

  const contestParams_ = {
    startTime: contestParams.startTime,
    endTime: contestParams.endTime,
    entryFee: contestParams.entryFee,
    maxEntries: contestParams.maxEntries,
    priceFeedIds: contestParams.priceFeedIds,
    rewardAllocation: contestParams.rewardAllocation,
  };

  // Create a contest
  const { tx, contestPda, contestCreditsPda } = await getCreateContestTx({
    signer,
    svm,
    program,
    contestMetadataPda,
    contestParams: contestParams_,
    pythSolanaReceiver,
  });

  const txInfo = sendSvmTransaction(svm, signer, tx);

  return {
    ...baseFixture,
    txInfo,
    contestPda,
    contestCreditsPda,
  };
};
