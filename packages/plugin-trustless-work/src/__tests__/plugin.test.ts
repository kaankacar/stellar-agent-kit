import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { TrustlessWorkPlugin } from "../index";

function makeAgent(apiKeys: Record<string, string> = {}) {
  const wallet = new KeypairWallet(Keypair.random().secret());
  return new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
    apiKeys,
  }).use(TrustlessWorkPlugin);
}

describe("TrustlessWorkPlugin", () => {
  it("registers eight actions", () => {
    const agent = makeAgent();
    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      [
        "TW_APPROVE_MILESTONES",
        "TW_CREATE_MULTI_RELEASE",
        "TW_CREATE_SINGLE_RELEASE",
        "TW_FUND_ESCROW",
        "TW_GET_ESCROW",
        "TW_RAISE_DISPUTE",
        "TW_RELEASE",
        "TW_UPDATE_MILESTONE",
      ].sort(),
    );
  });

  it("TW_GET_ESCROW raises API_KEY_MISSING when no key is configured", async () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "TW_GET_ESCROW")!;
    await expect(action.handler(agent, { escrowId: "C..." })).rejects.toThrowError(
      /API key missing/,
    );
  });

  it("TW_APPROVE_MILESTONES schema requires either milestones or milestoneId", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "TW_APPROVE_MILESTONES")!;
    expect(action.schema.safeParse({ escrowId: "C..." }).success).toBe(false);
    expect(action.schema.safeParse({ escrowId: "C...", milestones: [0] }).success).toBe(true);
    expect(action.schema.safeParse({ escrowId: "C...", milestoneId: 0 }).success).toBe(true);
  });

  it("TW_RELEASE schema requires either releaseAll:true or milestoneId", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "TW_RELEASE")!;
    expect(action.schema.safeParse({ escrowId: "C..." }).success).toBe(false);
    expect(action.schema.safeParse({ escrowId: "C...", releaseAll: true }).success).toBe(true);
    expect(action.schema.safeParse({ escrowId: "C...", milestoneId: 1 }).success).toBe(true);
  });
});
