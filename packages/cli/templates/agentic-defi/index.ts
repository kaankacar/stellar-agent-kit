import "dotenv/config";
/**
 * LangChain ReAct-style agent that uses Stellar Agent Kit tools to answer
 * portfolio / DeFi questions.
 *
 * Works with OpenAI directly OR via OpenRouter (for free models). Set either
 * OPENAI_API_KEY or OPENROUTER_API_KEY in .env. The script picks based on which
 * is set.
 */
import { Keypair, Networks } from "@stellar/stellar-sdk";
import {
  StellarAgentKit,
  KeypairWallet,
  createLangchainTools,
} from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
import { DefiPlugin } from "@stellar-agent-kit/plugin-defi";
import { DataPlugin } from "@stellar-agent-kit/plugin-data";

const SECRET = process.env.STELLAR_SECRET_KEY;
if (!SECRET) throw new Error("STELLAR_SECRET_KEY required");
Keypair.fromSecret(SECRET);

const wallet = new KeypairWallet(SECRET);
const agent = new StellarAgentKit(wallet, {
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  apiKeys: {
    // Required for any Soroswap quote/swap. Get one at https://docs.soroswap.finance.
    soroswap: process.env.SOROSWAP_API_KEY ?? "",
  },
})
  .use(StellarAssetPlugin)
  .use(DefiPlugin)
  .use(DataPlugin);

const tools = await createLangchainTools(agent, agent.actions);
console.log(`Built ${tools.length} LangChain tools.`);

const { ChatOpenAI } = await import("@langchain/openai");
const { createToolCallingAgent, AgentExecutor } = await import("langchain/agents");
const { ChatPromptTemplate, MessagesPlaceholder } = await import("@langchain/core/prompts");

const baseURL = process.env.OPENROUTER_API_KEY
  ? "https://openrouter.ai/api/v1"
  : undefined;
const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Set OPENAI_API_KEY or OPENROUTER_API_KEY in .env");
  process.exit(1);
}

const llm = new ChatOpenAI({
  model: process.env.OPENROUTER_API_KEY
    ? "nvidia/nemotron-3-super-120b-a12b:free"
    : "gpt-4o-mini",
  temperature: 0,
  apiKey,
  configuration: baseURL ? { baseURL } : undefined,
});

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "You are a Stellar DeFi operator. Use the provided tools to answer. Always describe what you'll do before doing it. Reply with a single concise sentence.",
  ],
  ["human", "{input}"],
  new MessagesPlaceholder("agent_scratchpad"),
]);

const lcAgent = await createToolCallingAgent({ llm, tools, prompt });
const executor = new AgentExecutor({ agent: lcAgent, tools, verbose: true });

const goal =
  process.argv[2] ??
  `Check the XLM balance of ${agent.wallet.publicKey}. Report the amount.`;

const result = await executor.invoke({ input: goal });
console.log("\nFinal:", result.output);
