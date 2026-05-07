import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { SmartWalletPlugin, SmartAccountWallet } from "../index";

describe("SmartWalletPlugin", () => {
  it("registers two actions", () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(SmartWalletPlugin);
    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      ["SMART_WALLET_GET_SIGNERS", "SMART_WALLET_INFO"].sort(),
    );
  });

  it("SMART_WALLET_INFO returns NOT_SMART_ACCOUNT for a G... wallet", async () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(SmartWalletPlugin);
    const action = agent.actions.find((a) => a.name === "SMART_WALLET_INFO")!;
    const result = await action.handler(agent, {});
    expect(result.error).toBe("NOT_SMART_ACCOUNT");
  });

  it("SmartAccountWallet wraps a structural signer", async () => {
    const calls: string[] = [];
    const signer = {
      contractId: "C" + "A".repeat(55),
      async signTransaction(xdr: string) {
        calls.push(xdr);
        return xdr + ".signed";
      },
    };
    const wallet = SmartAccountWallet.fromKit(signer);
    expect(wallet.publicKey).toBe(signer.contractId);
    const signed = await wallet.signTransaction("AAA", { networkPassphrase: Networks.TESTNET });
    expect(signed).toBe("AAA.signed");
    expect(calls).toEqual(["AAA"]);
  });
});
