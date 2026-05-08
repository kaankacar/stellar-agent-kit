import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit } from "../agent";
import { KeypairWallet } from "../wallets/KeypairWallet";
import type { Plugin } from "../types";
import { createVercelAITools } from "../vercel-ai";
import { createLangchainTools } from "../langchain";
import { createOpenAITools } from "../openai";
import { createClaudeTools } from "../claude";

function setup() {
  const wallet = new KeypairWallet(Keypair.random().secret());
  const plugin: Plugin = {
    name: "p",
    methods: {},
    actions: [
      {
        name: "GREET",
        similes: ["hello"],
        description: "Returns a greeting.",
        examples: [[{ input: { who: "world" }, output: { msg: "hi world" }, explanation: "" }]],
        schema: z.object({ who: z.string() }),
        handler: async (_a, i) => ({ msg: `hi ${i.who}` }),
      },
    ],
    initialize() {},
  };
  const agent = new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  }).use(plugin);
  return agent;
}

describe("adapters", () => {
  it("Vercel AI: each action becomes a tool keyed by name and is executable", async () => {
    const agent = setup();
    const tools = await createVercelAITools(agent, agent.actions);
    expect(tools.GREET).toBeDefined();
    const exec = tools.GREET!.execute as unknown as (
      params: Record<string, unknown>,
      ctx: unknown,
    ) => Promise<Record<string, unknown>>;
    const result = await exec({ who: "agent" }, { toolCallId: "1", messages: [] });
    expect(result).toEqual({ msg: "hi agent" });
  });

  it("LangChain: each action becomes a DynamicStructuredTool returning JSON", async () => {
    const agent = setup();
    const tools = (await createLangchainTools(agent, agent.actions)) as Array<{
      name: string;
      invoke: (input: Record<string, unknown>) => Promise<string>;
    }>;
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("GREET");
    const result = await tools[0]!.invoke({ who: "lc" });
    expect(JSON.parse(result as string)).toEqual({ msg: "hi lc" });
  });

  it("OpenAI: returns a function-tool array and an execute() dispatcher", async () => {
    const agent = setup();
    const { tools, execute } = createOpenAITools(agent, agent.actions);
    expect(tools[0]!.type).toBe("function");
    expect(tools[0]!.function.name).toBe("GREET");
    const result = await execute("GREET", { who: "oai" });
    expect(result).toEqual({ msg: "hi oai" });
  });

  it("OpenAI: execute() of unknown tool returns a structured error", async () => {
    const agent = setup();
    const { execute } = createOpenAITools(agent, agent.actions);
    const result = await execute("NOPE", {});
    expect(result.status).toBe("error");
    expect(result.error).toBe("UNKNOWN_TOOL");
  });

  it("Claude: returns Anthropic tools and an execute() dispatcher", async () => {
    const agent = setup();
    const { tools, execute } = createClaudeTools(agent, agent.actions);
    expect(tools[0]!.name).toBe("GREET");
    expect(tools[0]!.input_schema.type).toBe("object");
    const result = await execute("GREET", { who: "claude" });
    expect(result).toEqual({ msg: "hi claude" });
  });
});
