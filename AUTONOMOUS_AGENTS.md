# Building autonomous Stellar agents

> Audience: an LLM (Claude Code, OpenAI Codex, Cursor, …) reading this to scaffold an autonomous Stellar agent — and the human reviewing what it builds.

This document is the canonical reference for autonomous agents on top of `@stellar-agent-kit`. If you're an LLM, you can rely on the API shapes and code snippets here being literal. If you're a human, the same applies — none of this is aspirational.

## TL;DR

```bash
npx create-stellar-agent my-bot --template=autonomous-runner
cd my-bot
cp .env.example .env
# fill STELLAR_SECRET_KEY (testnet keypair, Friendbot-funded)
# fill OPENROUTER_API_KEY (free tier at openrouter.ai/keys)
npm install && npm start
```

Out of the box you get: an agent on testnet, running NVIDIA Nemotron 3 Super (free), with a network sandbox, action allowlist, daily spend caps, and conversation state persistence — wired via `@stellar-agent-kit/runner`.

## What you should care about

Stellar's structural advantage for autonomous agents is **safety enforcement that lives below the LLM, not in the prompt**. Most agent frameworks tell the LLM "don't spend more than $50" and hope. Stellar lets us encode that as:

1. A **smart-account policy contract** that rejects violating txs at submission (protocol-enforced — the LLM literally cannot bypass it).
2. A **session-key wallet** funded only with what you'd lose if everything fails.
3. The kit's **`runner` package** with allowlist + spend caps + network sandbox + human-in-loop, all enforced in TypeScript before any RPC call.

Layer them together and the agent's blast radius is bounded by code. If you only do (3), you're already well ahead of the average agent setup.

## The runner API

`@stellar-agent-kit/runner` exports two entry points:

- `autonomousRun(opts)` — long-running interactive loop. Best for terminal sessions and long-lived processes.
- `runOnce(opts)` — single iteration. Best for cron-driven scheduled agents that resume conversation state across firings.

### `AutonomousRunOptions`

```ts
interface AutonomousRunOptions {
  agent: StellarAgentKit;            // your wired-up StellarAgentKit
  llm: LanguageModelV1;              // any Vercel AI SDK v4 model
  goal: string;                      // the user's instruction
  loop?: { maxIterations?: number; intervalMs?: number };  // default: 10 iterations, no sleep
  safety?: SafetyConfig;             // see below
  state?: KVStore;                   // override the agent's KV store
  systemPrompt?: string;             // override the default system prompt
  onEvent?: (event: RunnerEvent) => void;  // observability
}
```

### `SafetyConfig`

```ts
interface SafetyConfig {
  actionAllowlist?: string[];        // only these action names may run
  actionDenylist?: string[];         // these never run (overrides allowlist)
  spendCaps?: SpendCap[];            // per-asset cumulative caps over a window
  network?: { allow: StellarNetwork[] };  // hard-refuse other networks at construction
  requireHumanFor?: {
    actionNames?: string[];          // these always need confirmation
    aboveAtomicAmount?: { asset: string; amount: string }[];  // by threshold
  };
  confirm?: (request: ConfirmRequest) => Promise<boolean>;  // injected; default = readline
  dryRun?: boolean;                  // simulate-only; state-changing actions never submit
}
```

### `SpendCap` constructors

```ts
SpendCap.daily({ asset: "USDC", limit: "50000000" })           // 50 USDC (7-decimal atomic)
SpendCap.hourly({ asset: "XLM", limit: "100000000" })          // 10 XLM in stroops/hour
SpendCap.perWindow({ asset: "BTC", limit: "100", windowMs: 3600_000 })
```

`asset` matches the action's input field (`assetCode`, `asset`, `assetIn`, or `fromCurrency`). `limit` is in atomic units. `windowMs` is the rolling-window duration.

### `RunnerEvent` (for observability)

```ts
type RunnerEvent =
  | { type: "iteration.start"; iteration: number }
  | { type: "tool.call"; actionName: string; input: Record<string, unknown> }
  | { type: "tool.blocked"; actionName: string; reason: string; details?: ... }
  | { type: "tool.result"; actionName: string; result: Record<string, unknown> }
  | { type: "human.requested"; request: ConfirmRequest }
  | { type: "human.rejected"; request: ConfirmRequest }
  | { type: "iteration.end"; iteration: number; finishReason: string }
  | { type: "run.done"; iterations: number };
```

### Convenience exports

```ts
import {
  TestnetSandbox,        // = { allow: ["testnet"] }
  MainnetSandbox,        // = { allow: ["mainnet"] }
  alwaysApprove,         // confirm fn that approves everything (for tests)
  alwaysReject,          // confirm fn that rejects everything (for tests)
  defaultConfirm,        // readline-based interactive confirm
  isReadOnlyAction,      // utility: true if action is safe for dryRun
} from "@stellar-agent-kit/runner";
```

## Minimal autonomous agent

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
  goal: "Check my XLM balance. If under 100, top up via Friendbot.",
  loop: { maxIterations: 8 },
  safety: {
    network: TestnetSandbox,
    actionAllowlist: ["ASSET_GET_BALANCE", "ACCOUNT_FRIENDBOT_FUND"],
    spendCaps: [SpendCap.daily({ asset: "XLM", limit: "1000000000" })],
  },
});
```

## Cron / scheduled agents

`runOnce` is for cron firings. It executes a single one-shot evaluation and persists conversation state in the agent's `KVStore`. Pair with a `FileKVStore` for cross-process state.

```ts
import { runOnce } from "@stellar-agent-kit/runner";

