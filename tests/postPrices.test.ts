import { expect } from "chai";
import { AnchorProvider, web3, utils } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  InstructionWithEphemeralSigners,
  PythSolanaReceiver,
} from "@pythnetwork/pyth-solana-receiver";
import { Account } from "@solana/spl-token";
import { HermesClient } from "@pythnetwork/hermes-client";
import { LiteSVM } from "litesvm";
import { fixtureWithContest } from "./fixtures/svm";
import { Protocol } from "../target/types/protocol";
import {
  ContestParams,
  now,
  ONE_DAY,
  pythPriceFeedIds,
  sendSvmTransaction,
  UNITS_PER_USDC,
} from "./helpers";
import { setSvmTimeTo } from "./helpers/time";

describe("postPrices", () => {
  let pg: Program<Protocol>;
  let provider: AnchorProvider;
  let svm: LiteSVM;

  let mint: web3.PublicKey;
  let configPda: web3.PublicKey;
  let contestMetadataPda: web3.PublicKey;
  let contestPda: web3.PublicKey;
  let programTokenAccountPda: web3.PublicKey;
  let signers: web3.Keypair[];
  let signerTokenAccounts: Account[];
  let pythSolanaReceiver: PythSolanaReceiver;
  let priceServiceConnection: HermesClient;
  let contestParams: ContestParams;

  before(async () => {
    const currentTime = now();
    const startTime = currentTime - 2 * ONE_DAY; // 2 days ago
    const endTime = startTime + ONE_DAY; // 1 day from start
    contestParams = {
      startTime,
      endTime,
      entryFee: BigInt(10 * UNITS_PER_USDC),
      maxEntries: 100,
      priceFeedIds: [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat],
      rewardAllocation: [50, 50],
    };

    const res = await fixtureWithContest({
      contestParams,
      numSigners: 10,
    });

    provider = res.provider;
    pg = res.program;
    svm = res.svm;
    signers = res.signers;
    mint = res.mint;
    configPda = res.configPda;
    contestMetadataPda = res.contestMetadataPda;
    contestPda = res.contestPda;
    programTokenAccountPda = res.programTokenAccountPda;
    pythSolanaReceiver = res.pythSolanaReceiver;
    signerTokenAccounts = res.signerTokenAccounts;
    priceServiceConnection = res.priceServiceConnection;
  });

  it("post token draft contest prices", async () => {
    const signer = signers[0];
    let contestAccInfo = svm.getAccount(contestPda);
    let contest = pg.coder.accounts.decode(
      "tokenDraftContest",
      Buffer.from(contestAccInfo.data)
    );
    const startTimestamp = contest.startTime.toNumber();
    const endTimestamp = contest.endTime.toNumber();

    // Pass the start time
    setSvmTimeTo(svm, startTimestamp + 1);

    const priceFeedIds = contest.tokenFeedIds.map(
      (v) => "0x" + v.toBuffer().toString("hex").toLowerCase()
    );
    const startPriceUpdates =
      await priceServiceConnection.getPriceUpdatesAtTimestamp(
        startTimestamp,
        priceFeedIds,
        { encoding: "base64" }
      );
    const startPriceUpdatesData = startPriceUpdates.binary.data;
    // console.log("startPriceUpdatesData", startPriceUpdatesData);

    const endPriceUpdates =
      await priceServiceConnection.getPriceUpdatesAtTimestamp(
        endTimestamp,
        priceFeedIds,
        { encoding: "base64" }
      );
    const endPriceUpdatesData = endPriceUpdates.binary.data;

    const txBuilder = pythSolanaReceiver.newTransactionBuilder({
      closeUpdateAccounts: true,
    });
    const {
      postInstructions: endPricePostInstructions,
      closeInstructions: endPriceCloseInstructions,
      priceFeedIdToPriceUpdateAccount: endPriceFeedIdToPriceUpdateAccount,
    } = await pythSolanaReceiver.buildPostPriceUpdateInstructions(
      endPriceUpdatesData
    );

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

    // Pass the end time
    setSvmTimeTo(svm, endTimestamp + 1);

    const txs = await txBuilder.buildVersionedTransactions({
      computeUnitPriceMicroLamports: 50000,
    });

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
      sendSvmTransaction(svm, signer, vtx);
    }

    contestAccInfo = svm.getAccount(contestPda);
    contest = pg.coder.accounts.decode(
      "tokenDraftContest",
      Buffer.from(contestAccInfo.data)
    );

    expect(contest.tokenStartPrices.length).equal(priceFeedIds.length);
    expect(contest.tokenEndPrices.length).equal(priceFeedIds.length);
  });
});
