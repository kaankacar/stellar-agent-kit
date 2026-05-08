/**
 * Shared agent setup. Both `index.ts` (interactive REPL) and `heartbeat.ts`
 * (cron / standing-goal evaluator) import from here so they share the same
 * wallet, plugins, soul, memory, and safety config.
 */
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { Networks, Keypair } from "@stellar/stellar-sdk";
import {
  StellarAgentKit,
  KeypairWallet,
  type KVStore,
  type Plugin,
} from "@stellar-agent-kit/all";
import {
  StellarAssetPlugin,
  SorobanPlugin,
  DefiPlugin,
  DataPlugin,
  AnchorPlugin,
  DomainPlugin,
} from "@stellar-agent-kit/all/plugins";
import {
  PersonalPlugin,
  attachPersonal,
  SoulFile,
  MemoryStore,
  StandingGoals,
  DEFAULT_SOUL_TEMPLATE,
} from "@stellar-agent-kit/personal";
import { WebPlugin } from "@stellar-agent-kit/plugin-web";
import { SpendCap, TestnetSandbox, MainnetSandbox } from "@stellar-agent-kit/all/runner";
import type { LanguageModelV1 } from "ai";

const STATE_DIR = "./state";
const SOUL_PATH = join(STATE_DIR, "soul.md");
const MEMORY_PATH = join(STATE_DIR, "memory.json");
const GOALS_PATH = join(STATE_DIR, "goals.json");
const KV_PATH = join(STATE_DIR, "kv.json");

class FileKVStore implements KVStore {
  private cache = new Map<string, unknown>();
  private loaded = false;
  constructor(private readonly path: string) {}
  private async load() {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.path, "utf-8");
      const obj = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) this.cache.set(k, v);
    } catch {
      /* fresh */
    }
    this.loaded = true;
  }
  private async persist() {
    await fs.mkdir(STATE_DIR, { recursive: true });
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.cache) obj[k] = v;
    await fs.writeFile(this.path, JSON.stringify(obj, null, 2), "utf-8");
  }
  async get<T>(key: string): Promise<T | null> {
    await this.load();
    return (this.cache.get(key) as T) ?? null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.load();
    this.cache.set(key, value);
    await this.persist();
  }
  async delete(key: string): Promise<void> {
    await this.load();
    this.cache.delete(key);
    await this.persist();
  }
}

export interface AgentBundle {
  agent: StellarAgentKit;
  llm: LanguageModelV1;
  network: "testnet" | "mainnet";
  soul: SoulFile;
  memory: MemoryStore;
  goals: StandingGoals;
  safety: {
    network: { allow: ("testnet" | "mainnet")[] };
    spendCaps: ReturnType<typeof SpendCap.daily>[];
    requireHumanFor?: { aboveAtomicAmount?: { asset: string; amount: string }[] };
  };
}

