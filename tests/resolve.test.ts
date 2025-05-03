import {
  AnchorProvider,
  setProvider,
  web3,
  workspace,
  BN,
} from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  InstructionWithEphemeralSigners,
  PythSolanaReceiver,
} from "@pythnetwork/pyth-solana-receiver";
import {
  Account,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { HermesClient } from "@pythnetwork/hermes-client";
import { Protocol } from "../target/types/protocol";
import {
  createContest,
  createMint,
  enterContest,
  initializeProgram,
  pythPriceFeedIds,
} from "./helpers";

describe.only("resolve", () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const connection = provider.connection;
  const wallet = provider.wallet;
  const pg = workspace.Protocol as Program<Protocol>;
  const programId = pg.programId;
  const signer = wallet.payer;
  const signers = [
    signer,
    ...Array.from({ length: 5 }, () => web3.Keypair.generate()),
  ];

  let mint: web3.PublicKey;
  let configPda: web3.PublicKey;
  let contestMetadataPda: web3.PublicKey;
  let contestPda: web3.PublicKey;
  let programTokenAccountPda: web3.PublicKey;
  let signerTokenAccounts: Account[] = [];
  let contestEntryPda: web3.PublicKey;

  const pythSolanaReceiver = new PythSolanaReceiver({
    connection,
    wallet: wallet as any,
  });
  const priceServiceConnection = new HermesClient(
    "https://hermes.pyth.network/",
    {}
  );
  const priceFeedIds = [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat];

  before(async () => {
    mint = await createMint({ connection, owner: signer });
    for (const s of signers) {
      await connection.requestAirdrop(s.publicKey, 100 * LAMPORTS_PER_SOL);
    }

    // Initialize the program
    const initRes = await initializeProgram({ program: pg, provider, mint });
    configPda = initRes.configPda;
    contestMetadataPda = initRes.contestMetadataPda;
    programTokenAccountPda = initRes.programTokenAccountPda;
    console.log("init:", initRes.txSignature);

    // Mint tokens
    for (const s of signers) {
      const acc = await getOrCreateAssociatedTokenAccount(
        connection,
        s,
        mint,
        s.publicKey
      );

      signerTokenAccounts.push(acc);

      await mintTo(
        connection,
        s,
        mint,
        acc.address,
        signer,
        10000 * LAMPORTS_PER_SOL
      );
    }

    const signerTokenAccount = signerTokenAccounts[0];

    // signerTokenAccount = await getOrCreateAssociatedTokenAccount(
    //   connection,
    //   signer,
    //   mint,
    //   signer.publicKey
    // );

    // await mintTo(
    //   connection,
    //   signer,
    //   mint,
    //   signerTokenAccount.address,
    //   signer,
    //   10000 * LAMPORTS_PER_SOL
    // );

    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = new BN(currentTime + 60 * 60); // 1 hour from now
    const endTime = new BN(startTime.toNumber() + 60 * 60 * 24); // 1 day from now
    const contestParams = {
      startTime,
      endTime,
      entryFee: new BN(10 * LAMPORTS_PER_SOL),
      maxEntries: 100,
      priceFeedIds,
      rewardAllocation: [25, 75],
    };
    const createRes = await createContest({
      provider,
      program: pg,
      contestMetadataPda,
      pythSolanaReceiver,
      contestParams,
    });
    contestPda = createRes.contestPda;
    console.log("create:", createRes.txSignature);

    // const creditAllocation = [35, 65];
    const creditAllocations = [
      [25, 75], // -2.68 / -250
      [50, 50], // -1.144 / -100
      [40, 60], // -1.76 / -160
      [75, 25], // 0.394 / 50 [3 1 2 0]
    ];

    for (let i = 0; i < creditAllocations.length; i++) {
      const { txSignature } = await enterContest({
        signer: signers[i],
        program: pg,
        configPda,
        contestPda,
        mint,
        programTokenAccountPda,
        signerTokenAccount: signerTokenAccounts[i],
        creditAllocation: creditAllocations[i],
      });

      console.log("enter:", txSignature);
    }

    // const { txSignature } = await enterContest({
    //   provider: provider,
    //   program: pg,
    //   configPda,
    //   contestPda,
    //   mint,
    //   programTokenAccountPda,
    //   signerTokenAccount,
    //   creditAllocation,
    // });
    // console.log("enter:", txSignature);
  });

  it("resolve a token draft contest", async () => {
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

    const sigs = await pythSolanaReceiver.provider.sendAll(versionedTxs, {
      skipPreflight: false,
    });
    console.log("signatures:==", sigs);

    const tx = await connection.getTransaction(sigs[2], {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    // console.log("tx:", tx);
    console.log("logs:", tx?.meta?.logMessages);

    const contest = await pg.account.tokenDraftContest.fetch(contestPda);
    console.log("contest:", contest);
    // const contestEntry = await pg.account.tokenDraftContestEntry.fetch(
    //   contestEntryPda
    // );
    // expect(contest.isResolved).equal(true);
  });
});
