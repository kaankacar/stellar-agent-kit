import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { DomainPlugin } from "../index";

describe("DomainPlugin", () => {
  it("registers two actions", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(DomainPlugin);

    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      ["DOMAIN_RESOLVE", "DOMAIN_REVERSE"].sort(),
    );
  });

  it("DOMAIN_RESOLVE schema requires `domain`", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(DomainPlugin);
    const action = agent.actions.find((a) => a.name === "DOMAIN_RESOLVE")!;
    expect(action.schema.safeParse({}).success).toBe(false);
    expect(action.schema.safeParse({ domain: "alice.xlm" }).success).toBe(true);
  });
});
