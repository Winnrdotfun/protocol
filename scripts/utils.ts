import fs from "fs";
import { web3 } from "@coral-xyz/anchor";

export function loadWalletKey(keypairPath: string): web3.Keypair {
  const loaded = web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );
  return loaded;
}
