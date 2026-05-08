---
name: stellar-x402-monetize
description: Turn an HTTP API into an x402-paid endpoint that AI agents can buy from on Stellar (USDC settlement, ~5s finality, sub-cent fees, zero-XLM clients). Or, write an agent that pays for x402-paywalled APIs. Covers seller (@x402/express) and buyer (@stellar-agent-kit/plugin-payments) sides plus testnet runbook.
---

# Monetize an API for AI agents — x402 on Stellar

## When to use this skill

You want either:

- **Seller side**: charge $0.0001–$1 per request to your HTTP API, settled in USDC on Stellar, with no API-key management on the buyer side.
- **Buyer side**: write an agent that pays for paywalled APIs autonomously without managing fiat or seed phrases.

x402 is the right protocol when you want **zero-XLM clients** (the OZ Channels facilitator sponsors network fees). If you want a no-third-party-dependency setup, use MPP instead — `@stellar-agent-kit/plugin-payments` exposes both as `X402_FETCH` and `MPP_CHARGE_FETCH` actions.

## How x402 works on Stellar

```
Client → GET /resource                                   → Server
Client ← 402 Payment Required (paymentRequirements)      ← Server
Client builds Soroban SAC USDC transfer
Client signs the AUTH ENTRY (not the full tx envelope)
Client → GET /resource + X-PAYMENT header                → Server
Server → /verify + /settle → OZ Channels facilitator
Facilitator → Stellar (~5s finality)
Client ← 200 OK + resource
```

Stellar-specific: clients sign auth entries, not full tx envelopes. The facilitator assembles + submits + pays fees. Client needs USDC trustline + balance, but **no XLM**.

## Seller side — monetize an Express API

```bash
npm install @x402/express @x402/core @x402/stellar express dotenv
```

```ts
import express from "express";
import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";

const app = express();

const facilitator = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL ?? "https://channels.openzeppelin.com/x402/testnet",
  createAuthHeaders: process.env.OZ_API_KEY
    ? async () => {
        const h = { Authorization: `Bearer ${process.env.OZ_API_KEY}` };
        return { verify: h, settle: h, supported: h };
      }
    : undefined,
});

app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /weather": {
        description: "Current weather",
        price: "$0.001",                              // auto-converts to 7-decimal USDC
        network: "stellar:testnet",                   // CAIP-2 network ID
        payTo: process.env.STELLAR_RECIPIENT!,        // your G... address
      },
    },
    { facilitator, schemes: [ExactStellarScheme] },
  ),
);

app.get("/weather", (_req, res) => res.json({ temp: 18, conditions: "Foggy" }));
app.listen(3001);
```

Env vars:

- `STELLAR_RECIPIENT` — your G... address (receives USDC)
- `OZ_API_KEY` — OZ Channels key (testnet `https://channels.openzeppelin.com/testnet/gen`, mainnet `https://channels.openzeppelin.com/gen`)
- `FACILITATOR_URL` — defaults to testnet OZ Channels

## Buyer side — agent that pays

The kit ships `X402_FETCH` as a first-class agent action. Configure once, the agent's LLM can call paid APIs as tools.

```ts
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { PaymentsPlugin } from "@stellar-agent-kit/plugin-payments";
import { Networks } from "@stellar/stellar-sdk";

const wallet = new KeypairWallet(process.env.STELLAR_SECRET_KEY!);
const agent = new StellarAgentKit(wallet, {
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  apiKeys: { x402SecretKey: process.env.STELLAR_SECRET_KEY! }, // for auth-entry signing
}).use(PaymentsPlugin);

// In an autonomous loop, the LLM can now call:
//   X402_FETCH({ url: "http://localhost:3001/weather", network: "stellar:testnet" })
// and pay automatically.
```

Or call it manually:

```ts
import { executeAction } from "@stellar-agent-kit/core";
const result = await executeAction(
  agent.actions.find((a) => a.name === "X402_FETCH")!,
  agent,
  { url: "http://localhost:3001/weather", network: "stellar:testnet" },
);
console.log(result); // { status: 200, body: { temp: 18, ... } }
```

## Testnet runbook

1. **Generate a Stellar testnet keypair**:

   ```bash
   node -e "const {Keypair}=require('@stellar/stellar-sdk');const k=Keypair.random();console.log('Public:',k.publicKey());console.log('Secret:',k.secret());"
   ```

2. **Friendbot fund**:

   ```bash
   curl "https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY"
   ```

3. **Add USDC trustline** — open Stellar Lab or use the kit's `ASSET_TRUSTLINE_ADD` action. Testnet USDC issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`.

4. **Get testnet USDC** — Circle's faucet: `https://faucet.circle.com/` (select Stellar testnet).

5. **Get OZ Channels testnet API key** (optional on testnet, required on mainnet): `https://channels.openzeppelin.com/testnet/gen`.

6. **Run server + client** — server on `localhost:3001`, client points at it. Watch the logs; settlement takes ~5s.

## Mainnet config

| | Mainnet |
| --- | --- |
| Network ID | `stellar:pubnet` |
| RPC URL | provider-specific (see [Stellar RPC providers](https://developers.stellar.org/docs/data/rpc/providers)) |
| Facilitator URL | `https://channels.openzeppelin.com/x402` |
| USDC SAC | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` |
| OZ API key | required |

## Common pitfalls (from x402 testnet runs)

| Symptom | Cause | Fix |
| --- | --- | --- |
| `op_no_trust` | Missing USDC trustline | Add via `ASSET_TRUSTLINE_ADD` |
| Auth-entry expired | Cached auth entry | Use `latestLedger + 12` for `validUntilLedger`; don't reuse |
| Payment off by 10× | Decimal mismatch | Stellar USDC is 7 decimals (not 6 like EVM USDC). `$0.001 = 10000` base units |
| TS errors | Mixed v1/v2 packages | Use all `@x402/*` at the same major version |

## Pairs with

- [`stellar-autonomous-agent`](../stellar-autonomous-agent/SKILL.md) — wire `X402_FETCH` into an allowlist for an autonomous agent that buys APIs
- [`stellar-remittance-mx`](../stellar-remittance-mx/SKILL.md) — sell remittance lookups as paid x402 endpoints
