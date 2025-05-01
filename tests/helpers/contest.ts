import { AnchorProvider, BN, Program, utils, web3 } from "@coral-xyz/anchor";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { Protocol } from "../../target/types/protocol";
import { hexToBase58 } from "../helpers";

const { PublicKey } = web3;

export const createContest = async (args: {
  provider: AnchorProvider;
  program: Program<Protocol>;
  contestMetadataPda: web3.PublicKey;
  pythSolanaReceiver: PythSolanaReceiver;
  contestParams: {
    startTime: BN;
    endTime: BN;
    entryFee: BN;
    maxEntries: number;
    numWinners: number;
    priceFeedIds: string[];
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
  const programId = pg.programId;

  const contestMetadata = await pg.account.contestMetadata.fetch(
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

  const { startTime, endTime, entryFee, maxEntries, numWinners, priceFeedIds } =
    contestParams;
  const tokenFeedIds = priceFeedIds.map((v) => new PublicKey(hexToBase58(v)));
  const feedAccounts = priceFeedIds.map((v) =>
    pythSolanaReceiver.getPriceFeedAccountAddress(0, v)
  );

  const accounts = {
    signer: signer.publicKey,
    contestMetadata: contestMetadataPda,
    contest: contestPda,
    feed0: feedAccounts[0],
    feed1: feedAccounts[1] || null,
    feed2: feedAccounts[2] || null,
    feed3: feedAccounts[3] || null,
    feed4: feedAccounts[4] || null,
  };

  const txSignature = await pg.methods
    .createTokenDraftContest(
      startTime,
      endTime,
      entryFee,
      maxEntries,
      numWinners,
      tokenFeedIds
    )
    .accounts(accounts)
    .signers([signer])
    .rpc();

  return { txSignature, contestPda };
};

export const enterContest = async (args: {
  provider: AnchorProvider;
  program: Program<Protocol>;
  contestPda: web3.PublicKey;
  configPda: web3.PublicKey;
  programTokenAccountPda: web3.PublicKey;
  mint: web3.PublicKey;
  signerTokenAccount: web3.PublicKey;
  creditAllocation: number[];
}) => {
  const {
    provider,
    program: pg,
    contestPda,
    mint,
    signerTokenAccount,
    creditAllocation,
  } = args;
  const wallet = provider.wallet;
  const signer = wallet.payer;
  const programId = pg.programId;

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
    config: args.configPda,
    contest: contestPda,
    contestEntry: contestEntryPda,
    mint,
    programTokenAccount: args.configPda,
    signerTokenAccount,
    tokenProgram: utils.token.TOKEN_PROGRAM_ID,
  };

  const txSignature = await pg.methods
    .enterTokenDraftContest(creditAllocation)
    .accounts(accounts)
    .signers([signer])
    .rpc();

  return { txSignature, contestEntryPda };
};
