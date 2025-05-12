import { web3 } from "@coral-xyz/anchor";
import {
  LiteSVM,
  TransactionMetadata,
  FailedTransactionMetadata,
} from "litesvm";

export const sendSvmTransaction = (
  svm: LiteSVM,
  signer: web3.Keypair | web3.Signer,
  tx: web3.Transaction | web3.VersionedTransaction
) => {
  if (tx instanceof web3.Transaction) {
    const recentBlockhash = svm.latestBlockhash();
    tx.recentBlockhash = recentBlockhash;
    tx.feePayer = signer.publicKey;
    tx.sign(signer);
  } else if (tx instanceof web3.VersionedTransaction) {
    tx.sign([signer]);
  }

  const info = svm.sendTransaction(tx);
  if (info instanceof FailedTransactionMetadata) {
    throw new Error(`Transaction failed: ${info.toString()}`);
  }
  return info as TransactionMetadata;
};
