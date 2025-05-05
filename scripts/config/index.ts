import os from "os";
import path from "path";
import {
  AnchorProvider,
  Program,
  Wallet,
  web3,
  workspace,
} from "@coral-xyz/anchor";
import dotenv from "dotenv";
import type { Protocol as IWinnr } from "../../target/types/protocol";
import { loadWalletKey } from "../utils";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { HermesClient } from "@pythnetwork/hermes-client";
dotenv.config();

const args = process.argv as string[];
export const envs = ["localnet", "devnet", "mainnet"];

export const env = args[2] ? args[2] : "localnet";
if (!envs.includes(env)) {
  throw new Error(
    `Invalid environment. Please use one of the following: ${envs.join(", ")}`
  );
}

export const rpcLocalnet = process.env.RPC_LOCALNET as string;
export const rpcDevnet = process.env.RPC_DEVNET as string;
export const rpcMainnet = process.env.RPC_MAINNET as string;
export const walletPath = process.env.WALLET_PATH as string;

export const chainConfigs = {
  localnet: {
    rpc: rpcLocalnet,
    // Using mainnet clone
    usdcAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  devnet: {
    rpc: rpcDevnet,
    usdcAddress: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  },
  mainnet: {
    rpc: rpcMainnet,
    usdcAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
};

export const chainConfig = chainConfigs[env];
export const connection = new web3.Connection(chainConfig.rpc, "confirmed");
export const walletKeypair = loadWalletKey(path.join(os.homedir(), walletPath));
export const wallet = new Wallet(walletKeypair);
export const provider = new AnchorProvider(connection, wallet);
export const program = workspace.Protocol as Program<IWinnr>;

export const pythSolanaReceiver = new PythSolanaReceiver({
  connection,
  wallet: wallet as any,
});
export const priceServiceConnection = new HermesClient(
  "https://hermes.pyth.network/",
  {}
);

export * from "./constants";
