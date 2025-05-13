import { web3, workspace, utils } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LiteSVM } from "litesvm";
import { expect } from "chai";
import { fixtureSvmBase } from "../fixtures/svm";
import { Protocol } from "../../target/types/protocol";
import {
  SEED_CONFIG,
  SEED_CONTEST_METADATA,
  SEED_PROGRAM_TOKEN_ACCOUNT,
} from "../helpers/constants";
import { unpackAccount } from "@solana/spl-token";
import { sendSvmTransaction } from "../helpers";

const { PublicKey } = web3;

describe("initialize", () => {
  const pg = workspace.Protocol as Program<Protocol>;
  const programId = pg.programId;
  let mint: web3.PublicKey;

  let signers: web3.Keypair[];
  let svm: LiteSVM;

  before(async () => {
    // Create a mint
    const res = await fixtureSvmBase({ numSigners: 10 });
    svm = res.svm;
    mint = res.mint;
    signers = res.signers;
  });

  it("initialize program", async () => {
    const signer = signers[0];
    const [configPda] = PublicKey.findProgramAddressSync(
      [SEED_CONFIG],
      programId
    );
    const [contestMetadataPda] = PublicKey.findProgramAddressSync(
      [SEED_CONTEST_METADATA],
      programId
    );
    const [programTokenAccountPda] = PublicKey.findProgramAddressSync(
      [SEED_PROGRAM_TOKEN_ACCOUNT, mint.toBuffer()],
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
      programTokenAccount: programTokenAccountPda,
      tokenProgram: utils.token.TOKEN_PROGRAM_ID,
    };

    const tokenDraftContestFeePercent = 10;

    // const recentBlockhash = await connection.getLatestBlockhash();
    const recentBlockhash = svm.latestBlockhash();
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
      recentBlockhash: recentBlockhash,
    }).compileToV0Message();

    const tx = new web3.VersionedTransaction(msg);
    tx.sign([signer]);

    sendSvmTransaction(svm, signer, tx);

    const configAccInfo = svm.getAccount(configPda);
    const contestMetadataAccInfo = svm.getAccount(contestMetadataPda);
    const programTokenAccountAccInfo = svm.getAccount(programTokenAccountPda);
    const configAccount = pg.coder.accounts.decode(
      "config",
      Buffer.from(configAccInfo.data)
    );
    const contestMetadataAccount = pg.coder.accounts.decode(
      "contestMetadata",
      Buffer.from(contestMetadataAccInfo.data)
    );
    const programTokenAccount = unpackAccount(
      programTokenAccountPda,
      programTokenAccountAccInfo as any
    );

    expect(configAccount.mint.toBase58()).to.equal(mint.toBase58());
    expect(configAccount.admin.toBase58()).to.equal(
      signer.publicKey.toBase58()
    );
    expect(contestMetadataAccount.tokenDraftContestCount.toString()).to.equal(
      "0"
    );
    expect(programTokenAccount.mint.toBase58()).to.equal(mint.toBase58());
  });
});
