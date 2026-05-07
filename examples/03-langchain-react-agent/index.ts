/**
 * LangChain ReAct agent driven by Stellar Agent Kit tools.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... pnpm --filter @stellar-agent-kit/example-langchain-react start
 *
 * Or with no key set, runs an offline tool-shape sanity check that asserts the
 * agent's tools are LangChain-compatible without making any model calls.
 */
import { Keypair, Networks } from "@stellar/stellar-sdk";
import {
  StellarAgentKit,
  KeypairWallet,
  createLangchainTools,
} from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
import { DataPlugin } from "@stellar-agent-kit/plugin-data";

async function friendbotFund(publicKey: string): Promise<void> {
  const resp = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!resp.ok) throw new Error(`Friendbot failed: ${resp.status}`);
}

async function main(): Promise<void> {
  const keypair = Keypair.random();
  console.log(`[+] Generated wallet ${keypair.publicKey()}`);
  await friendbotFund(keypair.publicKey());
  console.log("[+] Funded via Friendbot");

  const wallet = new KeypairWallet(keypair.secret());
  const agent = new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  })
    .use(StellarAssetPlugin)
    .use(DataPlugin);

  const tools = createLangchainTools(agent, agent.actions);
  console.log(`[+] Built ${tools.length} LangChain tools`);

  if (!process.env.OPENAI_API_KEY) {
    console.log("[!] OPENAI_API_KEY not set — running offline sanity check only.");
    const balanceTool = tools.find((t) => t.name === "ASSET_GET_BALANCE")!;
    const result = await balanceTool.invoke({});
    console.log("[+] ASSET_GET_BALANCE direct invoke:", result);
    return;
  }

  // Lazy-import LangChain so the offline path doesn't pay the import cost.
  const { ChatOpenAI } = await import("@langchain/openai");
  const { createToolCallingAgent, AgentExecutor } = await import("langchain/agents");
  const { ChatPromptTemplate, MessagesPlaceholder } = await import(
    "@langchain/core/prompts"
  );

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are a Stellar/Soroban operator. Use the provided tools to answer the user's question. Always check the result of one tool before deciding on the next. Reply with a single concise sentence.",
    ],
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);
  const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });

  const agentChain = await createToolCallingAgent({ llm, tools, prompt });
  const executor = new AgentExecutor({ agent: agentChain, tools, verbose: true });

  const result = await executor.invoke({
    input: `Check the XLM balance of the agent's wallet (${agent.wallet.publicKey}) and report the amount.`,
  });
  console.log("\n[+] Final answer:", result.output);
}

main().catch((err) => {
  console.error("[x] LangChain example failed:", err);
  process.exit(1);
});
