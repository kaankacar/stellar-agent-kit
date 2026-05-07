import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit } from "../agent";
import { KeypairWallet } from "../wallets/KeypairWallet";
import type { Plugin } from "../types";
import { executeAction } from "../utils/actionExecutor";
import { createVercelAITools } from "../vercel-ai";

const TEST_SECRET = Keypair.random().secret();

function makePlugin(): Plugin {
  return {
    name: "echo",
    methods: {
      echo: (msg: string) => msg,
    },
    actions: [
      {
        name: "ECHO",
        similes: ["repeat", "say back"],
        description: "Echoes the input string back as the result.",
        examples: [[{ input: { msg: "hi" }, output: { echoed: "hi" }, explanation: "" }]],
        schema: z.object({ msg: z.string() }),
        handler: async (_agent, input) => ({ echoed: input.msg }),
      },
    ],
    initialize() {},
  };
}

describe("StellarAgentKit", () => {
  it("constructs with a KeypairWallet and exposes its pubkey", () => {
    const wallet = new KeypairWallet(TEST_SECRET);
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    });
    expect(agent.wallet.publicKey).toMatch(/^G/);
    expect(agent.actions).toHaveLength(0);
  });

  it("registers plugin actions and methods via .use()", () => {
    const wallet = new KeypairWallet(TEST_SECRET);
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(makePlugin());

    expect(agent.actions).toHaveLength(1);
    expect(agent.actions[0]!.name).toBe("ECHO");
    const methods = agent.methods as unknown as { echo: (m: string) => string };
    expect(methods.echo("yo")).toBe("yo");
  });

  it("does not double-register the same plugin", () => {
    const wallet = new KeypairWallet(TEST_SECRET);
    const plugin = makePlugin();
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    })
      .use(plugin)
      .use(plugin);
    expect(agent.actions).toHaveLength(1);
  });
});

describe("executeAction", () => {
  it("validates input via zod and calls the handler", async () => {
    const wallet = new KeypairWallet(TEST_SECRET);
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(makePlugin());

    const result = await executeAction(agent.actions[0]!, agent, { msg: "hello" });
    expect(result).toEqual({ echoed: "hello" });
  });

  it("returns a structured VALIDATION_ERROR when input is bad", async () => {
    const wallet = new KeypairWallet(TEST_SECRET);
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(makePlugin());

    const result = await executeAction(agent.actions[0]!, agent, { msg: 123 });
    expect(result.status).toBe("error");
    expect(result.error).toBe("VALIDATION_ERROR");
  });

  it("catches handler errors as HANDLER_ERROR by default", async () => {
    const wallet = new KeypairWallet(TEST_SECRET);
    const throwerPlugin: Plugin = {
      name: "thrower",
      methods: {},
      actions: [
        {
          name: "THROW",
          similes: [],
          description: "Always throws.",
          examples: [[{ input: {}, output: {}, explanation: "" }]],
          schema: z.object({}),
          handler: async () => {
            throw new Error("boom");
          },
        },
      ],
      initialize() {},
    };
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(throwerPlugin);

    const result = await executeAction(agent.actions[0]!, agent, {});
    expect(result.status).toBe("error");
    expect(result.error).toBe("HANDLER_ERROR");
    expect(result.message).toBe("boom");
  });
});

describe("createVercelAITools", () => {
  it("returns one tool per action keyed by action.name", () => {
    const wallet = new KeypairWallet(TEST_SECRET);
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(makePlugin());

    const tools = createVercelAITools(agent, agent.actions);
    expect(Object.keys(tools)).toEqual(["ECHO"]);
    expect(tools.ECHO).toBeDefined();
  });
});
