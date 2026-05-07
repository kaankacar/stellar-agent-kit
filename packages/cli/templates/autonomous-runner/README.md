# {{projectName}}

Autonomous Stellar agent driven by a free OpenRouter LLM, with layered safety controls.

## Setup

```bash
cp .env.example .env
# Set STELLAR_SECRET_KEY (generate via `node -e "console.log(require('@stellar/stellar-sdk').Keypair.random().secret())"`)
# Set OPENROUTER_API_KEY (get free at https://openrouter.ai/keys)

npm install
npm start
```

## Safety layers (read this!)

This agent is wired with four enforcement layers. From strongest to weakest:

| Layer | What it does |
| --- | --- |
| **Network sandbox** (`TestnetSandbox`) | Hard-refuses any run if the wallet isn't on testnet. Stops mainnet accidents at construction time. |
| **Action allowlist** | The LLM only sees `ASSET_GET_BALANCE`, `ACCOUNT_FRIENDBOT_FUND`, and a few read-only actions. It cannot call `ASSET_TRANSFER` or `BLEND_BORROW` even if it wanted to. |
| **Spend cap** | Cumulative per-asset cap: 50 USDC and 100 XLM per 24 hours. Caps survive across `runOnce` invocations via the KV store. |
| **System prompt** | The LLM is told what's allowed. Treat as advisory only. |

To go to mainnet, change `TestnetSandbox` to `MainnetSandbox` and update the network in `StellarAgentKit` config — and review every layer above first.

## Files

- `index.ts` — `autonomousRun` loop (interactive)
- `run-once.ts` — `runOnce` for cron-driven scheduled runs (resumable across invocations via `agent-state.json`)
- `.env.example` — required env vars

## Cron example

```
# Run every 6 hours, append output to ./agent.log
0 */6 * * * cd /path/to/{{projectName}} && npm run once >> ./agent.log 2>&1
```

## Switching models

The default is NVIDIA Nemotron 3 Super (free on OpenRouter). To use GPT-4o-mini:

```ts
import { openai } from "@ai-sdk/openai";
const llm = openai("gpt-4o-mini");
```

Or Claude Haiku via Anthropic. Any tool-calling-capable Vercel-AI-SDK-compatible model works.
