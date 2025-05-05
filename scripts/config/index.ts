import os from "os";
import path from "path";
import {
  AnchorProvider,
  Program,
  Wallet,
  web3,
  workspace,
} from "@coral-xyz/anchor";
import type { Protocol as IWinnr } from "../../target/types/protocol";
import { loadWalletKey } from "../utils";
import dotenv from "dotenv";

dotenv.config();

export const env = "localnet";

export const rpcLocal = process.env.RPC_LOCAL as string;
export const rpcDevnet = process.env.RPC_DEVNET as string;
export const rpcMainnet = process.env.RPC_MAINNET as string;
export const walletPath = process.env.WALLET_PATH as string;

export const chainConfigs = {
  localnet: {
    rpc: rpcLocal,
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

// export const cluster = chainConfig[env].rpc;
export const chainConfig = chainConfigs[env];
export const connection = new web3.Connection(chainConfig.rpc, "confirmed");
// export const walletKeypair = loadWalletKey(walletPath);
export const walletKeypair = loadWalletKey(path.join(os.homedir(), walletPath));
export const wallet = new Wallet(walletKeypair);
export const provider = new AnchorProvider(connection, wallet);
export const program = workspace.Protocol as Program<IWinnr>;

export * from "./constants";
