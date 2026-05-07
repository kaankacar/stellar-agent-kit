import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { BridgePlugin } from "../index";

describe("BridgePlugin", () => {
  it("registers three actions", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(BridgePlugin);
    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      ["BRIDGE_BUILD_TX", "BRIDGE_LIST_TOKENS", "BRIDGE_QUOTE"].sort(),
    );
  });

  it("BRIDGE_QUOTE schema requires both source and destination chain/token", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(BridgePlugin);
    const action = agent.actions.find((a) => a.name === "BRIDGE_QUOTE")!;
    expect(action.schema.safeParse({}).success).toBe(false);
    expect(
      action.schema.safeParse({
        sourceChain: "ETH",
        sourceTokenSymbol: "USDC",
        destinationChain: "STLR",
        destinationTokenSymbol: "USDC",
        amount: "100",
      }).success,
    ).toBe(true);
  });

  it("BRIDGE_BUILD_TX defaults messenger to ALLBRIDGE", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(BridgePlugin);
    const action = agent.actions.find((a) => a.name === "BRIDGE_BUILD_TX")!;
    const parsed = action.schema.safeParse({
      sourceChain: "STLR",
      sourceTokenSymbol: "USDC",
      destinationChain: "ETH",
      destinationTokenSymbol: "USDC",
      amount: "100",
      toAccount: "0x000",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.messenger).toBe("ALLBRIDGE");
  });
});
