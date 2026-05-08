---
name: stellar-agent-kit
description: Drive the Stellar / Soroban network from any AI agent (Hermes, OpenClaw, Claude Code, Cursor) using the @stellar-agent-kit npm package or its MCP server. Use when the user asks about sending XLM/USDC, trustlines, swaps (Soroswap), lending (Blend), token issuance, Soroban contracts, fiat on/off-ramps (anchors), or building a Stellar-aware AI agent.
license: Apache-2.0
---

# Stellar Agent Kit — drop-in skill

Copy this file into your agent's skills directory (`~/.hermes/skills/`, `~/.openclaw/skills/`, `~/.claude/skills/`, etc.) and your assistant will know how to use the [Stellar Agent Kit](https://www.npmjs.com/package/@stellar-agent-kit/all) without further setup.

## When to use this skill

Trigger on any of:

- "send X XLM to G…"
- "swap X to USDC"
- "trustline USDC" / "establish a trustline"
- "supply / borrow on Blend"
- "deploy a Soroban contract" / "invoke contract C…"
- "fetch XLM/USDC price" (Reflector / CoinGecko)
- "MXN ↔ CETES / Etherfuse" (anchors)
- "build me a Stellar agent" / "make my agent autonomous on Stellar"

For non-Stellar chains (Ethereum, Solana, Bitcoin, Sui, NEAR), DO NOT use this skill — it's Stellar/Soroban-only.

## What you can do

The kit ships ~80 actions across these plugins. Names are stable and uppercase — call them by name.

| Plugin | Key actions |
|---|---|
| `plugin-asset` | `ASSET_TRANSFER`, `ASSET_TRUSTLINE_ADD`, `ASSET_TRUSTLINE_REMOVE`, `ASSET_GET_BALANCE`, `ASSET_ISSUE`, `ASSET_PATH_PAYMENT_STRICT_SEND`, `ASSET_PATH_PAYMENT_STRICT_RECEIVE`, `ASSET_KNOWN_ISSUERS`, `DEX_MANAGE_SELL_OFFER`, `DEX_MANAGE_BUY_OFFER`, `DEX_GET_ORDERBOOK`, `ACCOUNT_FRIENDBOT_FUND` |
| `plugin-soroban` | `SOROBAN_INVOKE_CONTRACT`, `SOROBAN_DEPLOY_CONTRACT`, `SOROBAN_INSTALL_WASM`, `SOROBAN_SIMULATE`, `SOROBAN_GET_CONTRACT_DATA`, `SOROBAN_GET_EVENTS` |
| `plugin-defi` | `BLEND_SUPPLY`, `BLEND_BORROW`, `BLEND_WITHDRAW`, `BLEND_REPAY`, `BLEND_GET_POSITION`, `SOROSWAP_QUOTE`, `SOROSWAP_SWAP`, `REFLECTOR_PRICE`, `REFLECTOR_TWAP` |
| `plugin-data` | `STELLAR_EXPERT_ACCOUNT`, `STELLAR_EXPERT_ASSET`, `RPC_GET_LEDGER`, `HORIZON_TX_HISTORY`, `RPC_GET_EVENTS` |
| `plugin-payments` | `X402_BUYER_FETCH`, `X402_SELLER_VERIFY_PAYMENT`, `MPP_CHARGE`, `MPP_CHANNEL_OPEN`, `MPP_CHANNEL_COMMIT`, `MPP_CHANNEL_CLOSE` |
| `plugin-anchor` | `ANCHOR_GET_QUOTE`, `ANCHOR_CREATE_ONRAMP`, `ANCHOR_CREATE_OFFRAMP`, `ANCHOR_GET_KYC_URL`, `ANCHOR_GET_ONRAMP_STATUS` (Etherfuse, AlfredPay, BlindPay, generic SEPs) |
| `plugin-defindex` | `DEFINDEX_LIST_VAULTS`, `DEFINDEX_DEPOSIT`, `DEFINDEX_WITHDRAW` |
| `plugin-domain` | `DOMAIN_LOOKUP`, `DOMAIN_REGISTER` (Soroban Domains) |

## Two integration modes

### Mode A — MCP server (zero code, recommended for Hermes/OpenClaw/Claude Code)

The kit ships an MCP adapter that exposes every action as an MCP tool. Bootstrap it with:

```bash
npx create-stellar-agent stellar-mcp --template=mcp-server
cd stellar-mcp
# Edit .env: set STELLAR_SECRET_KEY (testnet recommended for first run)
npm install
```

Register with the user's agent. For Hermes:

```json
// ~/.hermes/config/mcp.json
{
  "mcpServers": {
    "stellar-agent": {
      "command": "tsx",
      "args": ["/absolute/path/to/stellar-mcp/index.ts"],
      "env": {
        "STELLAR_SECRET_KEY": "S...",
        "STELLAR_NETWORK": "testnet"
      }
    }
  }
}
```

For Claude Code: `claude mcp add stellar-agent tsx /absolute/path/to/stellar-mcp/index.ts`.

Once registered, the actions surface automatically as MCP tools.

### Mode B — Programmatic SDK (when building a custom agent)

```bash
npm install @stellar-agent-kit/all @stellar/stellar-sdk ai @ai-sdk/anthropic
```

