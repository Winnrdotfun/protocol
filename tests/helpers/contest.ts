import { AnchorProvider, BN, Program, utils, web3 } from "@coral-xyz/anchor";
import {
  InstructionWithEphemeralSigners,
  PythSolanaReceiver,
} from "@pythnetwork/pyth-solana-receiver";
import { Protocol } from "../../target/types/protocol";
import { hexToBase58, now } from "../helpers";
import { Account, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { HermesClient } from "@pythnetwork/hermes-client";
import { LiteSVM } from "litesvm";
import {
  SEED_TOKEN_DRAFT_CONTEST,
  SEED_TOKEN_DRAFT_CONTEST_CREDITS,
  SEED_TOKEN_DRAFT_CONTEST_ENTRY,
} from "./constants";

const { PublicKey } = web3;

export const getCreateContestTx = async (args: {
  svm?: LiteSVM;
  program: Program<Protocol>;
  signer: web3.Keypair;
  contestMetadataPda: web3.PublicKey;
  pythSolanaReceiver: PythSolanaReceiver;
  contestParams: {
    startTime: number;
    endTime: number;
    entryFee: bigint;
    maxEntries: number;
    priceFeedIds: string[];
    rewardAllocation: number[];
  };
}) => {
  const {
    program: pg,
    signer,
    contestMetadataPda,
    contestParams,
    pythSolanaReceiver,
    svm,
  } = args;

  const programId = pg.programId;
  let contestMetadata;
  if (svm) {
    const contestMetadataAccInfo = svm.getAccount(contestMetadataPda);
    contestMetadata = pg.coder.accounts.decode(
      "contestMetadata",
      Buffer.from(contestMetadataAccInfo.data)
    );
  } else {
    contestMetadata = await pg.account.contestMetadata.fetch(
      contestMetadataPda
    );
  }

  const [contestPda] = PublicKey.findProgramAddressSync(
    [
      SEED_TOKEN_DRAFT_CONTEST,
      contestMetadata.tokenDraftContestCount.toArrayLike(Buffer, "le", 8),
      signer.publicKey.toBuffer(),
    ],
    programId
  );
  const [contestCreditsPda] = PublicKey.findProgramAddressSync(
    [SEED_TOKEN_DRAFT_CONTEST_CREDITS, contestPda.toBuffer()],
    programId
  );

  const {
    startTime,
    endTime,
    entryFee,
    maxEntries,
    rewardAllocation,
    priceFeedIds,
  } = contestParams;
  const tokenFeedIds = priceFeedIds.map((v) => new PublicKey(hexToBase58(v)));
  const feedAccounts = priceFeedIds.map((v) =>
    pythSolanaReceiver.getPriceFeedAccountAddress(0, v)
  );
  const accounts = {
    signer: signer.publicKey,
    contestMetadata: contestMetadataPda,
    contest: contestPda,
    contestCredits: contestCreditsPda,
    feed0: feedAccounts[0],
    feed1: feedAccounts[1] || null,
    feed2: feedAccounts[2] || null,
    feed3: feedAccounts[3] || null,
    feed4: feedAccounts[4] || null,
  };
  const ixs = await pg.methods
    .createTokenDraftContest(
      new BN(startTime),
      new BN(endTime),
      new BN(entryFee.toString()),
      maxEntries,
      tokenFeedIds,
      Buffer.from(rewardAllocation)
    )
    .accounts(accounts)
    .instruction();

  let recentBlockhash: string;
  if (svm) {
    recentBlockhash = svm.latestBlockhash();
  } else {
    recentBlockhash = await pg.provider.connection
      .getLatestBlockhash()
      .then((x) => x.blockhash);
  }

  const msg = new web3.TransactionMessage({
    payerKey: signer.publicKey,
    instructions: [ixs],
    recentBlockhash,
  }).compileToV0Message();
  const tx = new web3.VersionedTransaction(msg);
  tx.sign([signer]);

  return { tx, contestPda, contestCreditsPda };
};

export const getPostPricesTxs = async (args: {
  svm?: LiteSVM;
  program: Program<Protocol>;
  signer: web3.Keypair;
  contestPda: web3.PublicKey;
  pythSolanaReceiver: PythSolanaReceiver;
  hermesClient: HermesClient;
}) => {
  const {
    svm,
    program: pg,
    signer,
    contestPda,
    pythSolanaReceiver,
    hermesClient,
  } = args;

  let contest: any;
  if (svm) {
    let contestAccInfo = svm.getAccount(contestPda);
    contest = pg.coder.accounts.decode(
      "tokenDraftContest",
      Buffer.from(contestAccInfo.data)
    );
  } else {
    contest = await pg.account.tokenDraftContest.fetch(contestPda);
  }
  const startTimestamp = contest.startTime.toNumber();
  const endTimestamp = contest.endTime.toNumber();

  const priceFeedIds = contest.tokenFeedIds.map(
    (v) => "0x" + v.toBuffer().toString("hex").toLowerCase()
  );
  const startPriceUpdates = await hermesClient.getPriceUpdatesAtTimestamp(
    startTimestamp,
    priceFeedIds,
    { encoding: "base64" }
  );
  const startPriceUpdatesData = startPriceUpdates.binary.data;
  const endPriceUpdates = await hermesClient.getPriceUpdatesAtTimestamp(
    endTimestamp,
    priceFeedIds,
    { encoding: "base64" }
  );
  const endPriceUpdatesData = endPriceUpdates.binary.data;
  const {
    postInstructions: endPricePostInstructions,
    closeInstructions: endPriceCloseInstructions,
    priceFeedIdToPriceUpdateAccount: endPriceFeedIdToPriceUpdateAccount,
  } = await pythSolanaReceiver.buildPostPriceUpdateInstructions(
    endPriceUpdatesData
  );

  const txBuilder = pythSolanaReceiver.newTransactionBuilder({
    closeUpdateAccounts: true,
  });
  await txBuilder.addPostPriceUpdates(startPriceUpdatesData);
  txBuilder.addInstructions(endPricePostInstructions);
  txBuilder.closeInstructions.push(...endPriceCloseInstructions);

  await txBuilder.addPriceConsumerInstructions(
    async (getPriceUpdateAccount) => {
      const startPriceUpdateAccounts = priceFeedIds.map((id) =>
        getPriceUpdateAccount(id)
      );
      const endPriceUpdateAccounts = priceFeedIds.map(
        (id) => endPriceFeedIdToPriceUpdateAccount[id]
      );

      const accounts = {
        signer: signer.publicKey,
        contest: contestPda,
        startPriceFeed0: startPriceUpdateAccounts[0],
        startPriceFeed1: startPriceUpdateAccounts[1] || null,
        startPriceFeed2: startPriceUpdateAccounts[2] || null,
        startPriceFeed3: startPriceUpdateAccounts[3] || null,
        startPriceFeed4: startPriceUpdateAccounts[4] || null,
        endPriceFeed0: endPriceUpdateAccounts[0],
        endPriceFeed1: endPriceUpdateAccounts[1] || null,
        endPriceFeed2: endPriceUpdateAccounts[2] || null,
        endPriceFeed3: endPriceUpdateAccounts[3] || null,
        endPriceFeed4: endPriceUpdateAccounts[4] || null,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
      };

      const txInstruction = await pg.methods
        .postTokenDraftContestPrices()
        .accounts(accounts)
        .instruction();

      const instruction: InstructionWithEphemeralSigners = {
        instruction: txInstruction,
        signers: [signer],
      };

      return [instruction];
    }
  );

  const txs = await txBuilder.buildVersionedTransactions({
    computeUnitPriceMicroLamports: 50000,
  });

  const vtxs: web3.VersionedTransaction[] = [];
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i].tx;
    const signers = txs[i].signers;

    const ixs = web3.TransactionMessage.decompile(tx.message).instructions;
    const msg = new web3.TransactionMessage({
      payerKey: signer.publicKey,
      instructions: ixs,
      recentBlockhash: svm.latestBlockhash(),
    }).compileToV0Message();
    const vtx = new web3.VersionedTransaction(msg);
    vtx.sign([...signers]);
    vtxs.push(vtx);
  }

  return { txs: vtxs };
};

