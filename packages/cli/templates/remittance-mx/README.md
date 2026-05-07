# {{projectName}}

Mexican peso ↔ USDC remittance flow on Stellar via Etherfuse SPEI rails. Testnet sandbox by default.

## Setup

1. Get an Etherfuse devnet API key at https://devnet.etherfuse.com/ramp
2. Generate a Stellar testnet keypair and fund it via Friendbot
3. Fill in `.env`
4. `npm install && npm start`

## The flow

1. **Create customer** — generates a `customer_id` + `bank_account_id` and registers with Etherfuse. These IDs are persisted in the kit's KV store and reused on every subsequent run.
2. **KYC URL** — send the user to this URL to complete KYC (you can't quote/order before this).
3. **Get quote** — MXN → CETES (or any supported asset)
4. **Create on-ramp order** — returns SPEI payment instructions (CLABE, beneficiary, reference). The user wires fiat to that CLABE; tokens land on Stellar after.

Steps 3 and 4 are commented in `index.ts`. Uncomment them after KYC is approved on the customer.

## Switching to mainnet

Change `etherfuseNetwork: "testnet"` to `"mainnet"` and update the `rpcUrl`/`horizonUrl`/`networkPassphrase`. Use a production Etherfuse API key.
