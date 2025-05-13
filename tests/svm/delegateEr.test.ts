import { web3, workspace } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LiteSVM } from "litesvm";
import { Protocol } from "../../target/types/protocol";
import {
  ContestParams,
  ONE_DAY,
  ONE_HOUR,
  pythPriceFeedIds,
  sendSvmTransaction,
  UNITS_PER_USDC,
} from "../helpers";
import { fixtureWithContest } from "../fixtures/svm";

describe("delegateEr", () => {
  const pg = workspace.Protocol as Program<Protocol>;
  let mint: web3.PublicKey;

  let signers: web3.Keypair[];
  let svm: LiteSVM;
  let contestParams: ContestParams;

  let contestMetadataPda: web3.PublicKey;
  let contestPda: web3.PublicKey;

  before(async () => {
    const currentTime = Math.floor(Date.now() / 1000);
    const startTime = currentTime - ONE_DAY;
    const endTime = startTime + ONE_HOUR;
    contestParams = {
      startTime,
      endTime,
      entryFee: BigInt(10 * UNITS_PER_USDC),
      maxEntries: 100,
      priceFeedIds: [pythPriceFeedIds.bonk, pythPriceFeedIds.popcat],
      rewardAllocation: [50, 50],
    };

    const res = await fixtureWithContest({ numSigners: 10, contestParams });
    svm = res.svm;
    mint = res.mint;
    signers = res.signers;
    contestMetadataPda = res.contestMetadataPda;
    contestPda = res.contestPda;
  });

  it("delegate to er", async () => {
    const signer = signers[0];

    const accounts = {
      signer: signer.publicKey,
      contest: contestPda,
      contestMetadata: contestMetadataPda,
    };

    const recentBlockhash = svm.latestBlockhash();
    const ixs = await pg.methods.delegateEr().accounts(accounts).instruction();

    const msg = new web3.TransactionMessage({
      payerKey: signer.publicKey,
      instructions: [ixs],
      recentBlockhash: recentBlockhash,
    }).compileToV0Message();
    const tx = new web3.VersionedTransaction(msg);

    sendSvmTransaction(svm, signer, tx);
  });
});
