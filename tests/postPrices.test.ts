import { expect } from "chai";
import {
  AnchorProvider,
  setProvider,
  web3,
  workspace,
  utils,
} from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  InstructionWithEphemeralSigners,
  PythSolanaReceiver,
} from "@pythnetwork/pyth-solana-receiver";
import { Account } from "@solana/spl-token";
import { Protocol } from "../target/types/protocol";
import {
  ContestParams,
  now,
  pythPriceFeedIds,
  UNITS_PER_USDC,
} from "./helpers";
import { fixtureWithContest } from "./fixtures";
import { HermesClient } from "@pythnetwork/hermes-client";

describe.skip("postPrices", () => {
  const provider = AnchorProvider.env();
  setProvider(provider);
  const connection = provider.connection;
  const pg = workspace.Protocol as Program<Protocol>;
  const programId = pg.programId;

  let mint: web3.PublicKey;
  let configPda: web3.PublicKey;
  let contestMetadataPda: web3.PublicKey;
  let contestPda: web3.PublicKey;
  let escrowTokenAccountPda: web3.PublicKey;
  let feeTokenAccountPda: web3.PublicKey;
  let signers: web3.Keypair[];
  let signerTokenAccounts: Account[];
  let pythSolanaReceiver: PythSolanaReceiver;
  let priceServiceConnection: HermesClient;
  let contestParams: ContestParams;

  before(async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = currentTime + 60 * 60; // 1 hour from now
    const endTime = startTime + 60 * 60 * 24; // 1 day from now
    contestParams = {
      startTime,
      endTime,
      entryFee: BigInt(10 * UNITS_PER_USDC),
      maxEntries: 100,
      priceFeedIds: [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat],
      rewardAllocation: [50, 50],
    };

    const res = await fixtureWithContest({
      provider,
      program: pg,
      contestParams,
    });
    signers = res.signers;
    mint = res.mint;
    configPda = res.configPda;
    contestMetadataPda = res.contestMetadataPda;
    contestPda = res.contestPda;
    escrowTokenAccountPda = res.escrowTokenAccountPda;
    feeTokenAccountPda = res.feeTokenAccountPda;
    pythSolanaReceiver = res.pythSolanaReceiver;
    signerTokenAccounts = res.signerTokenAccounts;
    priceServiceConnection = res.priceServiceConnection;
  });

  it("post token draft contest prices", async () => {
    const signer = signers[0];

    let contest = await pg.account.tokenDraftContest.fetch(contestPda);

    const priceFeedIds = contest.tokenFeedIds.map(
      (v) => "0x" + v.toBuffer().toString("hex").toLowerCase()
    );
    const startTimestamp = now() - 60 * 60 * 24; // 1 hour ago
    // const endTimestamp = contest.endTime.toNumber();
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

    const versionedTxs = await txBuilder.buildVersionedTransactions({
      computeUnitPriceMicroLamports: 50000,
    });

    const txSignatures = await pythSolanaReceiver.provider.sendAll(
      versionedTxs,
      {
        skipPreflight: false,
      }
    );
    console.log("txSignatures", txSignatures);

    contest = await pg.account.tokenDraftContest.fetch(contestPda);
    expect(contest.tokenStartPrices.length).equal(priceFeedIds.length);
  });
});
