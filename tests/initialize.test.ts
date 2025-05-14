import {
  AnchorProvider,
  setProvider,
  web3,
  workspace,
  utils,
} from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Protocol } from "../target/types/protocol";
import { createMint } from "./helpers";
import { expect } from "chai";
import { getAccount } from "@solana/spl-token";

const { PublicKey } = web3;

describe.skip("initialize", () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const connection = provider.connection;
  const wallet = provider.wallet;
  const signer = wallet.payer;
  const pg = workspace.Protocol as Program<Protocol>;
  const programId = pg.programId;
  let mint: web3.PublicKey;

  before(async () => {
    // Create a mint
    mint = await createMint({ connection, owner: signer });
    console.log("Mint created:", mint.toBase58());
  });

  it("is initialized", async () => {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      programId
    );
    const [contestMetadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("contest_metadata")],
      programId
    );
    const [escrowTokenAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow_token_account"), mint.toBuffer()],
      programId
    );
    const [feeTokenAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_token_account"), mint.toBuffer()],
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
      escrowTokenAccount: escrowTokenAccountPda,
      feeTokenAccount: feeTokenAccountPda,
      tokenProgram: utils.token.TOKEN_PROGRAM_ID,
    };

    const tokenDraftContestFeePercent = 10;

    const recentBlockhash = await connection.getLatestBlockhash();
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
      recentBlockhash: recentBlockhash.blockhash,
    }).compileToV0Message();

    const tx = new web3.VersionedTransaction(msg);
    tx.sign([signer]);
    // const sig = await connection.simulateTransaction(tx);
    const sig = await connection.sendTransaction(tx, { skipPreflight: false });
    await connection.confirmTransaction({
      blockhash: recentBlockhash.blockhash,
      lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
      signature: sig,
    });
    console.log("Tx signature:", sig);

    const configAccount = await pg.account.config.fetch(configPda);
    const escrowTokenAccount = await getAccount(
      connection,
      escrowTokenAccountPda
    );
    const feeTokenAccount = await getAccount(connection, feeTokenAccountPda);
    expect(configAccount.mint.toBase58()).to.equal(mint.toBase58());
    expect(configAccount.admin.toBase58()).to.equal(
      signer.publicKey.toBase58()
    );
    const contestMetadataAccount = await pg.account.contestMetadata.fetch(
      contestMetadataPda
    );
    expect(contestMetadataAccount.tokenDraftContestCount.toString()).to.equal(
      "0"
    );
    expect(escrowTokenAccount.mint.toBase58()).to.equal(mint.toBase58());
    expect(feeTokenAccount.mint.toBase58()).to.equal(mint.toBase58());
  });
});
