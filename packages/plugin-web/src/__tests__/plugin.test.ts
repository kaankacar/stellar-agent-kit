import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { WebPlugin } from "../index";

describe("WebPlugin", () => {
  it("registers two actions", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(WebPlugin);
    expect(agent.actions.map((a) => a.name).sort()).toEqual(["WEB_FETCH", "WEB_SEARCH"]);
  });

  it("WEB_SEARCH errors with API_KEY_MISSING when brave key isn't set", async () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(WebPlugin);
    const action = agent.actions.find((a) => a.name === "WEB_SEARCH")!;
    await expect(action.handler(agent, { query: "x", count: 5 })).rejects.toThrowError(
      /Brave Search API key/,
    );
  });

  it("WEB_SEARCH schema accepts optional freshness + country", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(WebPlugin);
    const action = agent.actions.find((a) => a.name === "WEB_SEARCH")!;
    expect(
      action.schema.safeParse({ query: "x", freshness: "pd", country: "MX" }).success,
    ).toBe(true);
    expect(action.schema.safeParse({ query: "x", country: "USA" }).success).toBe(false);
  });
});
