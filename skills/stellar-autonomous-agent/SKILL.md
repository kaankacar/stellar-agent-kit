---
name: stellar-autonomous-agent
description: Build a SAFE autonomous Stellar agent with @stellar-agent-kit/runner. Covers layered defence (network sandbox, action allowlist, spend caps, human-in-loop, smart-account policies), free OpenRouter LLM setup with NVIDIA Nemotron, cron-style runOnce for resumable scheduled agents, and how to verify each safety layer with tests. Use when building autonomous bots that move money on Stellar.
---

# Building autonomous Stellar agents — safely

## Why this skill exists

Autonomous agents that move real money are easy to build and easy to ruin. The Stellar Agent Kit's `runner` package gives you a layered safety model so the agent's blast radius is bounded by code, not by trust in the LLM.

The whole point: **safety enforcement lives below the LLM, not in the prompt.** A jailbroken or confused model can't violate spend caps or escape a network sandbox because those checks run in your code before any RPC call.

## The layered defence model (read this first)

| Layer | Lives where | Strength | Notes |
| --- | --- | --- | --- |
| **Smart-account policy contract** | On-chain (OpenZeppelin Stellar Smart Accounts) | **Protocol-enforced** — the contract rejects violating txs at submission. Cannot be bypassed by any signer. | Use this for production. Even if every other layer fails, the chain says no. |
| **Session-key wallet** | On-chain | Bounds total loss to whatever you funded the session wallet with. | Generate a fresh wallet per agent run, fund with a small budget. |
| **Kit allowlist + spend caps** | Local code (`@stellar-agent-kit/runner`) | Per-call deterministic checks. The LLM can call disallowed actions but they're rejected before any RPC call. | This skill's primary focus. |
| **Network sandbox** | Local code (config validator) | Hard refuses to start the runner if the wallet's network isn't allowlisted. Stops mainnet accidents at construction. | Always set this. `TestnetSandbox` in dev, `MainnetSandbox` in prod. |
| **Human-in-loop** | Process | Catches high-value or high-risk actions before they fire. | Use `requireHumanFor` for actions above a $-threshold. |
| **System prompt** | LLM | Advisory only. The LLM may ignore it, jailbreak around it, or be wrong. | Treat as documentation, not enforcement. |

For full reasoning on each layer, read [`safety-layers.md`](./safety-layers.md).

## Scaffold (60 seconds)

```bash
npx create-stellar-agent my-bot --template=autonomous-runner
cd my-bot
cp .env.example .env
# 1. STELLAR_SECRET_KEY — generate a testnet keypair, Friendbot it
# 2. OPENROUTER_API_KEY — get free at https://openrouter.ai/keys (uses Nemotron 3 free)
npm install && npm start
```

The generated `index.ts` is wired with `TestnetSandbox`, an action allowlist (read-only + Friendbot top-up), and daily spend caps for USDC and XLM. It runs the goal `"Top up XLM if it falls below 100"` on a free OpenRouter model.

The generated `run-once.ts` is the cron-driven variant: a single iteration that resumes conversation state from `agent-state.json` between invocations.

## Minimal manual setup

```ts
import { Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
import { autonomousRun, SpendCap, TestnetSandbox } from "@stellar-agent-kit/runner";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const wallet = new KeypairWallet(process.env.STELLAR_SECRET_KEY!);
const agent = new StellarAgentKit(wallet, {
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
}).use(StellarAssetPlugin);

const llm = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! })(
  "nvidia/nemotron-3-super-120b-a12b:free",
);

await autonomousRun({
  agent,
  llm,
  goal: "Check my XLM balance. If under 100, ask Friendbot to top up.",
  loop: { maxIterations: 8 },
  safety: {
    network: TestnetSandbox,           // hard-refuse mainnet
    actionAllowlist: ["ASSET_GET_BALANCE", "ACCOUNT_FRIENDBOT_FUND"],
    spendCaps: [SpendCap.daily({ asset: "XLM", limit: "1000000000" })],  // 100 XLM in stroops
    // requireHumanFor: { actionNames: ["ASSET_TRANSFER"] },
    // dryRun: true,  // simulate-only mode for first runs
  },
});
```

## Cron / scheduled mode

Use `runOnce` instead of `autonomousRun`. It executes a single iteration and persists conversation state in the agent's `KVStore` so the next invocation resumes coherently. Pair with a `FileKVStore` so state survives between cron firings.

The `autonomous-runner` template's `run-once.ts` shows the pattern. Crontab line:

```
0 */6 * * * cd /path/to/my-bot && npm run once >> ./agent.log 2>&1
```

## Verifying each safety layer

The runner package's tests already prove each layer blocks correctly with a stub LLM. To verify in your own setup:

| Layer | How to test |
| --- | --- |
| Allowlist | Construct with allowlist `["ASSET_GET_BALANCE"]`. Try to instruct agent to transfer. Confirm `tool.blocked` event with reason "BLOCKED_BY_ALLOWLIST". |
| Spend cap | Set `SpendCap.daily({ asset: "XLM", limit: "1" })`. Issue a swap of "2". Confirm event "BLOCKED_BY_SPEND_CAP". |
| Network sandbox | Construct an agent on `Networks.PUBLIC` and pass `network: TestnetSandbox`. Confirm `validateNetworkSandbox` throws at construction. |
| Human-in-loop | Set `requireHumanFor: { actionNames: ["ASSET_TRANSFER"] }` and `confirm: alwaysReject`. Trigger a transfer. Confirm `human.rejected` event. |
| Dry run | Set `safety: { dryRun: true }`. Trigger any state-changing action. Confirm result has `dryRun: true` and the underlying handler was never called. |

See [`safety-layers.md`](./safety-layers.md) for code snippets.

## Free LLM setup

NVIDIA Nemotron 3 Super on OpenRouter is the recommended free option — 120B parameters, 262K context, $0/token, supports tool calling. Get a key at `https://openrouter.ai/keys`. Other free options:

- **Groq Llama 3.1 8B** — fastest, 14,400 req/day. Good for tool-calling demos.
- **Mistral Codestral** — 2,000 req/day, code-optimized.

See [`openrouter-setup.md`](./openrouter-setup.md) for full provider matrix and config snippets.

## Pairs with

- [`stellar-remittance-mx`](../stellar-remittance-mx/SKILL.md) — wrap a remittance flow as an autonomous treasury bot
- [`stellar-x402-monetize`](../stellar-x402-monetize/SKILL.md) — agent-to-agent payments inside the loop
