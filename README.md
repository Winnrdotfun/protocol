# Winnr Protocol

This is the smart contract repo for Winnr written in Anchor framework. Winnr is a Solana-based app for running token draft contests with on-chain price feeds and decentralized settlement. It leverages the Pyth Network for price data. See [winnr.fun](https://winnr.fun).

## Features

- **Token Draft Contests:** Create and manage contests where participants bet on draft of tokens and compete based on price performance. More type of contests coming soon.
- **On-chain Price Feeds:** Integrates with Pyth Network for historical price updates.
- **Permissionless Settlement:** Contest can be settled by anyone without any rigging.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- [Yarn](https://yarnpkg.com/)
- [Rust](https://www.rust-lang.org/tools/install)
- [Solana](https://solana.com/ru/docs/intro/installation)
- [Anchor](https://www.anchor-lang.com/docs/installation)

### Install Dependencies

```sh
yarn install
```

### Test

```sh
anchor test
```

### Build

```sh
anchor build
```
