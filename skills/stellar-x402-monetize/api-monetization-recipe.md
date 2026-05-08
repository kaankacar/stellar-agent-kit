# API monetization recipe — full Express server example

## Project layout

```
my-paid-api/
├── package.json
├── .env
├── server.ts
└── tsconfig.json
```

## `package.json`

```json
{
  "name": "my-paid-api",
  "version": "0.1.0",
  "type": "module",
  "scripts": { "start": "tsx server.ts" },
  "dependencies": {
    "@x402/express": "^2.0.0",
    "@x402/core": "^2.0.0",
    "@x402/stellar": "^2.0.0",
    "express": "^4.21.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": { "tsx": "^4.19.2", "typescript": "^5.7.2" }
}
```

## `server.ts`

```ts
import "dotenv/config";
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

// Tier your routes by price
app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /weather/free": {
        description: "Basic weather",
        price: "$0.0001",
        network: "stellar:testnet",
        payTo: process.env.STELLAR_RECIPIENT!,
      },
      "GET /weather/premium": {
        description: "Detailed forecast with hourly resolution",
        price: "$0.01",
        network: "stellar:testnet",
        payTo: process.env.STELLAR_RECIPIENT!,
      },
    },
    { facilitator, schemes: [ExactStellarScheme] },
  ),
);

app.get("/weather/free", (_req, res) =>
  res.json({ city: "SF", temp: 18, conditions: "Foggy" }),
);

app.get("/weather/premium", (_req, res) =>
  res.json({
    city: "SF",
    hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, temp: 18 + Math.sin(h) * 5 })),
  }),
);

app.listen(3001, () => console.log("x402 server on :3001"));
```

## `.env`

```
STELLAR_RECIPIENT=G...
OZ_API_KEY=oz_test_...      # optional on testnet
FACILITATOR_URL=https://channels.openzeppelin.com/x402/testnet
```

## Pricing strategy

- Pure data lookup → $0.0001 — $0.001
- Compute-heavy (LLM call, image generation) → $0.01 — $1
- Real-time data (market quotes) → tier by latency / freshness
- Subscription-style → use MPP channel mode instead of x402 (better for high-frequency)

## Charging the right amount

For Stellar specifically:

- **Network fee** (paid by facilitator): ~0.00001 XLM ≈ $0.000001 — effectively free
- **OZ Channels facilitator fee**: cents-on-the-dollar service fee
- **Your margin**: the rest

Don't undercharge to compete with free APIs — agents are ~insensitive to small price differences. Charge what your data is worth; settlement-cost competition is a race to the bottom.

## Going to mainnet checklist

- [ ] Production OZ API key (`https://channels.openzeppelin.com/gen`)
- [ ] Production STELLAR_RECIPIENT address (with USDC trustline pre-established)
- [ ] FACILITATOR_URL switched to `https://channels.openzeppelin.com/x402`
- [ ] Network changed from `stellar:testnet` to `stellar:pubnet` in route configs
- [ ] Tested end-to-end with a real client paying real testnet USDC first
- [ ] Monitoring on the recipient address (StellarExpert webhook or similar)
