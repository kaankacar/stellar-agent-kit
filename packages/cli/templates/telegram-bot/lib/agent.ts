// Same agent setup as the personal-agent template — copied verbatim so the
// templates can evolve independently. If you maintain both side by side, keep
// this file in sync.
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
  describeKnownAssets,
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
    throw new Error("Mainnet mode requires STELLAR_AGENT_I_UNDERSTAND_THE_RISK=1.");
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

  const soul = new SoulFile(SOUL_PATH);
  const memory = new MemoryStore(MEMORY_PATH);
  const goals = new StandingGoals(GOALS_PATH);
  attachPersonal(agent, { soul, memory, goals });
  if ((await soul.read()) === "") await soul.write(DEFAULT_SOUL_TEMPLATE);

  const llm = await pickLlm();

  const safety: AgentBundle["safety"] = isMainnet
    ? {
        network: MainnetSandbox,
        spendCaps: [
          SpendCap.daily({ asset: "USDC", limit: "10000000" }),
          SpendCap.daily({ asset: "XLM", limit: "100000000" }),
        ],
        requireHumanFor: {
          aboveAtomicAmount: [
            { asset: "USDC", amount: "1000000" },
            { asset: "XLM", amount: "10000000" },
          ],
        },
      }
    : {
        network: TestnetSandbox,
        spendCaps: [
          SpendCap.daily({ asset: "USDC", limit: "100000000" }),
          SpendCap.daily({ asset: "XLM", limit: "10000000000" }),
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
  throw new Error("No LLM provider configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.");
}

/**
 * Startup banner — printed once when the bot boots.
 */
export function printBanner(bundle: AgentBundle, allowedUserId: number): void {
  const llmInfo = describeLlm();
  const totalActions = bundle.agent.actions.length;
  const caps = bundle.safety.spendCaps
    .map((c) => `${c.asset} ${formatAmount(c.limit)} per ${formatWindow(c.windowMs)}`)
    .join(", ") || "none";
  const humanRules = bundle.safety.requireHumanFor?.aboveAtomicAmount
    ?.map((t) => `${t.asset} > ${formatAmount(t.amount)}`)
    .join(", ");
  const cap = (k: string) => (process.env[k] ? "✓" : "✗");
  const isMainnet = bundle.network === "mainnet";

  console.log(`
🤖 stellar-agent telegram-bot (${bundle.network})
   wallet:    ${bundle.agent.wallet.publicKey.slice(0, 8)}…${bundle.agent.wallet.publicKey.slice(-4)}
   network:   ${bundle.network}${
     !isMainnet
       ? "  (mainnet: set STELLAR_NETWORK=mainnet + STELLAR_AGENT_I_UNDERSTAND_THE_RISK=1 in .env)"
       : ""
   }
   model:     ${llmInfo}
   allowlisted user id: ${allowedUserId}  (only this Telegram user can interact)

guardrails — edit lib/agent.ts to change:
   • action allowlist:   ${totalActions} actions registered
   • spend caps (24h):   ${caps}
   • human-in-loop:      ${humanRules ? `confirm above: ${humanRules}` : "disabled"}
   • capabilities:       Soroswap=${cap("SOROSWAP_API_KEY")}  Brave=${cap("BRAVE_API_KEY")}  CoinGecko=${cap("COINGECKO_API_KEY")}  Etherfuse=${cap("ETHERFUSE_API_KEY")}

slash commands (in Telegram):  /start · /soul · /memory · /goals · /balance
state:                          ./state/{soul.md, memory.json, goals.json, kv.json}

quick guide:
   1. Open Telegram, find your bot, send /start
   2. Then DM any goal, e.g. "what's my balance" or "send 1 XLM to G..."
   3. Standing goals fire on a 60s in-process heartbeat — results are DM'd.
   4. Ctrl+C here gracefully closes the bot's long-poll connection.
`);
}

function describeLlm(): string {
  if (process.env.OPENROUTER_API_KEY) {
    return `${process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free"} (OpenRouter)`;
  }
  if (process.env.OPENAI_API_KEY) {
    return `${process.env.OPENAI_MODEL ?? "gpt-4o-mini"} (OpenAI)`;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return `${process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5"} (Anthropic)`;
  }
  return "(none configured)";
}

function formatAmount(atomic: string): string {
  return BigInt(atomic).toLocaleString();
}

function formatWindow(ms: number): string {
  const hours = ms / (60 * 60 * 1000);
  if (hours >= 24) return `${hours / 24}d`;
  if (hours >= 1) return `${hours}h`;
  return `${ms / 60_000}min`;
}

export async function buildSystemPrompt(bundle: AgentBundle, telegramName?: string): Promise<string> {
  const soulContent = await bundle.soul.read();
  const recentMemory = await bundle.memory.recall({ limit: 8 });
  const standingGoals = await bundle.goals.list({ activeOnly: true });
  const knownAssets = describeKnownAssets(bundle.agent.config.networkPassphrase);
  return [
    `You are ${telegramName ?? "the user"}'s personal Stellar agent on Telegram.`,
    `Wallet: ${bundle.agent.wallet.publicKey} on ${bundle.network}.`,
    "",
    "Be concise — Telegram messages should be short and actionable.",
    "Always describe state-changing actions before doing them. Confirm risky ones.",
    "If a tool is blocked by safety, say what was blocked and why.",
    "",
    "When the user mentions a well-known asset by code (USDC, EURC, AQUA, etc.), use the issuer from the canonical-asset registry below. NEVER invent or guess issuer G-addresses. ASSET_TRUSTLINE_ADD auto-resolves from the registry if `issuer` is omitted; call ASSET_KNOWN_ISSUERS to look up other assets.",
    "",
    "Use AGENT_REMEMBER to capture durable observations. Use AGENT_RECALL when you need context.",
    "Soul.md is the user's personality file — reference it for stable preferences. Suggest edits via AGENT_PROPOSE_SOUL_EDIT.",
    "",
    "─── canonical-asset registry ───",
    knownAssets,
    "",
    "─── soul.md ───",
    soulContent || "(empty)",
    "",
    "─── recent memory ───",
    recentMemory.length
      ? recentMemory.map((e) => `- [${e.kind}] ${e.content}`).join("\n")
      : "(empty)",
    "",
    "─── standing goals ───",
    standingGoals.length
      ? standingGoals.map((g) => `- ${g.id}: ${g.goal}`).join("\n")
      : "(none)",
  ].join("\n");
}
