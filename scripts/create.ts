import { BN, web3 } from "@coral-xyz/anchor";
import {
  chainConfig,
  connection,
  contestMetadataPda,
  env,
  program,
  pythPriceFeedIds,
  pythSolanaReceiver,
  unitsPerUsdc,
  wallet,
} from "./config";
import { hexToBase58, logEnvInfo } from "./utils";

const { PublicKey } = web3;

export const main = async () => {
  logEnvInfo();

  const signer = wallet.payer;
  const programId = program.programId;

  const contestMetadata = await program.account.contestMetadata.fetch(
    contestMetadataPda
  );
  const [contestPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("token_draft_contest"),
      contestMetadata.tokenDraftContestCount.toArrayLike(Buffer, "le", 8),
      signer.publicKey.toBuffer(),
    ],
    programId
  );
  const [contestCreditsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_draft_contest_credits"), contestPda.toBuffer()],
    programId
  );

  const currentTime = Math.floor(Date.now() / 1000);
  const startTime = new BN(currentTime + 5 * 60); // 10 min from now
  const endTime = new BN(startTime.toNumber() + 10 * 60); // 10 min from start
  const entryFee = new BN(1 * unitsPerUsdc);
  const maxEntries = 5;
  const priceFeedIds = [
    pythPriceFeedIds.popcat,
    pythPriceFeedIds.fartcoin,
    pythPriceFeedIds.trump,
  ];
  const tokenFeedIds = priceFeedIds.map((v) => new PublicKey(hexToBase58(v)));
  const feedAccounts = priceFeedIds.map((v) =>
    pythSolanaReceiver.getPriceFeedAccountAddress(0, v)
  );
  // const winnerRewardAllocation = [40, 20, 20, 10, 10];
  const winnerRewardAllocation = [50, 30, 20];

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

  const recentBlockhash = await connection.getLatestBlockhash();
  const ixs = await program.methods
    .createTokenDraftContest(
      startTime,
      endTime,
      entryFee,
      maxEntries,
      tokenFeedIds,
      Buffer.from(winnerRewardAllocation)
    )
    .accounts(accounts)
    .instruction();
  const txMessage = new web3.TransactionMessage({
    payerKey: signer.publicKey,
    instructions: [ixs],
    recentBlockhash: recentBlockhash.blockhash,
  }).compileToV0Message();
  const tx = new web3.VersionedTransaction(txMessage);
  tx.sign([signer]);
  // const sig = await connection.simulateTransaction(tx);
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  await connection.confirmTransaction({
    blockhash: recentBlockhash.blockhash,
    lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
    signature: sig,
  });
  console.log("Tx signature:", sig);
};

main()
  .then((res) => {
    console.log("Contest creation successful!");
  })
  .catch((error) => {
    console.error("Error:", error);
  });
