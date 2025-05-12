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
import { fixtureWithContest } from "../fixtures/svm";
import { Protocol } from "../../target/types/protocol";
import {
  ContestParams,
  now,
  pythPriceFeedIds,
  sendSvmTransaction,
  UNITS_PER_USDC,
} from "../helpers";
import { setSvmTimeTo } from "../helpers/time";

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
    const startTime = currentTime - 24 * 60 * 60; // 1 day ago
    const endTime = startTime + 60 * 60; // 1 hour from start
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

    // Pass the start time
    const clock = svm.getClock();
    clock.unixTimestamp = BigInt(startTimestamp + 1);
    svm.setClock(clock);

    const priceFeedIds = contest.tokenFeedIds.map(
      (v) => "0x" + v.toBuffer().toString("hex").toLowerCase()
    );
    const priceUpdates =
      await priceServiceConnection.getPriceUpdatesAtTimestamp(
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

    // Pass the start time
    setSvmTimeTo(svm, startTimestamp + 1);

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
  });
});
