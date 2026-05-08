---
name: stellar-remittance-mx
description: Build a Mexican-peso ↔ USDC/CETES remittance flow on Stellar via Etherfuse SPEI on/off-ramps. Covers KYC handling, customer-id permanence gotcha, testnet vs mainnet URLs, and the on-chain swap step. Use when building MXN remittance, payout-to-bank, or USDC-from-pesos flows.
---

# Stellar remittance — Mexican peso rails

## When to use this skill

You're building anything that moves value between a Mexican bank account (SPEI) and Stellar tokens — remittances, payouts, payroll, on-ramping for a Mexican user, or off-ramping a Stellar wallet to MXN.

The kit already wraps Etherfuse, AlfredPay, and BlindPay. Etherfuse is the most documented and SDF-DevRel-tested for Mexico. Defaults below assume Etherfuse + testnet sandbox; switch to mainnet by changing two config values.

## The core flow (5 steps)

```
1. Create or look up customer       → ANCHOR_CREATE_CUSTOMER
2. Send user to KYC URL             → ANCHOR_GET_KYC_URL
3. (after KYC approved) Get quote   → ANCHOR_GET_QUOTE
4. Create on-ramp order             → ANCHOR_CREATE_ONRAMP  → returns SPEI CLABE
5. User wires fiat to CLABE; poll   → ANCHOR_GET_ONRAMP_STATUS
```

Off-ramp is the same flow in reverse: `ANCHOR_CREATE_OFFRAMP` returns a Stellar deposit address; you transfer tokens there with `plugin-asset`, and Etherfuse pays out to the user's registered bank account.

## Critical gotchas (read [`etherfuse-flow.md`](./etherfuse-flow.md) for the full list)

1. **Customer ID permanence** — Etherfuse permanently binds `customer_id` + `bank_account_id` to a wallet at KYC time. If your app generates new IDs on subsequent runs, every quote/order will fail. The kit's `plugin-anchor` persists these in the agent's `KVStore` automatically — just make sure you're using a persistent KV (default is in-memory, fine for scripts; use a `FileKVStore` for cron jobs / production).

2. **Auth header is bare** — Etherfuse: `Authorization: <api-key>` with no `Bearer` prefix. (DeFindex uses Bearer; AlfredPay uses dual `api-key` + `api-secret`. Don't cross them.)

3. **Sandbox needs manual fiat-arrival simulation** — testnet orders don't auto-progress. Call `ANCHOR_SIMULATE_FIAT_RECEIVED` to advance them. Mainnet doesn't have or need this.

4. **3–10s indexing delay** — after creating an order, the first `ANCHOR_GET_ONRAMP_STATUS` may return null. Poll, don't single-shot.

5. **KYC must happen in browser before quoting** — agent can generate the URL, but the human must visit it.

## Scaffold

The fastest path is the CLI:

```bash
npx create-stellar-agent my-remittance --template=remittance-mx
cd my-remittance
cp .env.example .env
# fill ETHERFUSE_API_KEY (testnet: https://devnet.etherfuse.com/ramp)
# fill STELLAR_SECRET_KEY (Friendbot a fresh testnet keypair)
npm install && npm start
```

The generated `index.ts` runs steps 1 and 2. Steps 3–5 are commented; uncomment after KYC is approved on the test customer.

## Manual setup

```ts
import { Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet, executeAction } from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
import { AnchorPlugin } from "@stellar-agent-kit/plugin-anchor";

const wallet = new KeypairWallet(process.env.STELLAR_SECRET_KEY!);
const agent = new StellarAgentKit(wallet, {
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  apiKeys: {
    etherfuse: process.env.ETHERFUSE_API_KEY!,
    etherfuseNetwork: "testnet",     // → https://api.sand.etherfuse.com
    // etherfuseNetwork: "mainnet",  // → https://api.etherfuse.com
  },
}).use(StellarAssetPlugin).use(AnchorPlugin);

const action = (n: string) => agent.actions.find((a) => a.name === n)!;

const customer = await executeAction(action("ANCHOR_CREATE_CUSTOMER"), agent, {
  provider: "etherfuse",
  email: "user@example.com",
  country: "MX",
});

const kycUrl = await executeAction(action("ANCHOR_GET_KYC_URL"), agent, {
  provider: "etherfuse",
  customerId: customer.id,
});
console.log("Send your user to:", kycUrl);
```

## Testnet runbook

1. Get a devnet Etherfuse API key: `https://devnet.etherfuse.com/ramp`
2. Generate a Stellar testnet keypair, fund via `https://friendbot.stellar.org?addr=<G...>`
3. Run the script above; user completes KYC on Etherfuse devnet
4. Quote MXN → USDC (or CETES, USTRY, KTB, CARN, CZERO — Etherfuse stablebonds)
5. Create on-ramp order; receive sandbox CLABE
6. Simulate fiat arrival: `executeAction(action("ANCHOR_SIMULATE_FIAT_RECEIVED"), agent, { provider: "etherfuse", orderId: order.id })`
7. Poll status until `completed`; tokens land in the user's Stellar wallet

## Going to mainnet

Change three things:

```ts
networkPassphrase: Networks.PUBLIC,
horizonUrl: "https://horizon.stellar.org",
rpcUrl: "https://mainnet.sorobanrpc.com", // or your provider
apiKeys: {
  etherfuse: PRODUCTION_KEY,
  etherfuseNetwork: "mainnet", // → https://api.etherfuse.com
},
```

Mainnet sandbox-fiat-simulation is unsupported. Real SPEI transfers progress orders.

## Pairs with

- [`stellar-autonomous-agent`](../stellar-autonomous-agent/SKILL.md) — wrap this remittance flow in an autonomous loop
- [`stellar-x402-monetize`](../stellar-x402-monetize/SKILL.md) — charge other agents for remittance lookups
