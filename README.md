# Stellar Agent Kit

Connect any AI agent to Stellar / Soroban. A TypeScript SDK with a plugin architecture and adapters for **LangChain, Vercel AI SDK, OpenAI tool-calling, and Anthropic tool-calling**.

> **Status:** `v0.1.0-alpha.1` — pre-release. 16 packages (core + 12 plugins/adapters + runner + CLI scaffolder), 116 tests, ~80 agent actions + autonomous-agent runner, end-to-end verified on testnet.

## Why

The Stellar ecosystem has rich on-chain primitives for payments, DeFi, anchors (fiat rails), passkey smart wallets, and agentic-payment protocols (x402, MPP). This kit gives an LLM a typed function table covering all of them, so you can build agents that pay for APIs, swap tokens, lend, on-ramp fiat, and more — using whatever AI framework you already have.

## What's in v0.1.0-alpha.1

| Package | Actions | Purpose |
| --- | --- | --- |
| `@stellar-agent-kit/core` | — | `StellarAgentKit` class · `BaseWallet` interface · `KeypairWallet`, `FreighterWallet`, `WalletsKitWallet` · adapters for Vercel AI, LangChain, OpenAI, Anthropic |
| `@stellar-agent-kit/plugin-asset` | 15 | Classic Stellar ops: transfer · path payment (strict-send + strict-receive) · trustlines · issuance · set-options · claimable balances · balance read · **Classic DEX** (manage sell/buy offer, cancel, get orderbook) · **Friendbot fund** |
| `@stellar-agent-kit/plugin-soroban` | 9 | Install WASM · deploy · invoke · simulate · read contract data · fetch events · **OZ Fungible token info / balance / transfer** |
| `@stellar-agent-kit/plugin-defi` | 12 | Blend (supply / borrow / withdraw / repay / position) · Soroswap quote + swap + **LP add/remove** · Reflector price + TWAP + **multi-feed directory** |
| `@stellar-agent-kit/plugin-data` | 7 | Stellar Expert account/asset · RPC latest ledger · Horizon tx history · **CoinGecko price / trending / token info** |
| `@stellar-agent-kit/plugin-payments` | 2 | x402 paid-API fetch · MPP charge fetch |
| `@stellar-agent-kit/plugin-anchor` | 7 | Etherfuse, AlfredPay, BlindPay (real API endpoint paths verified against the regional-starter-pack reference) · `network: testnet \| mainnet` per-provider with sandbox URL defaults · BlindPay off-ramp auto-signs via the agent wallet · Etherfuse sandbox `simulateFiatReceived` · persistent customer-id storage |
| `@stellar-agent-kit/plugin-defindex` | 4 | List vaults · deposit · withdraw · get position |
| `@stellar-agent-kit/plugin-smart-wallet` | 2 | Read-side OZ smart-account info · `SmartAccountWallet` adapter |
| `@stellar-agent-kit/plugin-domain` | 2 | Soroban Domains forward + reverse resolution |
| `@stellar-agent-kit/plugin-trustless-work` | 8 | Escrow-as-a-service: create single/multi-release · fund · update milestone · approve · release · raise dispute |
| `@stellar-agent-kit/plugin-bridge` | 3 | Cross-chain bridging via Allbridge Core: list tokens · quote · build raw tx |
| `@stellar-agent-kit/plugin-nft` | 9 | OpenZeppelin Stellar NFT trait: mint, transfer, approve, burn, balance / owner / token-uri / collection-info / **royalty info (ERC-2981)** |
| `@stellar-agent-kit/adapter-mcp` | — | Expose the kit as a Model Context Protocol server (Claude Code, Cursor) |
| `@stellar-agent-kit/runner` | — | **Autonomous + scheduled agent loops** with layered safety: action allowlist, per-asset spend caps, network sandbox, human-in-loop, dry-run. Vercel AI SDK as LLM abstraction. |
| `create-stellar-agent` | — | **`npx create-stellar-agent <name>`** scaffolder. Templates: `remittance-mx`, `agentic-defi`, `mcp-server`, `autonomous-runner`. |

## Quickstart

```bash
pnpm add @stellar-agent-kit/core @stellar-agent-kit/plugin-asset
```

```ts
import { StellarAgentKit, KeypairWallet, createVercelAITools } from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
import { Networks } from "@stellar/stellar-sdk";

const wallet = new KeypairWallet("S...your-secret...");

const agent = new StellarAgentKit(wallet, {
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
}).use(StellarAssetPlugin);

const tools = createVercelAITools(agent, agent.actions);
// pass `tools` to `generateText` / `streamText` from the Vercel AI SDK
```

Equivalent helpers exist for LangChain, OpenAI, and Anthropic:
- `createLangchainTools(agent, agent.actions)` → `DynamicStructuredTool[]`
- `createOpenAITools(agent, agent.actions)` → `{ tools, execute(name, args) }`
- `createClaudeTools(agent, agent.actions)` → `{ tools, execute(name, input) }`

## Live testnet smoke test

```bash
pnpm install
pnpm build
pnpm --filter @stellar-agent-kit/example-basic-quickstart start
```

This generates a fresh keypair, funds it via Friendbot, registers `plugin-asset` + `plugin-data`, runs `ASSET_GET_BALANCE`, sends a self-transfer, and reads `HORIZON_TX_HISTORY` — all using the agent action surface.

## Wallets

