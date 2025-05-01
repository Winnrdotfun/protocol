import { expect } from "chai";
import {
  AnchorProvider,
  setProvider,
  web3,
  workspace,
  BN,
  utils,
} from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  InstructionWithEphemeralSigners,
  PythSolanaReceiver,
  DEFAULT_WORMHOLE_PROGRAM_ID,
} from "@pythnetwork/pyth-solana-receiver";
import {
  Account,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Protocol } from "../target/types/protocol";
import { createContest, initializeProgram, pythPriceFeedIds } from "./helpers";
import { HermesClient } from "@pythnetwork/hermes-client";

const { PublicKey } = web3;

describe.only("resolve2", () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const connection = provider.connection;
  const wallet = provider.wallet;
  const signer = wallet.payer;
  const pg = workspace.Protocol as Program<Protocol>;
  const programId = pg.programId;
  let mint: web3.PublicKey;
  let configPda: web3.PublicKey;
  let contestMetadataPda: web3.PublicKey;
  let contestPda: web3.PublicKey;
  let programTokenAccountPda: web3.PublicKey;
  let signerTokenAccount: Account;
  const pythSolanaReceiver = new PythSolanaReceiver({
    connection,
    wallet: wallet as any,
  });
  const priceServiceConnection = new HermesClient(
    "https://hermes.pyth.network/",
    {}
  );

  before(async () => {
    // Initialize the program
    const initRes = await initializeProgram({ program: pg, provider });
    mint = initRes.mint;
    configPda = initRes.configPda;
    contestMetadataPda = initRes.contestMetadataPda;
    programTokenAccountPda = initRes.programTokenAccountPda;

    // Mint tokens
    signerTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      signer,
      mint,
      signer.publicKey
    );
    await mintTo(
      connection,
      signer,
      mint,
      signerTokenAccount.address,
      signer,
      10000 * LAMPORTS_PER_SOL
    );

    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = new BN(currentTime + 60 * 60); // 1 hour from now
    const endTime = new BN(startTime.toNumber() + 60 * 60 * 24); // 1 day from now
    const contestParams = {
      startTime,
      endTime,
      entryFee: new BN(10 * LAMPORTS_PER_SOL),
      maxEntries: 100,
      numWinners: 10,
      priceFeedIds: [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat],
    };
    const createRes = await createContest({
      provider,
      program: pg,
      contestMetadataPda,
      pythSolanaReceiver,
      contestParams,
    });
    contestPda = createRes.contestPda;
  });

  it("enter a token draft contest", async () => {
    const [contestEntryPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("token_draft_contest_entry"),
        contestPda.toBuffer(),
        signer.publicKey.toBuffer(),
      ],
      programId
    );

    const accounts = {
      signer: signer.publicKey,
      config: configPda,
      contest: contestPda,
      contestEntry: contestEntryPda,
      mint,
      programTokenAccount: programTokenAccountPda,
      signerTokenAccount: signerTokenAccount.address,
      tokenProgram: utils.token.TOKEN_PROGRAM_ID,
    };

    const creditAllocation = [50, 50];
    const creditAllocationInp = Buffer.from(creditAllocation); // new Uint8Array(creditAllocation);
    const txSignature = await pg.methods
      .enterTokenDraftContest(creditAllocationInp)
      .accounts(accounts)
      .signers([signer])
      .rpc();

    console.log("Transaction signature", txSignature);

    // const programTokenAccount = await getAccount(
    //   connection,
    //   programTokenAccountPda
    // );
    // console.log(
    //   "programTokenAccount.address:",
    //   programTokenAccount.address.toBase58()
    // );
    // console.log(
    //   "programTokenAccount.amount:",
    //   programTokenAccount.amount.toString()
    // );

    // const contestEntry = await pg.account.tokenDraftContestEntry.fetch(
    //   contestEntryPda
    // );
    // console.log("Contest entry:", contestEntry);

    // expect(contestEntry.user.toBase58()).equal(signer.publicKey.toBase58());
    // expect(contestEntry.contest.toBase58()).equal(contestPda.toBase58());
    // expect(contestEntry.creditAllocation.length).equal(creditAllocation.length);
    // for (let i = 0; i < creditAllocation.length; i++) {
    //   expect(contestEntry.creditAllocation[i]).equal(creditAllocation[i]);
    // }
    // expect(contestEntry.hasClaimed).equal(false);
    // expect(programTokenAccount.amount.toString()).equal(
    //   new BN(10 * LAMPORTS_PER_SOL).toString()
    // );

    const priceFeedIds = [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat];
    const timestamp = Math.floor(Date.now() / 1000) - 60 * 60 * 24; // 1 day ago
    const priceUpdates =
      await priceServiceConnection.getPriceUpdatesAtTimestamp(
        timestamp,
        priceFeedIds,
        { encoding: "base64" }
      );
    const priceUpdatesData = priceUpdates.binary.data;
    const txBuilder = pythSolanaReceiver.newTransactionBuilder({
      closeUpdateAccounts: true,
    });
    await txBuilder.addPostPriceUpdates(priceUpdatesData);
    await txBuilder.addPriceConsumerInstructions(
      async (getPriceUpdateAccount) => {
        const priceUpdateAccounts = priceFeedIds.map((id) =>
          getPriceUpdateAccount(id)
        );

        const txInstruction = await pg.methods
          .resolveTokenDraftContest()
          .accounts({
            signer: signer.publicKey,
            contest: contestPda,
            feed0: priceUpdateAccounts[0],
            feed1: priceUpdateAccounts[1] || null,
            feed2: priceUpdateAccounts[2] || null,
            feed3: priceUpdateAccounts[3] || null,
            feed4: priceUpdateAccounts[4] || null,
          })
          .instruction();

        const instruction: InstructionWithEphemeralSigners = {
          instruction: txInstruction,
          signers: [signer],
        };

        return [instruction];
      }
    );

    const versionedTxs = await txBuilder.buildVersionedTransactions({
      computeUnitPriceMicroLamports: 50000,
    });
    console.log("versionedTxs:", versionedTxs.length);

    const sigs = await pythSolanaReceiver.provider
      .sendAll(versionedTxs, {
        skipPreflight: false,
      })
      .catch((e) => {
        console.error("Error sending transactions:", e);
        e.getLogs().then((r) => console.log("Error.getLogs:", r));
      });
    console.log("signatures:", sigs);

    const contest = await pg.account.tokenDraftContest.fetch(contestPda);
    const contestEntry = await pg.account.tokenDraftContestEntry.fetch(
      contestEntryPda
    );
    console.log("Contest:", contest);
    console.log("Contest entry:", contestEntry);
    expect(contest.isResolved).equal(true);

    // const accounts2 = {
    //   signer: signer.publicKey,
    //   contest: contestPda,
    // };

    // const txSignature2 = await pg.methods
    //   .resolveTokenDraftContest()
    //   .accounts(accounts)
    //   .signers([signer])
    //   .rpc();

    // console.log("Transaction signature", txSignature2);
  });
});