export const getEnterContestTx = async (args: {
  svm?: LiteSVM;
  program: Program<Protocol>;
  signer: web3.Keypair;
  configPda: web3.PublicKey;
  contestPda: web3.PublicKey;
  mint: web3.PublicKey;
  programTokenAccountPda: web3.PublicKey;
  signerTokenAccount: Account;
  creditAllocation: number[];
}) => {
  const {
    svm,
    program: pg,
    signer,
    configPda,
    contestPda,
    mint,
    programTokenAccountPda,
    signerTokenAccount,
    creditAllocation,
  } = args;
  const programId = pg.programId;
  const [contestEntryPda] = PublicKey.findProgramAddressSync(
    [
      SEED_TOKEN_DRAFT_CONTEST_ENTRY,
      contestPda.toBuffer(),
      signer.publicKey.toBuffer(),
    ],
    programId
  );
  const [contestCreditsPda] = PublicKey.findProgramAddressSync(
    [SEED_TOKEN_DRAFT_CONTEST_CREDITS, contestPda.toBuffer()],
    programId
  );

  const accounts = {
    signer: signer.publicKey,
    config: configPda,
    contest: contestPda,
    contestEntry: contestEntryPda,
    contestCredits: contestCreditsPda,
    mint,
    programTokenAccount: programTokenAccountPda,
    signerTokenAccount: signerTokenAccount.address,
    tokenProgram: utils.token.TOKEN_PROGRAM_ID,
  };
  const creditAllocationInput = Buffer.from(creditAllocation);

  let recentBlockhash: string;
  if (svm) {
    recentBlockhash = svm.latestBlockhash();
  } else {
    recentBlockhash = await pg.provider.connection
      .getLatestBlockhash()
      .then((x) => x.blockhash);
  }

  const ixs = await pg.methods
    .enterTokenDraftContest(creditAllocationInput)
    .accounts(accounts)
    .instruction();
  const msg = new web3.TransactionMessage({
    payerKey: signer.publicKey,
    instructions: [ixs],
    recentBlockhash,
  }).compileToV0Message();
  const tx = new web3.VersionedTransaction(msg);
  tx.sign([signer]);

  return { tx, contestEntryPda, contestCreditsPda };
};

