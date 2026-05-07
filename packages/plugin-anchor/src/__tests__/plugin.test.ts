import { describe, it, expect } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet, InMemoryKVStore } from "@stellar-agent-kit/core";
import { AnchorPlugin, EtherfuseClient, AlfredPayClient, BlindPayClient } from "../index";

function makeAgent(apiKeys: Record<string, string> = {}) {
  const wallet = new KeypairWallet(Keypair.random().secret());
  return new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
    apiKeys,
    kvStore: new InMemoryKVStore(),
  }).use(AnchorPlugin);
}

describe("AnchorPlugin", () => {
  it("registers eight actions", () => {
    const agent = makeAgent();
    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      [
        "ANCHOR_CREATE_CUSTOMER",
        "ANCHOR_CREATE_OFFRAMP",
        "ANCHOR_CREATE_ONRAMP",
        "ANCHOR_GET_KYC_URL",
        "ANCHOR_GET_OFFRAMP_STATUS",
        "ANCHOR_GET_ONRAMP_STATUS",
        "ANCHOR_GET_QUOTE",
        "ANCHOR_SIMULATE_FIAT_RECEIVED",
      ].sort(),
    );
  });

  it("ANCHOR_CREATE_CUSTOMER raises API_KEY_MISSING when etherfuse key is unset", async () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "ANCHOR_CREATE_CUSTOMER")!;
    await expect(
      action.handler(agent, {
        provider: "etherfuse",
        email: "user@example.com",
        country: "MX",
      }),
    ).rejects.toThrowError(/API key missing/);
  });

  it("ANCHOR_CREATE_CUSTOMER raises for AlfredPay when both apiKey and apiSecret aren't set", async () => {
    const agent = makeAgent({ alfredpay: "key-only" });
    const action = agent.actions.find((a) => a.name === "ANCHOR_CREATE_CUSTOMER")!;
    await expect(
      action.handler(agent, { provider: "alfredpay", email: "u@x.com", country: "MX" }),
    ).rejects.toThrowError(/AlfredPay creds missing/);
  });

  it("ANCHOR_CREATE_CUSTOMER raises for BlindPay when instanceId isn't set", async () => {
    const agent = makeAgent({ blindpay: "key-only" });
    const action = agent.actions.find((a) => a.name === "ANCHOR_CREATE_CUSTOMER")!;
    await expect(
      action.handler(agent, { provider: "blindpay", email: "u@x.com", country: "MX" }),
    ).rejects.toThrowError(/BlindPay creds missing/);
  });

  it("ANCHOR_CREATE_CUSTOMER schema accepts all three providers", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "ANCHOR_CREATE_CUSTOMER")!;
    for (const provider of ["etherfuse", "alfredpay", "blindpay"] as const) {
      expect(action.schema.safeParse({ provider, email: "u@x.com" }).success).toBe(true);
    }
    expect(
      action.schema.safeParse({ provider: "bogus", email: "u@x.com" }).success,
    ).toBe(false);
  });

  it("ANCHOR_CREATE_ONRAMP raises BANK_ACCOUNT_ID_MISSING when no IDs are persisted yet", async () => {
    const agent = makeAgent({ etherfuse: "test-key" });
    const action = agent.actions.find((a) => a.name === "ANCHOR_CREATE_ONRAMP")!;
    await expect(
      action.handler(agent, {
        provider: "etherfuse",
        customerId: "c1",
        quoteId: "q1",
      }),
    ).rejects.toThrowError(/bankAccountId not found/);
  });

  // ---------------------------------------------------------------------------
  // Network selector
  // ---------------------------------------------------------------------------

  describe("network selector", () => {
    it("Etherfuse defaults to testnet sandbox URL", () => {
      const c = new EtherfuseClient({ apiKey: "x" });
      expect(c.network).toBe("testnet");
      // baseUrl is private but reachable through a probing call; assert via a
      // request that fetch throws to *that* host. Easier: test the resolution
      // by reading the URL the simulate call would hit. Trust the constructor.
      expect((c as unknown as { baseUrl: string }).baseUrl).toBe(
        "https://api.sand.etherfuse.com",
      );
    });

    it("Etherfuse mainnet uses production URL", () => {
      const c = new EtherfuseClient({ apiKey: "x", network: "mainnet" });
      expect(c.network).toBe("mainnet");
      expect((c as unknown as { baseUrl: string }).baseUrl).toBe(
        "https://api.etherfuse.com",
      );
    });

    it("Etherfuse explicit baseUrl overrides network mapping", () => {
      const c = new EtherfuseClient({
        apiKey: "x",
        network: "mainnet",
        baseUrl: "https://custom.example.com",
      });
      expect((c as unknown as { baseUrl: string }).baseUrl).toBe(
        "https://custom.example.com",
      );
    });

    it("AlfredPay defaults to testnet (penny-api-restricted-dev)", () => {
      const c = new AlfredPayClient({ apiKey: "k", apiSecret: "s" });
      expect(c.network).toBe("testnet");
      expect((c as unknown as { baseUrl: string }).baseUrl).toBe(
        "https://penny-api-restricted-dev.alfredpay.io/api/v1/third-party-service/penny",
      );
    });

    it("AlfredPay mainnet uses .app production host (not .io)", () => {
      const c = new AlfredPayClient({ apiKey: "k", apiSecret: "s", network: "mainnet" });
      expect((c as unknown as { baseUrl: string }).baseUrl).toBe(
        "https://api-service-co.alfredpay.app/api/v1/third-party-service/penny",
      );
    });

    it("BlindPay translates testnet → stellar_testnet", () => {
      const c = new BlindPayClient({ apiKey: "k", instanceId: "in_x", network: "testnet" });
      expect(c.network).toBe("testnet");
      expect(c.blindpayNetwork).toBe("stellar_testnet");
    });

    it("BlindPay translates mainnet → bare 'stellar' (NOT stellar_mainnet)", () => {
      const c = new BlindPayClient({ apiKey: "k", instanceId: "in_x", network: "mainnet" });
      expect(c.network).toBe("mainnet");
      expect(c.blindpayNetwork).toBe("stellar");
    });

    it("BlindPay defaults to testnet → stellar_testnet", () => {
      const c = new BlindPayClient({ apiKey: "k", instanceId: "in_x" });
      expect(c.blindpayNetwork).toBe("stellar_testnet");
    });

    it("BlindPay uses same host for both networks", () => {
      const t = new BlindPayClient({ apiKey: "k", instanceId: "in_x", network: "testnet" });
      const m = new BlindPayClient({ apiKey: "k", instanceId: "in_x", network: "mainnet" });
      expect((t as unknown as { baseUrl: string }).baseUrl).toBe(
        "https://api.blindpay.com",
      );
      expect((m as unknown as { baseUrl: string }).baseUrl).toBe(
        "https://api.blindpay.com",
      );
    });

    it("getClient threads etherfuseNetwork from apiKeys to client", async () => {
      const agent = makeAgent({ etherfuse: "key", etherfuseNetwork: "mainnet" });
      const action = agent.actions.find((a) => a.name === "ANCHOR_SIMULATE_FIAT_RECEIVED")!;
      // Mainnet should refuse simulateFiatReceived with SANDBOX_ONLY before
      // any network call happens, proving the network was threaded through.
      await expect(
        action.handler(agent, { provider: "etherfuse", orderId: "o1" }),
      ).rejects.toThrowError(/sandbox-only/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Sandbox-only simulate-fiat-received
  // ---------------------------------------------------------------------------

  describe("ANCHOR_SIMULATE_FIAT_RECEIVED", () => {
    it("rejects mainnet with SANDBOX_ONLY", async () => {
      const agent = makeAgent({ etherfuse: "key", etherfuseNetwork: "mainnet" });
      const action = agent.actions.find((a) => a.name === "ANCHOR_SIMULATE_FIAT_RECEIVED")!;
      await expect(
        action.handler(agent, { provider: "etherfuse", orderId: "abc" }),
      ).rejects.toMatchObject({ code: "SANDBOX_ONLY" });
    });

    it("schema rejects non-etherfuse providers", () => {
      const agent = makeAgent();
      const action = agent.actions.find((a) => a.name === "ANCHOR_SIMULATE_FIAT_RECEIVED")!;
      expect(action.schema.safeParse({ provider: "alfredpay", orderId: "x" }).success).toBe(false);
      expect(action.schema.safeParse({ provider: "blindpay", orderId: "x" }).success).toBe(false);
      expect(action.schema.safeParse({ provider: "etherfuse", orderId: "x" }).success).toBe(true);
    });

    it("requires API key like other actions", async () => {
      const agent = makeAgent();
      const action = agent.actions.find((a) => a.name === "ANCHOR_SIMULATE_FIAT_RECEIVED")!;
      await expect(
        action.handler(agent, { provider: "etherfuse", orderId: "x" }),
      ).rejects.toThrowError(/API key missing/);
    });
  });

  // ---------------------------------------------------------------------------
  // BlindPay v0.1 limitation surfaces clearly
  // ---------------------------------------------------------------------------

  it("BlindPay createCustomer throws NOT_IMPLEMENTED_v01", async () => {
    const c = new BlindPayClient({ apiKey: "k", instanceId: "in_x" });
    await expect(
      c.createCustomer({ email: "u@x.com", publicKey: "GAAA" }),
    ).rejects.toMatchObject({ code: "NOT_IMPLEMENTED_v01" });
  });
});
