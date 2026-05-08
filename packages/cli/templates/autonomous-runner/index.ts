import "dotenv/config";
/**
 * Autonomous Stellar agent — testnet sandbox by default.
 *
 * Loops on a free OpenRouter model (NVIDIA Nemotron 3 Super) and uses safety
 * layers (allowlist, spend cap, network sandbox, dry-run) to keep the agent
 * from doing anything destructive.
 *
 * Run:
 *   cp .env.example .env  # fill in STELLAR_SECRET_KEY + OPENROUTER_API_KEY
 *   npm start
 */
import { Networks, Keypair } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
import { DataPlugin } from "@stellar-agent-kit/plugin-data";
import { DefiPlugin } from "@stellar-agent-kit/plugin-defi";
import {
  autonomousRun,
  SpendCap,
  TestnetSandbox,
} from "@stellar-agent-kit/runner";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const SECRET = process.env.STELLAR_SECRET_KEY;
if (!SECRET) {
  console.error(
    "Set STELLAR_SECRET_KEY in .env. Generate one:\n  node -e \"console.log(require('@stellar/stellar-sdk').Keypair.random().secret())\"",
  );
  process.exit(1);
}
Keypair.fromSecret(SECRET);

const wallet = new KeypairWallet(SECRET);
const agent = new StellarAgentKit(wallet, {
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  apiKeys: {
    // Soroswap is gated on testnet and mainnet — without this, SOROSWAP_QUOTE
    // returns "Forbidden resource" 403. Get a key at https://docs.soroswap.finance.
    soroswap: process.env.SOROSWAP_API_KEY ?? "",
  },
})
  .use(StellarAssetPlugin)
  .use(DataPlugin)
  .use(DefiPlugin);

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY ?? "" });

const goal =
  process.argv[2] ??
  "Check my XLM balance. If I have less than 100 XLM, ask Friendbot to top it up. Then report back.";

const safety = {
  network: TestnetSandbox, // Hard-refuse mainnet
  actionAllowlist: [
    "ASSET_GET_BALANCE",
    "ACCOUNT_FRIENDBOT_FUND",
    "STELLAR_EXPERT_ACCOUNT",
    "RPC_GET_LATEST_LEDGER",
    "SOROSWAP_QUOTE",
    "REFLECTOR_PRICE",
  ],
  spendCaps: [
    // Daily caps: agent can spend at most 50 USDC and 100 XLM per 24h.
    SpendCap.daily({ asset: "USDC", limit: "50" }),
    SpendCap.daily({ asset: "XLM", limit: "1000000000" }), // 100 XLM in stroops
  ],
  // dryRun: true,  // uncomment to simulate without submitting any tx
};

console.log(`
🤖 autonomous-runner (testnet)
   wallet:    ${agent.wallet.publicKey.slice(0, 8)}…${agent.wallet.publicKey.slice(-4)}
   model:     nvidia/nemotron-3-super-120b-a12b:free  (OpenRouter)
   goal:      "${goal}"

guardrails — edit safety {} in index.ts to change:
   • action allowlist:  ${safety.actionAllowlist.join(", ")}
   • spend caps (24h):  USDC=${safety.spendCaps[0].limit}, XLM=${safety.spendCaps[1].limit} (atomic)
   • network sandbox:   testnet only
   • dry-run mode:      off (set safety.dryRun=true to simulate)

quick guide:
   1. To change the goal: \`npm start "your goal here"\`  (one-shot)
   2. For scheduled / resumable runs: \`npm run once\` (uses run-once.ts)
   3. For mainnet, swap TestnetSandbox → MainnetSandbox + set
      STELLAR_NETWORK=mainnet, STELLAR_AGENT_I_UNDERSTAND_THE_RISK=1, and
      review safety caps carefully.
`);

const result = await autonomousRun({
  agent,
  llm: openrouter("nvidia/nemotron-3-super-120b-a12b:free"),
  goal,
  loop: { maxIterations: 8, intervalMs: 0 },
  safety,
  onEvent: (event) => {
    if (event.type === "tool.call") console.log(`→ ${event.actionName}`, event.input);
    if (event.type === "tool.blocked") console.log(`✕ blocked: ${event.actionName} — ${event.reason}`);
    if (event.type === "tool.result") console.log(`← ${event.actionName} done`);
  },
});

console.log(
  `\nDone. iterations=${result.iterations} succeeded=${result.succeeded} blocked=${result.blocked}`,
);
console.log(`Final: ${result.finalText}`);
