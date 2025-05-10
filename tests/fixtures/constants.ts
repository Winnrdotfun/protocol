import { Program, workspace } from "@coral-xyz/anchor";
import { Protocol } from "../../target/types/protocol";

const pg = workspace.Protocol as Program<Protocol>;

export const programInfo = {
  address: pg.programId,
  file: "target/deploy/protocol.so",
};

export const fixturePrograms = {
  pythSolanaReceiver: {
    address: "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
    programFile: "program_dumps/pyth-solana-receiver.so",
  },
  pythPriceFeed: {
    address: "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT",
    programFile: "program_dumps/pyth-price-feed.so",
  },
  wormhole: {
    address: "HDwcJBJXjL9FpJ7UBsYBtaDjsBUhuLCUYoz3zr8SWWaQ",
    programFile: "program_dumps/wormhole.so",
  },
};

export const fixtureAccounts = {
  bonkFeedAccount: {
    address: "DBE3N8uNjhKPRHfANdwGvCZghWXyLPdqdSbEW2XFwBiX",
    accountFile: "account_dumps/bonk-feed-account.json",
  },
  popcatFeedAccount: {
    address: "6UxPR2nXJNNM1nESVWGAf8NXMVu3SGgYf3ZfUFoGB9cs",
    accountFile: "account_dumps/popcat-feed-account.json",
  },
  wifFeedAccount: {
    address: "6B23K3tkb51vLZA14jcEQVCA1pfHptzEHFA93V5dYwbT",
    accountFile: "account_dumps/wif-feed-account.json",
  },
  trumpFeedAccount: {
    address: "9vNb2tQoZ8bB4vzMbQLWViGwNaDJVtct13AGgno1wazp",
    accountFile: "account_dumps/trump-feed-account.json",
  },
  fartcoinFeedAccount: {
    address: "2t8eUbYKjidMs3uSeYM9jXM9uudYZwGkSeTB4TKjmvnC",
    accountFile: "account_dumps/fartcoin-feed-account.json",
  },
  wormholeGuardianSetAccount: {
    address: "5gxPdahvSzcKySxXxPuRXZZ9s6h8hZ88XDVKavWpaQGn",
    accountFile: "account_dumps/wormhole-guardian-set-account.json",
  },
  configurationAccount: {
    address: "DaWUKXCyXsnzcvLUyeJRWou8KTn7XtadgTsdhJ6RHS7b",
    accountFile: "account_dumps/configuration-account.json",
  },
};
