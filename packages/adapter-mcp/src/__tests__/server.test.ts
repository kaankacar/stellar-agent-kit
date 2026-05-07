import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import type { Plugin } from "@stellar-agent-kit/core";
import { createMcpServer } from "../server";

function makeAgent() {
  const wallet = new KeypairWallet(Keypair.random().secret());
  const plugin: Plugin = {
    name: "p",
    methods: {},
    actions: [
      {
        name: "PING",
        similes: ["echo"],
        description: "Returns the input string back.",
        examples: [[{ input: { msg: "hi" }, output: { echoed: "hi" }, explanation: "" }]],
        schema: z.object({ msg: z.string() }),
        handler: async (_a, i) => ({ echoed: i.msg }),
      },
    ],
    initialize() {},
  };
  return new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  }).use(plugin);
}

describe("createMcpServer", () => {
  it("constructs an MCP server without throwing", async () => {
    const agent = makeAgent();
    const server = await createMcpServer({ name: "test-server", version: "0.0.1", agent });
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe("function");
  });
});