export const getResolveContestTx = async (args: {
  svm?: LiteSVM;
  program: Program<Protocol>;
  signer: web3.Keypair;
  mint: web3.PublicKey;
  contestPda: web3.PublicKey;
  contestMetadataPda: web3.PublicKey;
  contestCreditsPda: web3.PublicKey;
  programTokenAccountPda: web3.PublicKey;
  hermesClient: HermesClient;
  pythSolanaReceiver: PythSolanaReceiver;
}) => {
  const {
    svm,
    program,
    signer,
    mint,
    contestPda,
    contestMetadataPda,
    contestCreditsPda,
    hermesClient,
    pythSolanaReceiver,
    programTokenAccountPda,
  } = args;

  let contest: any;
  if (svm) {
    let contestAccInfo = svm.getAccount(contestPda);
    contest = program.coder.accounts.decode(
      "tokenDraftContest",
      Buffer.from(contestAccInfo.data)
    );
  } else {
    contest = await program.account.tokenDraftContest.fetch(contestPda);
  }

  const priceFeedIds = contest.tokenFeedIds.map(
    (v) => "0x" + v.toBuffer().toString("hex").toLowerCase()
  );

  const endTimestamp = contest.endTime.toNumber();
  const priceUpdates = await hermesClient.getPriceUpdatesAtTimestamp(
    endTimestamp,
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

      const accounts = {
        signer: signer.publicKey,
        contest: contestPda,
        contestCredits: contestCreditsPda,
        contestMetadata: contestMetadataPda,
        mint,
        programTokenAccount: programTokenAccountPda,
        feed0: priceUpdateAccounts[0],
        feed1: priceUpdateAccounts[1] || null,
        feed2: priceUpdateAccounts[2] || null,
        feed3: priceUpdateAccounts[3] || null,
        feed4: priceUpdateAccounts[4] || null,
        tokenProgram: TOKEN_PROGRAM_ID,
      };

      const txInstruction = await program.methods
        .resolveTokenDraftContest()
        .accounts(accounts)
        .instruction();

      const instruction: InstructionWithEphemeralSigners = {
        instruction: txInstruction,
        signers: [signer],
      };

      return [instruction];
    }
  );

  const txs = await txBuilder.buildVersionedTransactions({
    computeUnitPriceMicroLamports: 50000,
  });

  const vtxs: web3.VersionedTransaction[] = [];
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i].tx;
    const signers = txs[i].signers;

    const ixs = web3.TransactionMessage.decompile(tx.message).instructions;
    const msg = new web3.TransactionMessage({
      payerKey: signer.publicKey,
      instructions: ixs,
      recentBlockhash: svm.latestBlockhash(),
    }).compileToV0Message();
    const vtx = new web3.VersionedTransaction(msg);
    vtx.sign([...signers]);
    vtxs.push(vtx);
  }

  return { txs: vtxs };
};

