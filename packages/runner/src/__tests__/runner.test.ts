import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet, InMemoryKVStore } from "@stellar-agent-kit/core";
import type { Plugin, Action } from "@stellar-agent-kit/core";
import { autonomousRun } from "../loop";
import { validateNetworkSandbox, SpendCap } from "../safety";
import { SpendTracker } from "../spendTracker";
import { alwaysApprove, alwaysReject } from "../confirm";
import type { LanguageModelV1 } from "ai";

/**
 * Stub LLM that emits a pre-scripted sequence of tool calls. Avoids any real
 * model usage in tests. Each `step` produces one assistant message; the first
 * N-1 are `tool-calls`, the last one is `stop` with text.
 */
function stubLlm(scripted: Array<{ tool: string; args: Record<string, unknown> }>): LanguageModelV1 {
  let step = 0;
  const llm: Partial<LanguageModelV1> & { specificationVersion: "v1" } = {
    specificationVersion: "v1",
    provider: "test",
    modelId: "stub",
    defaultObjectGenerationMode: "json",
    async doGenerate() {
      const idx = step++;
      const finishReason: "tool-calls" | "stop" = idx < scripted.length ? "tool-calls" : "stop";
      const toolCalls =
        finishReason === "tool-calls"
          ? [
              {
                toolCallType: "function" as const,
                toolCallId: `call-${idx}`,
                toolName: scripted[idx]!.tool,
                args: JSON.stringify(scripted[idx]!.args),
              },
            ]
          : [];
      return {
        finishReason,
        usage: { promptTokens: 0, completionTokens: 0 },
        rawCall: { rawPrompt: null, rawSettings: {} },
        text: finishReason === "stop" ? "Done." : undefined,
        toolCalls,
        warnings: [],
      };
    },
  };
  return llm as LanguageModelV1;
}

function makeAgent(opts: { network?: string; actions?: Action[] } = {}) {
  const wallet = new KeypairWallet(Keypair.random().secret());
  const echo: Plugin = {
    name: "echo",
    methods: {},
    actions: opts.actions ?? [
      {
        name: "ASSET_TRANSFER",
        similes: ["send"],
        description: "Transfer XLM or another asset.",
        examples: [
          [
            {
              input: { destination: "G", assetCode: "XLM", amount: "1" },
              output: { hash: "h" },
              explanation: "",
            },
          ],
        ],
        schema: z.object({
          destination: z.string(),
          assetCode: z.string(),
          amount: z.string(),
        }),
        handler: async (_a, input) => ({ hash: `tx-${input.amount}` }),
      },
      {
        name: "ASSET_GET_BALANCE",
        similes: ["balance"],
        description: "Read the agent's balance.",
        examples: [[{ input: {}, output: { xlm: "100" }, explanation: "" }]],
        schema: z.object({}),
        handler: async () => ({ xlm: "100" }),
      },
    ],
    initialize() {},
  };
  return new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: opts.network ?? Networks.TESTNET,
    kvStore: new InMemoryKVStore(),
  }).use(echo);
}

describe("validateNetworkSandbox", () => {
  it("throws NETWORK_SANDBOX_VIOLATION when agent is on a disallowed network", () => {
    const agent = makeAgent({ network: Networks.PUBLIC });
    expect(() =>
      validateNetworkSandbox(agent, { network: { allow: ["testnet"] } }),
    ).toThrowError(/NETWORK_SANDBOX_VIOLATION|sandbox/i);
  });

  it("does not throw when network matches", () => {
    const agent = makeAgent({ network: Networks.TESTNET });
    expect(() =>
      validateNetworkSandbox(agent, { network: { allow: ["testnet"] } }),
    ).not.toThrow();
  });

  it("does not throw when no network constraint is set", () => {
    const agent = makeAgent({ network: Networks.PUBLIC });
    expect(() => validateNetworkSandbox(agent, {})).not.toThrow();
  });
});

describe("SpendTracker", () => {
  it("blocks the second swap when cumulative spend would exceed the daily cap", async () => {
    const store = new InMemoryKVStore();
    const tracker = new SpendTracker(store, [SpendCap.daily({ asset: "USDC", limit: "50" })]);

    const first = await tracker.wouldExceed("USDC", "30");
    expect(first.exceeded).toBe(false);
    await tracker.record("USDC", "30");

    const second = await tracker.wouldExceed("USDC", "30");
    expect(second.exceeded).toBe(true);
    expect(second.cap?.limit).toBe("50");
  });

  it("ignores assets with no matching cap", async () => {
    const store = new InMemoryKVStore();
    const tracker = new SpendTracker(store, [SpendCap.daily({ asset: "USDC", limit: "50" })]);
    const result = await tracker.wouldExceed("XLM", "1000000000");
    expect(result.exceeded).toBe(false);
  });
});

