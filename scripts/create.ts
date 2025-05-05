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
import { hexToBase58 } from "./utils";

const { PublicKey } = web3;

export const main = async () => {
  console.log(`Executing script on: ${env} (${chainConfig.rpc})`);
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
  const startTime = new BN(currentTime + 60 * 60); // 1 hour from now
  const endTime = new BN(startTime.toNumber() + 60 * 60 * 24); // 1 day from now
  const entryFee = new BN(10 * unitsPerUsdc);
  const maxEntries = 100;
  const priceFeedIds = [
    pythPriceFeedIds.bonk,
    pythPriceFeedIds.popcat,
    pythPriceFeedIds.wif,
    pythPriceFeedIds.trump,
  ];
  const tokenFeedIds = priceFeedIds.map((v) => new PublicKey(hexToBase58(v)));
  const feedAccounts = priceFeedIds.map((v) =>
    pythSolanaReceiver.getPriceFeedAccountAddress(0, v)
  );
  const winnerRewardAllocation = [40, 20, 20, 10, 10];

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

  const tx = await program.methods
    .createTokenDraftContest(
      startTime,
      endTime,
      entryFee,
      maxEntries,
      tokenFeedIds,
      Buffer.from(winnerRewardAllocation)
    )
    .accounts(accounts)
    .transaction();

  tx.recentBlockhash = await connection
    .getLatestBlockhash()
    .then((r) => r.blockhash);
  tx.feePayer = wallet.publicKey;

  const signedTx = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: true,
  });
  console.log("Creation tx signature:", sig);
};

main()
  .then((res) => {
    console.log("Contest creation successful!");
  })
  .catch((error) => {
    console.error("Error initializing program:", error);
  });
