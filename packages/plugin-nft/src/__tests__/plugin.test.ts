import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { NftPlugin } from "../index";

function makeAgent() {
  const wallet = new KeypairWallet(Keypair.random().secret());
  return new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  }).use(NftPlugin);
}

describe("NftPlugin", () => {
  it("registers the expected set of actions including royalty info", () => {
    const agent = makeAgent();
    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      [
        "NFT_APPROVE",
        "NFT_BALANCE_OF",
        "NFT_BURN",
        "NFT_COLLECTION_INFO",
        "NFT_MINT",
        "NFT_OWNER_OF",
        "NFT_ROYALTY_INFO",
        "NFT_TOKEN_URI",
        "NFT_TRANSFER",
      ].sort(),
    );
  });

  it("NFT_MINT schema requires contractId and to", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "NFT_MINT")!;
    expect(action.schema.safeParse({}).success).toBe(false);
    expect(action.schema.safeParse({ contractId: "C123", to: "G456" }).success).toBe(true);
  });

  it("NFT_TRANSFER requires tokenId as integer", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "NFT_TRANSFER")!;
    expect(
      action.schema.safeParse({ contractId: "C", from: "G", to: "G", tokenId: 1.5 }).success,
    ).toBe(false);
    expect(
      action.schema.safeParse({ contractId: "C", from: "G", to: "G", tokenId: 1 }).success,
    ).toBe(true);
  });

  it("NFT_ROYALTY_INFO requires contractId, integer tokenId, and salePrice string", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "NFT_ROYALTY_INFO")!;
    // Missing fields
    expect(action.schema.safeParse({}).success).toBe(false);
    expect(action.schema.safeParse({ contractId: "C", tokenId: 1 }).success).toBe(false);
    // Non-integer tokenId
    expect(
      action.schema.safeParse({ contractId: "C", tokenId: 1.5, salePrice: "100" }).success,
    ).toBe(false);
    // salePrice must be string
    expect(
      action.schema.safeParse({ contractId: "C", tokenId: 1, salePrice: 100 }).success,
    ).toBe(false);
    // Happy path
    expect(
      action.schema.safeParse({ contractId: "C", tokenId: 1, salePrice: "100" }).success,
    ).toBe(true);
  });
});
