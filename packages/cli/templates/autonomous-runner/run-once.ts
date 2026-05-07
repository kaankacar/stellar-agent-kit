/**
 * Cron-style single-shot runner. Reads conversation state from disk between
 * runs, so a cron job that fires this every 6 hours stays coherent over time.
 *
 * Example crontab:
 *   0 *\/6 * * * cd /path/to/{{projectName}} && npm run once >> ./agent.log 2>&1
 */
import { promises as fs } from "node:fs";
import { Networks, Keypair } from "@stellar/stellar-sdk";
import {
  StellarAgentKit,
  KeypairWallet,
  type KVStore,
} from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
import { DataPlugin } from "@stellar-agent-kit/plugin-data";
import { DefiPlugin } from "@stellar-agent-kit/plugin-defi";
import { runOnce, SpendCap, TestnetSandbox } from "@stellar-agent-kit/runner";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const STATE_FILE = "./agent-state.json";

class FileKVStore implements KVStore {
  private cache = new Map<string, unknown>();
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(STATE_FILE, "utf-8");
      const obj = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) this.cache.set(k, v);
    } catch {
      /* fresh state */
    }
  }
  async persist(): Promise<void> {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.cache) obj[k] = v;
    await fs.writeFile(STATE_FILE, JSON.stringify(obj, null, 2), "utf-8");
  }
  async get<T>(key: string): Promise<T | null> {
    return (this.cache.get(key) as T) ?? null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.cache.set(key, value);
    await this.persist();
  }
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    await this.persist();
  }
}

const SECRET = process.env.STELLAR_SECRET_KEY;
if (!SECRET) throw new Error("Set STELLAR_SECRET_KEY in .env");
Keypair.fromSecret(SECRET);

const kv = new FileKVStore();
await kv.load();

const wallet = new KeypairWallet(SECRET);
const agent = new StellarAgentKit(wallet, {
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  kvStore: kv,
})
  .use(StellarAssetPlugin)
  .use(DataPlugin)
  .use(DefiPlugin);

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY ?? "" });

const result = await runOnce({
  agent,
  llm: openrouter("nvidia/nemotron-3-super-120b-a12b:free"),
  goal: "Continue maintaining my XLM reserve at >= 100 XLM. If it drops, top up via Friendbot.",
  state: kv,
  resumeFromState: true,
  safety: {
    network: TestnetSandbox,
    actionAllowlist: ["ASSET_GET_BALANCE", "ACCOUNT_FRIENDBOT_FUND"],
    spendCaps: [SpendCap.daily({ asset: "XLM", limit: "1000000000" })],
  },
});

console.log(`runOnce: finishReason=${result.finishReason}`);
console.log(result.text);
