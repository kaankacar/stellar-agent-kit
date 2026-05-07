import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { DefindexPlugin } from "../index";

describe("DefindexPlugin", () => {
  it("registers four actions", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(DefindexPlugin);
    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      [
        "DEFINDEX_DEPOSIT",
        "DEFINDEX_GET_POSITION",
        "DEFINDEX_LIST_VAULTS",
        "DEFINDEX_WITHDRAW",
      ].sort(),
    );
  });

  it("DEFINDEX_LIST_VAULTS errors with API_KEY_MISSING when no key is configured", async () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(DefindexPlugin);
    const action = agent.actions.find((a) => a.name === "DEFINDEX_LIST_VAULTS")!;
    await expect(action.handler(agent, { network: "mainnet" })).rejects.toThrowError(
      /API key missing/,
    );
  });
});
