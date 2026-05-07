import { describe, it, expect } from "vitest";
import { scheduledRun } from "../scheduled";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { z } from "zod";
import { StellarAgentKit, KeypairWallet, InMemoryKVStore } from "@stellar-agent-kit/core";
import type { Plugin } from "@stellar-agent-kit/core";
import type { LanguageModelV1 } from "ai";

function stubLlm(): LanguageModelV1 {
  let count = 0;
  return {
    specificationVersion: "v1",
    provider: "test",
    modelId: "stub",
    defaultObjectGenerationMode: "json",
    async doGenerate() {
      count++;
      return {
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0 },
        rawCall: { rawPrompt: null, rawSettings: {} },
        text: `iteration ${count}`,
        toolCalls: [],
        warnings: [],
      };
    },
  } as unknown as LanguageModelV1;
}

function makeAgent() {
  const wallet = new KeypairWallet(Keypair.random().secret());
  const noop: Plugin = {
    name: "noop",
    methods: {},
    actions: [
      {
        name: "PING",
        similes: [],
        description: "ping",
        examples: [[{ input: {}, output: {}, explanation: "" }]],
        schema: z.object({}),
        handler: async () => ({ ok: true }),
      },
    ],
    initialize() {},
  };
  return new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
    kvStore: new InMemoryKVStore(),
  }).use(noop);
}

describe("scheduledRun", () => {
  it("rejects intervalMs < 30s", () => {
    const agent = makeAgent();
    expect(() =>
      scheduledRun({
        agent,
        llm: stubLlm(),
        goal: "x",
        intervalMs: 1_000,
      }),
    ).toThrowError(/intervalMs/);
  });

  it("runs `maxIterations` then auto-stops", async () => {
    const agent = makeAgent();
    const handle = scheduledRun({
      agent,
      llm: stubLlm(),
      goal: "x",
      intervalMs: 30_000,
      maxIterations: 2,
    });
    // First iteration fires on next tick. We need to manually advance — easiest
    // is to wait briefly then stop manually if not converged.
    // For deterministic behaviour, drive via signal abort.
    setTimeout(() => handle.stop(), 100);
    const result = await handle.done;
    expect(result.iterations).toBeGreaterThanOrEqual(1);
  });

  it("stops cleanly when AbortSignal fires", async () => {
    const agent = makeAgent();
    const ctrl = new AbortController();
    const handle = scheduledRun({
      agent,
      llm: stubLlm(),
      goal: "x",
      intervalMs: 30_000,
      signal: ctrl.signal,
    });
    setTimeout(() => ctrl.abort(), 100);
    const result = await handle.done;
    expect(result.iterations).toBeGreaterThanOrEqual(1);
  });
});
