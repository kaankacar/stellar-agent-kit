import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { DefiPlugin, MAINNET_CONTRACTS } from "../index";

function makeAgent() {
  const wallet = new KeypairWallet(Keypair.random().secret());
  return new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  }).use(DefiPlugin);
}

describe("DefiPlugin", () => {
  it("registers twelve actions", () => {
    const agent = makeAgent();
    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      [
        "BLEND_BORROW",
        "BLEND_GET_POSITION",
        "BLEND_REPAY",
        "BLEND_SUPPLY",
        "BLEND_WITHDRAW",
        "REFLECTOR_PRICE",
        "REFLECTOR_TWAP",
        "REFLECTOR_LIST_FEEDS",
        "SOROSWAP_QUOTE",
        "SOROSWAP_SWAP",
        "SOROSWAP_LIQUIDITY_ADD",
        "SOROSWAP_LIQUIDITY_REMOVE",
      ].sort(),
    );
  });

  it("BLEND_SUPPLY defaults poolId to mainnet Blend v1", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "BLEND_SUPPLY")!;
    const parsed = action.schema.safeParse({ asset: "C123", amount: "1" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.poolId).toBe(MAINNET_CONTRACTS.blendV1Pool);
    }
  });

  it("REFLECTOR_PRICE accepts both stellar-address and other-symbol asset shapes", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "REFLECTOR_PRICE")!;
    expect(
      action.schema.safeParse({ asset: { type: "stellar", address: "C123" } }).success,
    ).toBe(true);
    expect(
      action.schema.safeParse({ asset: { type: "other", symbol: "BTC" } }).success,
    ).toBe(true);
    expect(action.schema.safeParse({ asset: { type: "wrong" } }).success).toBe(false);
  });

  it("SOROSWAP_QUOTE defaults network to mainnet and tradeType to EXACT_IN", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "SOROSWAP_QUOTE")!;
    const parsed = action.schema.safeParse({
      assetIn: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
      assetOut: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
      amount: "10000000",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.network).toBe("mainnet");
      expect(parsed.data.tradeType).toBe("EXACT_IN");
      expect(parsed.data.slippageBps).toBe("50");
    }
  });

  it("SOROSWAP_LIQUIDITY_ADD schema requires both amounts and defaults slippage/network", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "SOROSWAP_LIQUIDITY_ADD")!;

    // missing amountB -> fails
    expect(
      action.schema.safeParse({
        assetA: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
        assetB: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
        amountA: "10000000",
      }).success,
    ).toBe(false);

    const parsed = action.schema.safeParse({
      assetA: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
      assetB: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
      amountA: "10000000",
      amountB: "1000000",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.slippageBps).toBe("50");
      expect(parsed.data.network).toBe("mainnet");
    }
  });

  it("REFLECTOR_LIST_FEEDS returns a non-empty directory of mainnet oracles", async () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "REFLECTOR_LIST_FEEDS")!;
    // Schema accepts an empty object
    expect(action.schema.safeParse({}).success).toBe(true);

    const out = await action.handler(agent, {});
    expect(Array.isArray(out.feeds)).toBe(true);
    expect((out.feeds as unknown[]).length).toBeGreaterThan(0);

    for (const feed of out.feeds as Array<Record<string, unknown>>) {
      expect(typeof feed.name).toBe("string");
      expect(typeof feed.contractId).toBe("string");
      expect(["stellar", "external"]).toContain(feed.kind);
      // Stellar contract ids start with C and are 56 chars long.
      expect((feed.contractId as string).startsWith("C")).toBe(true);
      expect((feed.contractId as string).length).toBe(56);
    }

    // The XLM/USD external oracle (the existing default) should always be present.
    const ids = (out.feeds as Array<{ contractId: string }>).map((f) => f.contractId);
    expect(ids).toContain(MAINNET_CONTRACTS.reflectorXlmUsd);
  });

  it("SOROSWAP_LIQUIDITY_REMOVE defaults minAmountA/minAmountB to '0'", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "SOROSWAP_LIQUIDITY_REMOVE")!;
    const parsed = action.schema.safeParse({
      assetA: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
      assetB: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
      liquidity: "10000000",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.minAmountA).toBe("0");
      expect(parsed.data.minAmountB).toBe("0");
      expect(parsed.data.slippageBps).toBe("50");
      expect(parsed.data.network).toBe("mainnet");
    }
  });
});
