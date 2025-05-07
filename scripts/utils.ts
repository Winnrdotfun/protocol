import fs from "fs";
import { utils, web3 } from "@coral-xyz/anchor";
import { chainConfig, env, program, wallet } from "./config";

export function loadWalletKey(keypairPath: string): web3.Keypair {
  const loaded = web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );
  return loaded;
}

export const hexToBase58 = (hex: string) => {
  const x = hex.startsWith("0x") ? hex.slice(2) : hex;
  const buffer = Buffer.from(x, "hex");
  return utils.bytes.bs58.encode(buffer);
};

export const logEnvInfo = () => {
  console.log(`Executing script on: ${env} (${chainConfig.rpc})`);
  console.log("Program ID:", program.programId.toBase58());
  console.log("Signer:", wallet.publicKey.toBase58());
  console.log("");
};
