# Safety layers — full code patterns

## 1. Smart-account policy contracts (the protocol-grade layer)

OpenZeppelin Stellar Smart Accounts support **context rules** — on-chain policies enforced by the smart-account contract itself. The contract rejects transactions that violate them. The signer / LLM literally cannot bypass them, because the rule is enforced at the SAC level, not in the kit.

Examples of policies:

- "Only spend up to N USDC per day"
- "Only call these contract IDs"
- "Only transfer to addresses on this allowlist"
- "Time-window only — no calls outside business hours"

For v0.3 the kit exposes smart accounts via `@stellar-agent-kit/plugin-smart-wallet` (`SmartAccountWallet`), and reads basic info via `SMART_WALLET_INFO`. Authoring custom policies is done in Rust against the OZ contracts; see `https://github.com/OpenZeppelin/stellar-contracts/tree/main/examples` for `multisig-smart-account` patterns that can be extended with spend-cap policies.

The kit's `runner` does NOT yet automatically verify on-chain policies match config — there's a `TODO_SMART_ACCOUNT_POLICY_VERIFICATION` marker for this. For v0.3, achieve defense-in-depth manually:

```ts
// Pseudo-code: assert the on-chain wallet has the expected policy
const info = await executeAction(
  agent.actions.find((a) => a.name === "SMART_WALLET_INFO")!,
  agent,
  { contractId: agent.wallet.publicKey },
);
if (!info.threshold || info.threshold !== 1) {
  throw new Error("Smart account threshold not as expected");
}
```

## 2. Session-key wallet (bound the blast radius)

Don't give the agent your primary wallet's secret. Generate a fresh keypair, fund it with the maximum you're willing to lose to a bug, point the agent at it. If everything fails, you lose only the session wallet's balance.

```ts
import { Keypair } from "@stellar/stellar-sdk";
const sessionKp = Keypair.random();
console.log("Fund this address:", sessionKp.publicKey());
// Funded externally with 50 XLM. Even if the agent goes haywire, max loss is 50 XLM.
const wallet = new KeypairWallet(sessionKp.secret());
```

For passkey-based smart accounts, generate a session signer with restricted limits via OpenZeppelin's smart-account-kit and add it to the smart account.

## 3. Kit allowlist + spend caps (the runner's primary safety surface)

```ts
safety: {
  // Only these actions can run. The LLM never even sees the others.
  actionAllowlist: ["ASSET_GET_BALANCE", "SOROSWAP_QUOTE", "ASSET_TRANSFER"],

  // ... and additionally these specific names are forbidden, redundant defence
  actionDenylist: ["BLEND_BORROW"],

  // Per-asset cumulative caps over a rolling time window.
  // Amounts are atomic units (stroops for XLM, i128 strings for SAC tokens).
  spendCaps: [
    SpendCap.daily({ asset: "USDC", limit: "50000000" }),       // 50 USDC (7 decimals)
    SpendCap.hourly({ asset: "XLM", limit: "100000000" }),      // 10 XLM in stroops per hour
    SpendCap.perWindow({ asset: "BTC", limit: "100", windowMs: 3600_000 }),
  ],
}
```

Caps survive across `runOnce` invocations via the agent's `KVStore`. So a daily cap is genuinely 24h, even across cron firings.

## 4. Network sandbox

```ts
import { TestnetSandbox, MainnetSandbox } from "@stellar-agent-kit/runner";

safety: { network: TestnetSandbox }   // refuses if agent's network !== Networks.TESTNET
safety: { network: { allow: ["testnet", "futurenet"] } }
```

Validation happens at construction. The runner throws `NETWORK_SANDBOX_VIOLATION` if the agent is on a disallowed network — before any tool call.

## 5. Human-in-loop

```ts
import { defaultConfirm, alwaysApprove, alwaysReject } from "@stellar-agent-kit/runner";

safety: {
  requireHumanFor: {
    actionNames: ["ASSET_TRANSFER", "BLEND_SUPPLY"],
    aboveAtomicAmount: [
      { asset: "USDC", amount: "10000000" },  // require human if > 10 USDC
    ],
  },
  // Default: readline-based y/N prompt. Replace with custom for non-terminal contexts.
  confirm: async (req) => {
    // Custom: ping a Slack channel, wait for reaction
    // return await slackApprove(req);
    return defaultConfirm(req);
  },
}
```

For tests, use `alwaysApprove` / `alwaysReject` to make behaviour deterministic.

## 6. Dry run mode

```ts
safety: { dryRun: true }
```

State-changing actions (anything that submits a transaction) are intercepted. The handler is never called; the result is `{ dryRun: true, wouldSubmit: { actionName, input } }`. Read-only actions (balances, quotes, lookups) still run normally so the LLM can reason about real state.

The `dryRun.ts` source has a hardcoded list of read-only action prefixes. Run with `dryRun: true` first whenever you change the goal or allowlist; then turn it off.

## Putting it together — production posture

```ts
const result = await autonomousRun({
  agent,
  llm,
  goal: "Maintain my treasury at 100k USDC. If above, swap excess to XLM.",
  loop: { maxIterations: 20, intervalMs: 10_000 },
  safety: {
    network: MainnetSandbox,
    actionAllowlist: ["ASSET_GET_BALANCE", "SOROSWAP_QUOTE", "SOROSWAP_SWAP"],
    spendCaps: [
      SpendCap.daily({ asset: "USDC", limit: "100000000000" }),  // 100k USDC daily cap
      SpendCap.hourly({ asset: "USDC", limit: "10000000000" }),  // 10k/hour
    ],
    requireHumanFor: {
      aboveAtomicAmount: [{ asset: "USDC", amount: "5000000000" }], // >5k USDC needs confirm
    },
    confirm: slackConfirm,                                          // your Slack adapter
  },
  state: persistentKVStore,
  onEvent: (e) => sendToObservability(e),
});
```

That's defence in depth. To violate it, an attacker would need to: bypass the smart-account policy contract (on-chain), drain past your funded session-wallet balance, evade the allowlist, exceed the spend cap, get past the Slack human approver, AND not trigger your observability alerts. Each layer is multiplicative.
