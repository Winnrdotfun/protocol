import { web3 } from "@coral-xyz/anchor";
import {
  chainConfig,
  configPda,
  connection,
  contestMetadataPda,
  env,
  escrowTokenAccountPda,
  feeTokenAccountPda,
  mint,
  program,
  wallet,
} from "./config";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { logEnvInfo } from "./utils";

const tokenDraftContestFeePercent = 10;

export const main = async () => {
  const signer = wallet.payer;

  logEnvInfo();

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
    tokenProgram: TOKEN_PROGRAM_ID,
  };

  const recentBlockhash = await connection.getLatestBlockhash();
  const ixs0 = await program.methods
    .initConfig(tokenDraftContestFeePercent)
    .accounts(initConfigAccounts)
    .instruction();
  const ixs1 = await program.methods
    .initTokenAccounts()
    .accounts(initTokenAccountsAccounts)
    .instruction();
  const txMessage = new web3.TransactionMessage({
    payerKey: signer.publicKey,
    instructions: [ixs0, ixs1],
    recentBlockhash: recentBlockhash.blockhash,
  }).compileToV0Message();
  const tx = new web3.VersionedTransaction(txMessage);
  tx.sign([signer]);
  // const sig = await connection.simulateTransaction(tx);
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  await connection.confirmTransaction({
    blockhash: recentBlockhash.blockhash,
    lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
    signature: sig,
  });
  console.log("Tx signature:", sig);
};

main()
  .then((res) => {
    console.log("Initialization successful!");
  })
  .catch((error) => {
    console.error("Error initializing program:", error);
  });