export const createContest = async (args: {
  provider: AnchorProvider;
  program: Program<Protocol>;
  contestMetadataPda: web3.PublicKey;
  pythSolanaReceiver: PythSolanaReceiver;
  contestParams: {
    startTime: number;
    endTime: number;
    entryFee: bigint;
    maxEntries: number;
    priceFeedIds: string[];
    rewardAllocation: number[];
  };
}) => {
  const {
    provider,
    program: pg,
    contestMetadataPda,
    pythSolanaReceiver,
    contestParams,
  } = args;
  const wallet = provider.wallet;
  const signer = wallet.payer;

  const { tx, contestPda, contestCreditsPda } = await getCreateContestTx({
    program: pg,
    signer,
    contestMetadataPda,
    pythSolanaReceiver,
    contestParams,
  });

  const txSignature = await pg.provider.send(tx, [signer], {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  return { txSignature, contestPda, contestCreditsPda };
};

export const enterContest = async (args: {
  signer: web3.Keypair;
  program: Program<Protocol>;
  configPda: web3.PublicKey;
  contestPda: web3.PublicKey;
  mint: web3.PublicKey;
  escrowTokenAccountPda: web3.PublicKey;
  feeTokenAccountPda: web3.PublicKey;
  signerTokenAccount: Account;
  creditAllocation: number[];
}) => {
  const {
    contestPda,
    program,
    signer,
    configPda,
    mint,
    escrowTokenAccountPda,
    feeTokenAccountPda,
    signerTokenAccount,
    creditAllocation,
  } = args;
  const programId = program.programId;
  const [contestEntryPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("token_draft_contest_entry"),
      contestPda.toBuffer(),
      signer.publicKey.toBuffer(),
    ],
    programId
  );
  const [contestCreditsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_draft_contest_credits"), contestPda.toBuffer()],
    programId
  );

  const accounts = {
    signer: signer.publicKey,
    config: configPda,
    contest: contestPda,
    contestEntry: contestEntryPda,
    contestCredits: contestCreditsPda,
    mint,
    escrowTokenAccount: escrowTokenAccountPda,
    feeTokenAccount: feeTokenAccountPda,
    signerTokenAccount: signerTokenAccount.address,
    tokenProgram: utils.token.TOKEN_PROGRAM_ID,
  };

  const creditAllocationInput = Buffer.from(creditAllocation);
  const txSignature = await program.methods
    .enterTokenDraftContest(creditAllocationInput)
    .accounts(accounts)
    .signers([signer])
    .rpc();

  return { txSignature, contestEntryPda, contestCreditsPda };
};

export const postContestPrices = async (args: {
  program: Program<Protocol>;
  signer: web3.Keypair;
  contestPda: web3.PublicKey;
  hermesClient: HermesClient;
  pythSolanaReceiver: PythSolanaReceiver;
}) => {
  const {
    program: pg,
    signer,
    contestPda,
    pythSolanaReceiver,
    hermesClient,
  } = args;
  let contest = await pg.account.tokenDraftContest.fetch(contestPda);

  const priceFeedIds = contest.tokenFeedIds.map(
    (v) => "0x" + v.toBuffer().toString("hex").toLowerCase()
  );
  const startTimestamp = now() - 60 * 60; // 1 hour ago
  // const startTimestamp = contest.endTime.toNumber();
  const priceUpdates = await hermesClient.getPriceUpdatesAtTimestamp(
    startTimestamp,
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

      const accounts = {
        signer: signer.publicKey,
        contest: contestPda,
        feed0: priceUpdateAccounts[0],
        feed1: priceUpdateAccounts[1] || null,
        feed2: priceUpdateAccounts[2] || null,
        feed3: priceUpdateAccounts[3] || null,
        feed4: priceUpdateAccounts[4] || null,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
      };

      const txInstruction = await pg.methods
        .postTokenDraftContestPrices()
        .accounts(accounts)
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

  const txSignatures = await pythSolanaReceiver.provider.sendAll(versionedTxs, {
    skipPreflight: false,
  });

  return { txSignatures };
};

export const resolveContest = async (args: {
  program: Program<Protocol>;
  signer: web3.Keypair;
  hermesClient: HermesClient;
  pythSolanaReceiver: PythSolanaReceiver;
  mint: web3.PublicKey;
  contestPda: web3.PublicKey;
  contestMetadataPda: web3.PublicKey;
  contestCreditsPda: web3.PublicKey;
  escrowTokenAccountPda: web3.PublicKey;
  feeTokenAccountPda: web3.PublicKey;
}) => {
  const {
    program,
    signer,
    mint,
    contestPda,
    contestMetadataPda,
    contestCreditsPda,
    hermesClient,
    pythSolanaReceiver,
    escrowTokenAccountPda,
    feeTokenAccountPda,
  } = args;
  const contest = await program.account.tokenDraftContest.fetch(contestPda);

  const priceFeedIds = contest.tokenFeedIds.map(
    (v) => "0x" + v.toBuffer().toString("hex").toLowerCase()
  );

  const endTimestamp = Math.floor(Date.now() / 1000) - 60 * 60 * 24; // 1 day ago
  // const endTimestamp = contest.endTime.toNumber();
  const priceUpdates = await hermesClient.getPriceUpdatesAtTimestamp(
    endTimestamp,
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

      const accounts = {
        signer: signer.publicKey,
        contest: contestPda,
        contestCredits: contestCreditsPda,
        contestMetadata: contestMetadataPda,
        mint,
        escrowTokenAccount: escrowTokenAccountPda,
        feeTokenAccount: feeTokenAccountPda,
        feed0: priceUpdateAccounts[0],
        feed1: priceUpdateAccounts[1] || null,
        feed2: priceUpdateAccounts[2] || null,
        feed3: priceUpdateAccounts[3] || null,
        feed4: priceUpdateAccounts[4] || null,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
      };

      const txInstruction = await program.methods
        .resolveTokenDraftContest()
        .accounts(accounts)
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

  const txSignatures = await pythSolanaReceiver.provider.sendAll(versionedTxs, {
    skipPreflight: false,
  });

  return { txSignatures };
};
