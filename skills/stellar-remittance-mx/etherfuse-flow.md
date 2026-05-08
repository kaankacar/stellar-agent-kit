# Etherfuse on Stellar — full gotcha catalog

These are the documented quirks pulled from `briwylde08/stellar-hackathon-faq`, `kaankacar/stellar-defi-gotchas`, and the regional-starter-pack reference. Encode them in your code or your tests will lie to you.

## Authentication

| Provider | Header |
| --- | --- |
| Etherfuse | `Authorization: <api-key>` (NO `Bearer` prefix) |
| AlfredPay | dual: `api-key: <key>` + `api-secret: <secret>` |
| BlindPay | `Authorization: Bearer <api-key>` |
| DeFindex | `Authorization: Bearer <api-key>` |
| Trustless Work | `Authorization: Bearer <api-key>` |

Mixing Bearer / non-Bearer is the #1 source of mysterious 401s. The kit's clients handle this correctly; if you write your own, get it right.

## Customer / bank account ID permanence

```
✗ WRONG: Generate UUIDs on every quote request
✓ RIGHT: Generate ONCE per user, persist, reuse forever
```

Etherfuse binds the IDs to the user during KYC. After KYC, only the original IDs work. The kit's `plugin-anchor` actions persist them via `agent.kvStore` keyed on the wallet's pubkey — but that store needs to be persistent across sessions. Default `InMemoryKVStore` is wiped on process exit.

For cron jobs, supply a `FileKVStore` (the `autonomous-runner` template ships with one).

## Sandbox vs production URLs

| Network | Base URL |
| --- | --- |
| Testnet (sandbox) | `https://api.sand.etherfuse.com` |
| Mainnet (production) | `https://api.etherfuse.com` |

The kit's `EtherfuseClient` defaults to testnet; pass `network: "mainnet"` to switch (or `etherfuseNetwork: "mainnet"` in the agent config).

## Sandbox order progression

Sandbox orders **do not auto-progress**. To simulate fiat arrival:

```ts
await executeAction(action("ANCHOR_SIMULATE_FIAT_RECEIVED"), agent, {
  provider: "etherfuse",
  orderId: order.id,
});
```

Mainnet has no equivalent — real SPEI transfers progress orders.

## Indexing delay

Immediately after creating an order, `ANCHOR_GET_ONRAMP_STATUS` may return `404` or empty data. Wait 3–10 seconds, then retry. Use exponential backoff in production.

## Response envelope inconsistency

Some endpoints wrap their response in `{onramp: {...}}` or `{offramp: {...}}` (the create-order endpoint), others return flat shapes (the get-order endpoint). The kit's client normalises this; you don't need to think about it unless you bypass the client.

## Asset-pair resolution

For crypto assets, you must pass `CODE:ISSUER` format (e.g. `USDC:GBBD47IF...`). For fiat, just the currency code (`MXN`).

The reference impl does an extra `GET /ramp/assets` lookup to resolve `USDC` → `USDC:GBBD47IF...`. The kit's client doesn't — pass the qualified form to avoid an extra API hit.

## Available stablebonds (Etherfuse-issued)

| Code | Backing |
| --- | --- |
| `MXNe` | Mexican peso (1:1) |
| `CETES` | Mexican government short-term debt |
| `USTRY` | US Treasury bills |
| `KTB` | Korean Treasury bonds |
| `CARN` | Colombian government debt |
| `CZERO` | EU short-term debt |

Each has its own issuer address on testnet vs mainnet. Look these up at `https://docs.etherfuse.com` or in the regional-starter-pack `.env.example`.

## When NOT to use Etherfuse

- Brazilian PIX rails → **AlfredPay** is the better fit
- USDB stablecoin (development testnet) → **BlindPay**
- ACH (US) → no kit-native provider yet; integrate via SEP-24
- SEPA (EU) → no kit-native provider yet
