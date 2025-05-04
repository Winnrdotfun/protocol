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

const { PublicKey } = web3;

describe("initialize", () => {
  //   const provider = AnchorProvider.env();
  const provider = AnchorProvider.local();
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
    const [programTokenAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_account"), mint.toBuffer()],
      programId
    );

    const accounts = {
      signer: signer.publicKey,
      config: configPda,
      contestMetadata: contestMetadataPda,
      mint,
      tokenAccount: programTokenAccountPda,
      tokenProgram: utils.token.TOKEN_PROGRAM_ID,
    };

    const tokenDraftContestFeePercent = 10;
    const sig = await pg.methods
      .initialize(tokenDraftContestFeePercent)
      .accounts(accounts)
      .signers([signer])
      .rpc();
    console.log("Tx signature:", sig);

    const configAccount = await pg.account.config.fetch(configPda);
    expect(configAccount.mint.toBase58()).to.equal(mint.toBase58());
    expect(configAccount.admin.toBase58()).to.equal(
      signer.publicKey.toBase58()
    );

    const contestMetadataAccount = await pg.account.contestMetadata.fetch(
      contestMetadataPda
    );
    expect(contestMetadataAccount.tokenDraftContestCount).to.equal(0);
  });
});