describe("checkSafety unit", () => {
  it("blocks an action that's not on the allowlist", async () => {
    const { checkSafety } = await import("../safety");
    const events: unknown[] = [];
    const decision = await checkSafety(
      {
        name: "ASSET_TRANSFER",
        similes: [],
        description: "x",
        examples: [],
        schema: z.object({}),
        handler: async () => ({}),
      },
      { destination: "G", assetCode: "XLM", amount: "1" },
      { actionAllowlist: ["ASSET_GET_BALANCE"] },
      undefined,
      (e) => events.push(e),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.blockCode).toBe("BLOCKED_BY_ALLOWLIST");
  });

  it("blocks an action on the denylist regardless of allowlist", async () => {
    const { checkSafety } = await import("../safety");
    const decision = await checkSafety(
      {
        name: "ASSET_TRANSFER",
        similes: [],
        description: "x",
        examples: [],
        schema: z.object({}),
        handler: async () => ({}),
      },
      {},
      {
        actionAllowlist: ["ASSET_TRANSFER"],
        actionDenylist: ["ASSET_TRANSFER"],
      },
      undefined,
      () => undefined,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.blockCode).toBe("BLOCKED_BY_DENYLIST");
  });
});

describe("autonomousRun safety enforcement", () => {
  it("allowlist pre-filters tools so the LLM cannot even attempt disallowed actions", async () => {
    const agent = makeAgent();
    // The LLM is scripted to ONLY call the allowed action, simulating a
    // well-behaved agent. The point of this test is to assert that allowed
    // actions still flow through and the loop terminates cleanly.
    const llm = stubLlm([{ tool: "ASSET_GET_BALANCE", args: {} }]);
    const result = await autonomousRun({
      agent,
      llm,
      goal: "check balance",
      loop: { maxIterations: 2 },
      safety: { actionAllowlist: ["ASSET_GET_BALANCE"] },
    });
    expect(result.succeeded).toBe(1);
    expect(result.blocked).toBe(0);
    const succeeded = result.events.find(
      (e) => e.type === "tool.result" && (e as { result: Record<string, unknown> }).result.xlm === "100",
    );
    expect(succeeded).toBeDefined();
  });

  it("dryRun intercepts state-changing actions and returns a stub", async () => {
    const agent = makeAgent();
    const handlerSpy = vi.spyOn(agent.actions[0]!, "handler");
    const llm = stubLlm([
      { tool: "ASSET_TRANSFER", args: { destination: "G", assetCode: "XLM", amount: "1" } },
    ]);
    const result = await autonomousRun({
      agent,
      llm,
      goal: "send",
      loop: { maxIterations: 2 },
      safety: { dryRun: true },
    });
    const toolResult = result.events.find((e) => e.type === "tool.result");
    expect(toolResult).toBeDefined();
    if (toolResult && toolResult.type === "tool.result") {
      expect(toolResult.result.dryRun).toBe(true);
    }
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it("requireHumanFor: rejection blocks the call with REJECTED_BY_HUMAN", async () => {
    const agent = makeAgent();
    const llm = stubLlm([
      { tool: "ASSET_TRANSFER", args: { destination: "G", assetCode: "XLM", amount: "1" } },
    ]);
    const result = await autonomousRun({
      agent,
      llm,
      goal: "send",
      loop: { maxIterations: 2 },
      safety: {
        requireHumanFor: { actionNames: ["ASSET_TRANSFER"] },
        confirm: alwaysReject,
      },
    });
    const rejected = result.events.find((e) => e.type === "human.rejected");
    expect(rejected).toBeDefined();
    expect(result.blocked).toBe(0); // tool.blocked is for allowlist/spend; human-rejection is its own event
  });

  it("requireHumanFor: approval lets the call through", async () => {
    const agent = makeAgent();
    const llm = stubLlm([
      { tool: "ASSET_TRANSFER", args: { destination: "G", assetCode: "XLM", amount: "1" } },
    ]);
    const result = await autonomousRun({
      agent,
      llm,
      goal: "send",
      loop: { maxIterations: 2 },
      safety: {
        requireHumanFor: { actionNames: ["ASSET_TRANSFER"] },
        confirm: alwaysApprove,
      },
    });
    const succeeded = result.events.find(
      (e) => e.type === "tool.result" && (e as { result: Record<string, unknown> }).result.hash,
    );
    expect(succeeded).toBeDefined();
  });

  it("spend cap blocks a swap that would exceed the daily limit", async () => {
    const agent = makeAgent();
    // First call uses 30 USDC, second would push to 60 USDC under a 50 cap.
    const llm = stubLlm([
      { tool: "ASSET_TRANSFER", args: { destination: "G", assetCode: "USDC", amount: "30" } },
      { tool: "ASSET_TRANSFER", args: { destination: "G", assetCode: "USDC", amount: "30" } },
    ]);
    const result = await autonomousRun({
      agent,
      llm,
      goal: "send",
      loop: { maxIterations: 4 },
      safety: {
        spendCaps: [SpendCap.daily({ asset: "USDC", limit: "50" })],
      },
    });
    expect(result.succeeded).toBe(1);
    expect(result.blocked).toBe(1);
    const block = result.events.find((e) => e.type === "tool.blocked");
    expect(block && block.type === "tool.blocked" ? block.reason : "").toMatch(/spend cap/i);
  });
});
