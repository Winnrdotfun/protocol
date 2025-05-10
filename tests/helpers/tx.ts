import { web3 } from "@coral-xyz/anchor";
import {
  LiteSVM,
  TransactionMetadata,
  FailedTransactionMetadata,
} from "litesvm";

export const sendSvmTransaction = (
  svm: LiteSVM,
  signer: web3.Keypair,
  tx: web3.Transaction | web3.VersionedTransaction
) => {
  const info = svm.sendTransaction(tx);
  if (info instanceof FailedTransactionMetadata) {
    throw new Error(`Transaction failed: ${info.toString()}`);
  }
  return info as TransactionMetadata;
};
