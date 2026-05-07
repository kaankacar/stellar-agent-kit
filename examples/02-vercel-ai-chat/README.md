# Vercel AI Chat — Stellar Agent

A minimal Next.js + Vercel AI SDK chat UI driven by Stellar Agent Kit.

## Setup

```bash
cp .env.example .env
# fill in OPENAI_API_KEY and STELLAR_SECRET_KEY
pnpm install
pnpm --filter @stellar-agent-kit/example-vercel-ai-chat dev
```

Open http://localhost:3010.

## What the agent can do

By default it loads `plugin-asset`, `plugin-data`, `plugin-defi`, `plugin-domain` — covering balance reads, transfers, trustlines, Blend / Soroswap / Reflector, Stellar Expert lookups, and Soroban Domains resolution. Add more plugins in `lib/agent.ts`.

## Wallet model

This example uses a server-side `KeypairWallet` (private key in `.env`). For browser-side wallets (Freighter, Stellar Wallets Kit), keep the chat-orchestration server-side but build & sign-and-submit on the client — see the wallet flow in `examples/04-mcp-server` for a non-Next.js shape, or wire `FreighterWallet` directly.
