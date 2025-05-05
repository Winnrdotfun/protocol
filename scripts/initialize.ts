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

const tokenDraftContestFeePercent = 10;

export const main = async () => {
  console.log(`Executing script on: ${env} (${chainConfig.rpc})`);

  const signer = wallet.payer;

  const accounts = {
    signer: signer.publicKey,
    config: configPda,
    contestMetadata: contestMetadataPda,
    mint,
    escrowTokenAccount: escrowTokenAccountPda,
    feeTokenAccount: feeTokenAccountPda,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: web3.SystemProgram.programId,
  };

  const tx = await program.methods
    .initialize(tokenDraftContestFeePercent)
    .accounts(accounts)
    .transaction();

  tx.recentBlockhash = await connection
    .getLatestBlockhash()
    .then((r) => r.blockhash);
  tx.feePayer = wallet.publicKey;

  const signedTx = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: true,
  });
  console.log("Initialization tx signature:", sig);
};

main()
  .then((res) => {
    console.log("Initialization successful!");
  })
  .catch((error) => {
    console.error("Error initializing program:", error);
  });