const result = await runOnce({
  agent,
  llm,
  goal: "Continue maintaining my XLM reserve at >= 100 XLM.",
  state: fileKvStore,           // persistent across cron firings
  resumeFromState: true,        // load prior conversation messages
  maxSteps: 30,                 // default — enough for tool→read-result→summarize chains
  safety: { /* … */ },
});
```

The `maxSteps` default is `30` — enough for the LLM to call a tool, observe its result, and produce a summary inside one firing (the previous default of `1` caused heartbeat goals to terminate without text output). Bump higher for deeply chained recipes; set to `1` only for no-tool single-pass evaluations.

Crontab line:

```
# Every 6 hours, append output to ./agent.log
0 */6 * * * cd /path/to/my-bot && npm run once >> ./agent.log 2>&1
```

The `autonomous-runner` template ships with a working `FileKVStore` impl in `run-once.ts` — copy-paste from there.

## Layered defence — full picture

| Layer | Where | Strength |
| --- | --- | --- |
| Smart-account policy contract (OZ Stellar smart-accounts) | On-chain | Protocol-enforced. Contract rejects violating txs at SAC level. The LLM cannot bypass. |
| Session-key wallet (sub-wallet with capped budget) | On-chain | Bounds maximum loss to whatever you funded the session wallet with. |
| Kit allowlist + spend caps (`@stellar-agent-kit/runner`) | Local code | Per-call deterministic checks. Each violating tool call returns a structured error to the LLM. |
| Network sandbox (`TestnetSandbox` / `MainnetSandbox`) | Local code | Hard-refuses to start the runner if the wallet's network isn't allowed. Stops mainnet accidents at construction. |
| Human-in-loop (`requireHumanFor`) | Process | Catches high-value or high-risk actions before submission. |
| System prompt | LLM | Advisory only. The LLM may ignore it. |

For production agents that move real money, you want layers 1–4 minimum. For testnet experiments, layers 3–4 are usually enough.

For deep code patterns on each layer, see the `stellar-autonomous-agent` Agent Skill at `./skills/stellar-autonomous-agent`.

## Writing recipes (multi-step composite actions)

LLMs are bad at multi-step coordination. If your agent needs to do `quote → swap → supply` reliably, write a recipe — a single TypeScript function that calls multiple actions in sequence and exposes itself as one tool:

```ts
import type { Action } from "@stellar-agent-kit/core";
import { z } from "zod";

export const swapAndSupply: Action = {
  name: "RECIPE_SWAP_AND_SUPPLY",
  similes: ["swap and lend", "convert and earn yield"],
  description: "Swap an input asset to USDC via Soroswap, then supply to Blend in one shot.",
  examples: [/* ... */],
  schema: z.object({
    fromAsset: z.string(),
    fromAmount: z.string(),
    blendPoolId: z.string(),
  }),
  handler: async (agent, input) => {
    const quote = agent.actions.find((a) => a.name === "SOROSWAP_QUOTE")!;
    const swap = agent.actions.find((a) => a.name === "SOROSWAP_SWAP")!;
    const supply = agent.actions.find((a) => a.name === "BLEND_SUPPLY")!;
    // ... orchestrate
  },
};
```

Register as part of your own custom Plugin, alongside the kit's plugins.

## Testing the safety layers

Each safety control should have a test. The runner package's own tests demonstrate the patterns — read `packages/runner/src/__tests__/runner.test.ts`. Headline patterns:

- **Allowlist**: call `checkSafety` directly with a denied action, assert `decision.blockCode === "BLOCKED_BY_ALLOWLIST"`.
- **Spend cap**: feed two consecutive scripted swap calls under a daily cap that tightens to refuse the second; assert `result.blocked === 1`.
- **Network sandbox**: construct on `Networks.PUBLIC` with `TestnetSandbox`; assert `validateNetworkSandbox` throws `NETWORK_SANDBOX_VIOLATION`.
- **Human-in-loop**: pass `confirm: alwaysReject`; trigger the action; assert `human.rejected` event in `result.events`.
- **Dry run**: spy on the underlying handler; trigger a state-changing action; assert handler never called and result has `dryRun: true`.

## Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| `InMemoryKVStore` for cron jobs | Conversation state lost between firings; spend caps reset | Use `FileKVStore` (see `autonomous-runner` template) |
| No network sandbox | Agent on mainnet "by accident" because env was misconfigured | Always set `safety.network` |
| `requireHumanFor` without setting `confirm` | Agent hangs on a readline prompt in a server process | Override `confirm` to a Slack / web prompt for non-terminal contexts |
| Trusting the system prompt | Jailbroken agent does the thing anyway | Move enforcement to allowlist + spend caps |
| Missing `idempotencyKey` on retries | LLM retries a transfer that timed out → double spend | Pass an `idempotencyKey` (a stable string per logical operation); kit caches result for 24h |
| Tool descriptions too verbose | Free-tier 8B-class LLMs lose the goal | Use a smaller allowlist; the kit auto-truncates descriptions to 1023 chars |

## Companion skill

Once this guide is internalized, the matching Agent Skill at [`./skills/stellar-autonomous-agent/SKILL.md`](./skills/stellar-autonomous-agent/SKILL.md) is what AI assistants invoke to scaffold autonomous agents. The skill cites this file; this file is the authoritative API reference.
