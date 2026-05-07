import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { PaymentsPlugin } from "../index";

describe("PaymentsPlugin", () => {
  it("registers two actions", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(PaymentsPlugin);

    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      ["MPP_CHARGE_FETCH", "X402_FETCH"].sort(),
    );
  });

  it("X402_FETCH errors with X402_SECRET_REQUIRED when no secret is configured", async () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(PaymentsPlugin);
    const action = agent.actions.find((a) => a.name === "X402_FETCH")!;
    await expect(
      action.handler(agent, {
        url: "https://example.com",
        method: "GET",
        network: "stellar:testnet",
      }),
    ).rejects.toThrowError(/X402_FETCH requires/);
  });
});
