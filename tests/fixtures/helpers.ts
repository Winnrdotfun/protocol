import { FailedTransactionMetadata, LiteSVM } from "litesvm";
import { web3 } from "@coral-xyz/anchor";
import { Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  unpackAccount,
} from "@solana/spl-token";

export const createMint = (
  svm: LiteSVM,
  signer: web3.Keypair,
  decimals: number
) => {
  const mintKp = web3.Keypair.generate();
  const mint = mintKp.publicKey;

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: signer.publicKey,
      newAccountPubkey: mint,
      space: MINT_SIZE,
      lamports: 1000 * LAMPORTS_PER_SOL,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mint,
      decimals,
      signer.publicKey,
      signer.publicKey
    )
  );

  tx.recentBlockhash = svm.latestBlockhash();
  tx.feePayer = signer.publicKey;
  tx.sign(signer, mintKp);
  const data = svm.sendTransaction(tx);

  if (data instanceof FailedTransactionMetadata) {
    throw new Error(`Create mint transaction failed: ${data.toString()}`);
  }

  return mint;
};

export const createAssociateTokenAccount = (
  svm: LiteSVM,
  signer: web3.Keypair,
  mint: web3.PublicKey
) => {
  const associatedTokenAccountAddress = getAssociatedTokenAddressSync(
    mint,
    signer.publicKey
  );

  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      signer.publicKey,
      associatedTokenAccountAddress,
      signer.publicKey,
      mint
    )
  );
  tx.recentBlockhash = svm.latestBlockhash();
  tx.feePayer = signer.publicKey;
  tx.sign(signer);
  const data = svm.sendTransaction(tx);

  if (data instanceof FailedTransactionMetadata) {
    throw new Error(
      `Create associated token account transaction failed: ${data.toString()}`
    );
  }

  return associatedTokenAccountAddress;
};

export const mintTo = (
  svm: LiteSVM,
  mint: web3.PublicKey,
  destination: web3.PublicKey,
  authority: web3.Keypair,
  amount: number | bigint
) => {
  const tx = new Transaction().add(
    createMintToInstruction(mint, destination, authority.publicKey, amount)
  );
  tx.recentBlockhash = svm.latestBlockhash();
  tx.feePayer = authority.publicKey;
  tx.sign(authority);
  const data = svm.sendTransaction(tx);

  if (data instanceof FailedTransactionMetadata) {
    throw new Error(`Mint to transaction failed: ${data.toString()}`);
  }
};

export const getTokenAccount = (svm, address: web3.PublicKey) => {
  const accInfo = svm.getAccount(address);
  const acc = unpackAccount(address, accInfo);
  return acc;
};
