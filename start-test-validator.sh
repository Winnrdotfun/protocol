#!/bin/bash

source .env

if [[ "$1" == "local" ]]; then
  RPC=$RPC_LOCAL
elif [[ "$1" == "devnet" ]]; then
  RPC=$RPC_DEVNET
elif [[ "$1" == "mainnet" ]]; then
  RPC=$RPC_MAINNET
else
  echo "Usage: $0 {local|devnet|mainnet}"
  exit 1
fi

echo "Starting Solana test validator with RPC URL ($1): $RPC"

solana-test-validator \
  --reset \
  --deactivate-feature EenyoWx9UMXYKpR8mW5Jmfmy2fRjzUtM7NduYMY8bx33 \
  --url $RPC \
  --clone-upgradeable-program rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ \
  --clone-upgradeable-program pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT \
  --clone-upgradeable-program HDwcJBJXjL9FpJ7UBsYBtaDjsBUhuLCUYoz3zr8SWWaQ \
  --clone DBE3N8uNjhKPRHfANdwGvCZghWXyLPdqdSbEW2XFwBiX \
  --clone 6UxPR2nXJNNM1nESVWGAf8NXMVu3SGgYf3ZfUFoGB9cs \
  --clone 6B23K3tkb51vLZA14jcEQVCA1pfHptzEHFA93V5dYwbT \
  --clone 9vNb2tQoZ8bB4vzMbQLWViGwNaDJVtct13AGgno1wazp \
  --clone 5gxPdahvSzcKySxXxPuRXZZ9s6h8hZ88XDVKavWpaQGn \
  --clone DaWUKXCyXsnzcvLUyeJRWou8KTn7XtadgTsdhJ6RHS7b \
  --clone 2t8eUbYKjidMs3uSeYM9jXM9uudYZwGkSeTB4TKjmvnC \
  --clone EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v