export async function buildAgent(): Promise<AgentBundle> {
  const network = (process.env.STELLAR_NETWORK ?? "testnet") as "testnet" | "mainnet";
  if (network === "mainnet" && process.env.STELLAR_AGENT_I_UNDERSTAND_THE_RISK !== "1") {
    throw new Error(
      "Mainnet mode requires STELLAR_AGENT_I_UNDERSTAND_THE_RISK=1 env var. Set it explicitly to confirm you understand this agent will move REAL MONEY.",
    );
  }

  const secret = process.env.STELLAR_SECRET_KEY;
  if (!secret) throw new Error("STELLAR_SECRET_KEY is required.");
  Keypair.fromSecret(secret);

  const wallet = new KeypairWallet(secret);
  const isMainnet = network === "mainnet";

  const kv = new FileKVStore(KV_PATH);

  const agent = new StellarAgentKit(wallet, {
    rpcUrl: isMainnet
      ? (process.env.STELLAR_RPC_URL ?? "https://mainnet.sorobanrpc.com")
      : "https://soroban-testnet.stellar.org",
    horizonUrl: isMainnet ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org",
    networkPassphrase: isMainnet ? Networks.PUBLIC : Networks.TESTNET,
    kvStore: kv,
    apiKeys: {
      // Soroswap API key — REQUIRED for SOROSWAP_QUOTE / SOROSWAP_SWAP. Both
      // testnet and mainnet are gated. Get one at https://docs.soroswap.finance.
      soroswap: process.env.SOROSWAP_API_KEY ?? "",
      brave: process.env.BRAVE_API_KEY ?? "",
      coinGeckoPro: process.env.COINGECKO_API_KEY ?? "",
      etherfuse: process.env.ETHERFUSE_API_KEY ?? "",
      etherfuseNetwork: network,
      anchorNetwork: network,
    },
  });

  for (const p of [
    StellarAssetPlugin,
    SorobanPlugin,
    DefiPlugin,
    DataPlugin,
    AnchorPlugin,
    DomainPlugin,
    WebPlugin,
    PersonalPlugin,
  ] as Plugin[]) {
    agent.use(p);
  }

  // Attach the personal context (soul / memory / standing goals).
  const soul = new SoulFile(SOUL_PATH);
  const memory = new MemoryStore(MEMORY_PATH);
  const goals = new StandingGoals(GOALS_PATH);
  attachPersonal(agent, { soul, memory, goals });

  // Initialize soul.md on first run with the default template.
  if ((await soul.read()) === "") {
    await soul.write(DEFAULT_SOUL_TEMPLATE);
  }

  // Pick LLM based on which key is set.
  const llm = await pickLlm();

  // Safety config — different posture per network.
  const safety: AgentBundle["safety"] = isMainnet
    ? {
        network: MainnetSandbox,
        spendCaps: [
          // Production caps. ATOMIC units.
          SpendCap.daily({ asset: "USDC", limit: "10000000" }), // 10 USDC/day default
          SpendCap.daily({ asset: "XLM", limit: "100000000" }), // 10 XLM/day in stroops
        ],
        requireHumanFor: {
          aboveAtomicAmount: [
            { asset: "USDC", amount: "1000000" }, // require human if > 0.1 USDC
            { asset: "XLM", amount: "10000000" }, // require human if > 1 XLM
          ],
        },
      }
    : {
        network: TestnetSandbox,
        spendCaps: [
          SpendCap.daily({ asset: "USDC", limit: "100000000" }), // 100 USDC/day testnet
          SpendCap.daily({ asset: "XLM", limit: "10000000000" }), // 1000 XLM testnet
        ],
      };

  return { agent, llm, network, soul, memory, goals, safety };
}

async function pickLlm(): Promise<LanguageModelV1> {
  if (process.env.OPENROUTER_API_KEY) {
    const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
    return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })(
      process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free",
    );
  }
  if (process.env.OPENAI_API_KEY) {
    const { openai } = await import("@ai-sdk/openai");
    return openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini");
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const { anthropic } = await import("@ai-sdk/anthropic");
    return anthropic(process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5");
  }
  if (process.env.OLLAMA_BASE_URL) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    return createOpenAI({
      baseURL: process.env.OLLAMA_BASE_URL,
      apiKey: "ollama",
    })(process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b");
  }
  throw new Error(
    "No LLM provider configured. Set one of: OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_BASE_URL in .env.",
  );
}

export async function buildSystemPrompt(bundle: AgentBundle): Promise<string> {
  const soulContent = await bundle.soul.read();
  const recentMemory = await bundle.memory.recall({ limit: 8 });
  const standingGoals = await bundle.goals.list({ activeOnly: true });
  return [
    `You are a personal Stellar agent. The user's wallet is ${bundle.agent.wallet.publicKey} on ${bundle.network}.`,
    "",
    "Always describe your intended action before doing it. For state-changing actions, say what you'll do and why.",
    "",
    "Use tools deliberately. Prefer read-only tools to verify state before any tx-submitting tool.",
    "If a tool is blocked by safety, respect the block and try a different approach (lower amount, different action, or ask the user).",
    "",
    "When you learn something durable about the user (preferences, patterns, recurring needs), call AGENT_REMEMBER. When you need context, call AGENT_RECALL.",
    "Soul.md (the user's personality file) is below — reference it for stable preferences. To suggest edits, use AGENT_PROPOSE_SOUL_EDIT.",
    "",
    "─── soul.md ───",
    soulContent || "(empty — first run)",
    "",
    "─── recent memory (most recent first) ───",
    recentMemory.length
      ? recentMemory.map((e) => `- [${e.kind}] ${e.content}`).join("\n")
      : "(empty)",
    "",
    "─── standing goals ───",
    standingGoals.length
      ? standingGoals.map((g) => `- ${g.id}: ${g.goal} (every ${Math.round(g.intervalMs / 60_000)}min)`).join("\n")
      : "(none)",
  ].join("\n");
}