| Wallet               | Package                                  | Form factor     |
| -------------------- | ---------------------------------------- | --------------- |
| `KeypairWallet`      | `@stellar-agent-kit/core`                | Server / script |
| `FreighterWallet`    | `@stellar-agent-kit/core`                | Browser         |
| `WalletsKitWallet`   | `@stellar-agent-kit/core`                | Browser (multi) |
| `SmartAccountWallet` | `@stellar-agent-kit/plugin-smart-wallet` | Passkey         |

## Architecture

The plugin and action shape follows [`sendaifun/solana-agent-kit`](https://github.com/sendaifun/solana-agent-kit) (Apache-2.0): each plugin registers an array of zod-schema'd `Action`s, the agent class collects them, and AI-framework adapters translate them into framework-native tool formats. Wallets are abstracted behind a `BaseWallet` interface that signs Stellar XDR strings and (optionally) Soroban auth entries.

Per-plugin documentation lives in each package's source. Critical gotchas (Etherfuse `customer_id` persistence, Blend trustline pre-checks, Soroban simulate-before-send) are encoded in the action handlers — sourced from `kaankacar/stellar-defi-gotchas` and `briwylde08/stellar-hackathon-faq`.

## Examples

| Path | What it shows |
| --- | --- |
| `examples/01-basic-quickstart` | Node script: KeypairWallet + plugin-asset + plugin-data; live testnet round-trip |
| `examples/02-vercel-ai-chat` | Next.js + Vercel AI SDK chat UI with asset + data + defi + domain plugins |
| `examples/03-langchain-react-agent` | LangChain `createToolCallingAgent` driving the kit. Offline sanity check works without an OpenAI key. |
| `examples/04-mcp-server` | Stdio MCP server exposing core + asset + data + defi plugins to Claude Code / Cursor |

## Anchors (fiat rails) — testnet vs mainnet

All three anchor providers support both networks via a per-provider `network` config (defaults to `testnet`):

```ts
const agent = new StellarAgentKit(wallet, {
  rpcUrl: "...",
  horizonUrl: "...",
  networkPassphrase: Networks.TESTNET,
  apiKeys: {
    etherfuse: "...",
    etherfuseNetwork: "testnet", // or "mainnet"
    alfredpay: "...",
    alfredpaySecret: "...",
    alfredpayNetwork: "testnet",
    blindpay: "...",
    blindpayInstanceId: "...",
    blindpayNetwork: "testnet",  // mapped to BlindPay's "stellar_testnet"; "mainnet" → "stellar"
    anchorNetwork: "testnet",    // global default if no per-provider override
  },
});
```

Provider URL defaults:
- **Etherfuse** — testnet `https://api.sand.etherfuse.com` · mainnet `https://api.etherfuse.com`
- **AlfredPay** — testnet `https://penny-api-restricted-dev.alfredpay.io/api/v1/third-party-service/penny` · mainnet `https://api-service-co.alfredpay.app/api/v1/third-party-service/penny`
- **BlindPay** — same host (`https://api.blindpay.com`); network field switches between development and production *instance*

BlindPay's `createCustomer` requires a browser-side ToS redirect + full KYC PII that can't be done from a single server call — the action throws `NOT_IMPLEMENTED_v01` with a pointer to the canonical reference flow. Use `generateTosUrl()` directly to start.

## Autonomous agents

```bash
npx create-stellar-agent my-bot --template=autonomous-runner
```

A 60-second path to a running, testnet-sandboxed autonomous Stellar agent driven by a free OpenRouter LLM. The kit's `runner` package wires layered safety controls (allowlist + spend caps + network sandbox + human-in-loop + dry-run) so the agent's blast radius is bounded by code, not by trust in the LLM. See [`AUTONOMOUS_AGENTS.md`](./AUTONOMOUS_AGENTS.md) for the full guide.

Companion repo: [`stellar-agent-kit-skills`](https://github.com/stellar/stellar-agent-kit-skills) — Claude Code / Codex / Cursor agent-skills with curated playbooks for `stellar-remittance-mx`, `stellar-autonomous-agent`, `stellar-x402-monetize`.

## Webhooks (production hardening)

Both `plugin-anchor` and `plugin-trustless-work` ship framework-agnostic webhook handlers (Express / Next App Router / Hono adapters) with HMAC-SHA256 signature verification. State-changing actions (e.g. `ASSET_TRANSFER`) accept an optional `idempotencyKey` to make retries safe.

```ts
import { expressAnchorWebhook } from "@stellar-agent-kit/plugin-anchor";

app.post(
  "/webhooks/etherfuse",
  express.raw({ type: "application/json" }),
  expressAnchorWebhook({
    provider: "etherfuse",
    verify: { secret: process.env.ETHERFUSE_WEBHOOK_SECRET! },
    onEvent: async (event) => {
      if (event.type === "kyc.approved") await markCustomerReady(event.customerId);
      if (event.type === "onramp.completed") await notifyUserOfDeposit(event.orderId);
    },
  }),
);
```

## What's next

- A Soroban NFT contract deploy helper (currently consumers deploy an OZ NFT contract themselves and pass the contract id)
- Native USDC CCTP bridging in `plugin-bridge` (currently Allbridge only)
- Soroban Domains *registration* in `plugin-domain` (currently read-only)
- BlindPay full ToS + receiver creation flow
- Smart-account on-chain policy verification in `runner` (currently a `TODO_SMART_ACCOUNT_POLICY_VERIFICATION` marker)

## License

Apache-2.0 — see [LICENSE](./LICENSE).
