import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { SorobanPlugin } from "../index";

function makeAgent() {
  const wallet = new KeypairWallet(Keypair.random().secret());
  return new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  }).use(SorobanPlugin);
}

describe("SorobanPlugin", () => {
  it("registers the expected set of actions including fungible-token helpers", () => {
    const agent = makeAgent();

    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      [
        "SOROBAN_INSTALL_WASM",
        "SOROBAN_DEPLOY_CONTRACT",
        "SOROBAN_INVOKE_CONTRACT",
        "SOROBAN_SIMULATE",
        "SOROBAN_GET_CONTRACT_DATA",
        "SOROBAN_GET_EVENTS",
        "SOROBAN_FUNGIBLE_TOKEN_INFO",
        "SOROBAN_FUNGIBLE_TOKEN_BALANCE",
        "SOROBAN_FUNGIBLE_TOKEN_TRANSFER",
      ].sort(),
    );
  });

  it("each action has a non-empty description and zod schema", () => {
    const agent = makeAgent();

    for (const action of agent.actions) {
      expect(action.description.length).toBeGreaterThan(20);
      expect(action.schema).toBeDefined();
    }
  });

  it("SOROBAN_INVOKE_CONTRACT validates required fields", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "SOROBAN_INVOKE_CONTRACT")!;

    expect(action.schema.safeParse({}).success).toBe(false);
    expect(
      action.schema.safeParse({ contractId: "C123", method: "transfer" }).success,
    ).toBe(true);
  });

  it("SOROBAN_FUNGIBLE_TOKEN_INFO requires only contractId", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "SOROBAN_FUNGIBLE_TOKEN_INFO")!;

    expect(action.schema.safeParse({}).success).toBe(false);
    expect(action.schema.safeParse({ contractId: "C123" }).success).toBe(true);
  });

  it("SOROBAN_FUNGIBLE_TOKEN_BALANCE accepts optional account", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "SOROBAN_FUNGIBLE_TOKEN_BALANCE")!;

    // No account -> defaults at handler-time to agent.wallet.publicKey
    expect(action.schema.safeParse({ contractId: "C123" }).success).toBe(true);
    expect(action.schema.safeParse({ contractId: "C123", account: "G456" }).success).toBe(true);
    expect(action.schema.safeParse({}).success).toBe(false);
  });

  it("SOROBAN_FUNGIBLE_TOKEN_TRANSFER requires to + amount; from is optional", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "SOROBAN_FUNGIBLE_TOKEN_TRANSFER")!;

    expect(action.schema.safeParse({ contractId: "C123" }).success).toBe(false);
    expect(action.schema.safeParse({ contractId: "C123", to: "G456" }).success).toBe(false);
    expect(
      action.schema.safeParse({ contractId: "C123", to: "G456", amount: "100" }).success,
    ).toBe(true);
    expect(
      action.schema.safeParse({ contractId: "C123", from: "G1", to: "G456", amount: "100" })
        .success,
    ).toBe(true);
  });
});
