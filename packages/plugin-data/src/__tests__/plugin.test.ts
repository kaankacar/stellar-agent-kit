import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { DataPlugin } from "../index";

describe("DataPlugin", () => {
  it("registers seven actions", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(DataPlugin);

    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      [
        "STELLAR_EXPERT_ACCOUNT",
        "STELLAR_EXPERT_ASSET",
        "RPC_GET_LATEST_LEDGER",
        "HORIZON_TX_HISTORY",
        "COINGECKO_TOKEN_PRICE",
        "COINGECKO_TRENDING",
        "COINGECKO_TOKEN_INFO",
      ].sort(),
    );
  });

  it("HORIZON_TX_HISTORY raises HORIZON_NOT_CONFIGURED when horizon is unset", async () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(DataPlugin);
    const action = agent.actions.find((a) => a.name === "HORIZON_TX_HISTORY")!;
    await expect(action.handler(agent, { limit: 10, order: "desc" })).rejects.toThrowError(
      /horizonUrl/,
    );
  });

  it("COINGECKO_TOKEN_PRICE schema requires ids and defaults vsCurrencies to ['usd']", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(DataPlugin);
    const action = agent.actions.find((a) => a.name === "COINGECKO_TOKEN_PRICE")!;

    // empty ids array should fail
    expect(action.schema.safeParse({ ids: [] }).success).toBe(false);

    // valid ids -> vsCurrencies defaults to ["usd"]
    const parsed = action.schema.safeParse({ ids: ["stellar"] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.vsCurrencies).toEqual(["usd"]);
    }
  });
});