```ts
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/all";
import { StellarAssetPlugin, DefiPlugin, DataPlugin } from "@stellar-agent-kit/all/plugins";
import { autonomousRun } from "@stellar-agent-kit/all/runner";
import { anthropic } from "@ai-sdk/anthropic";
import { Networks } from "@stellar/stellar-sdk";

const wallet = new KeypairWallet(process.env.STELLAR_SECRET_KEY!);
const agent = new StellarAgentKit(wallet, {
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
});
agent.use(StellarAssetPlugin).use(DefiPlugin).use(DataPlugin);

const result = await autonomousRun({
  agent,
  llm: anthropic("claude-haiku-4-5"),
  goal: "Check my XLM balance and show me the USDC orderbook.",
  loop: { maxIterations: 8 },
});
console.log(result.finalText);
```

Or scaffold a full personal agent: `npx create-stellar-agent my-agent --template=personal-agent`.

## Critical gotchas (encode these as rules)

These are the most common ways agents lose money or silently fail on Stellar. Treat them as hard rules.

### 1. Never invent issuer G-addresses

When the user says "USDC" / "EURC" / "AQUA", look up the verified issuer from the kit's registry — DO NOT guess one. Call `ASSET_KNOWN_ISSUERS` (with optional `assetCode` filter) to get the canonical address for the active network.

`ASSET_TRUSTLINE_ADD` and `ASSET_TRUSTLINE_REMOVE` accept `issuer` as **optional**: if omitted, the kit auto-resolves from the registry and returns the resolved address as `resolvedIssuer` in the result. Prefer omitting `issuer` for canonical assets.

Verified mainnet:
- USDC (Circle): `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
- EURC (Circle): `GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2`
- AQUA: `GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA`

Verified testnet:
- USDC (Circle): `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`

⚠️ Testnet has multiple USDC issuers (Circle / Blend / Etherfuse) that DO NOT share liquidity. The registry defaults to Circle's. To use Blend's testnet USDC, pass `issuer: "GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56"` explicitly.

### 2. Trustline before non-native transfer

Stellar silently drops payment ops if the recipient lacks a trustline for a non-XLM asset (the operation fails with `op_no_trust`, but it's easy to miss). Before `ASSET_TRANSFER` of a non-native asset:
1. Use `ASSET_GET_BALANCE` with the recipient's account.
2. If the asset isn't in their balances, tell the user and stop. Do not "try anyway".

### 3. Soroban: simulate before send, poll for finality

`SOROBAN_INVOKE_CONTRACT` already simulates + sends + polls internally. If the LLM is composing low-level calls, follow the order: `SOROBAN_SIMULATE` → assemble → submit → poll. `sendTransaction` returns `PENDING` immediately; the result is only authoritative after polling.

### 4. Mainnet requires explicit opt-in

Templates throw unless `STELLAR_AGENT_I_UNDERSTAND_THE_RISK=1` is set when `STELLAR_NETWORK=mainnet`. Don't suggest the user remove this — it's a deliberate footgun guard.

### 5. Spend caps live in `lib/agent.ts` (templates)

Daily caps are enforced atomically before submission. If a tool returns `{status: "error", error: "SPEND_CAP_EXCEEDED"}`, the call was blocked — don't retry; explain the cap and ask the user to raise it (or wait for the window to roll over).

### 6. Soroswap API key is required (testnet AND mainnet)

`SOROSWAP_QUOTE` and `SOROSWAP_SWAP` will return `403 Forbidden` without a key. Get one at https://docs.soroswap.finance and put `SOROSWAP_API_KEY=...` in `.env`. If the user wants swaps but has no key, suggest that step.

### 7. Etherfuse persistence across runs

If using `plugin-anchor` with Etherfuse, the `customer_id` and `bank_account_id` MUST persist across process restarts (the kit defaults to a `FileKVStore`). If you see "bank account not found" after a restart, the KV store is in-memory — switch to a file-backed store.

## Recommended response shape

When the user asks for a Stellar action, structure the response:

1. **Restate** the goal with concrete numbers / addresses.
2. **Verify** preconditions with read-only actions (`ASSET_GET_BALANCE`, `ASSET_KNOWN_ISSUERS`, `RPC_GET_LEDGER`).
3. **Describe** what you're about to do, especially for state-changing actions.
4. **Execute** the action(s).
5. **Confirm** with the result hash + explorer link.

Explorer links: `https://stellar.expert/explorer/public/tx/{hash}` (mainnet) or `/testnet/tx/{hash}`.

## Testnet quick-start

If the user has no wallet, fund a fresh keypair on testnet:

```ts
// 1. Generate a keypair (off-chain, no fee)
import { Keypair } from "@stellar/stellar-sdk";
const kp = Keypair.random();
console.log(kp.secret(), kp.publicKey());

// 2. Friendbot it (10000 XLM)
await agent.actions.find(a => a.name === "ACCOUNT_FRIENDBOT_FUND")!
  .handler(agent, { account: kp.publicKey() });
```

Or via the action: `ACCOUNT_FRIENDBOT_FUND` with `{ account: "G..." }`.

## Repo + docs

- npm: https://www.npmjs.com/package/@stellar-agent-kit/all
- Source: https://github.com/kaankacar/stellar-agent-kit
- Templates: `personal-agent`, `telegram-bot`, `autonomous-runner`, `mcp-server`
- License: Apache-2.0
