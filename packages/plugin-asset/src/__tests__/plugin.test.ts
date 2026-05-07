import { describe, it, expect, vi, afterEach } from "vitest";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "../index";
import { makeAsset, requireHorizon } from "../utils";

function makeAgent(opts: { withHorizon?: boolean; networkPassphrase?: string } = {}) {
  const wallet = new KeypairWallet(Keypair.random().secret());
  return new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: opts.withHorizon ? "https://horizon-testnet.stellar.org" : undefined,
    networkPassphrase: opts.networkPassphrase ?? Networks.TESTNET,
  }).use(StellarAssetPlugin);
}

describe("StellarAssetPlugin registration", () => {
  it("registers fifteen actions", () => {
    const agent = makeAgent();
    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      [
        "ACCOUNT_FRIENDBOT_FUND",
        "ASSET_CLAIMABLE_BALANCE_CLAIM",
        "ASSET_CLAIMABLE_BALANCE_CREATE",
        "ASSET_GET_BALANCE",
        "ASSET_ISSUE",
        "ASSET_PATH_PAYMENT_STRICT_RECEIVE",
        "ASSET_PATH_PAYMENT_STRICT_SEND",
        "ASSET_SET_OPTIONS",
        "ASSET_TRANSFER",
        "ASSET_TRUSTLINE_ADD",
        "ASSET_TRUSTLINE_REMOVE",
        "DEX_CANCEL_OFFER",
        "DEX_GET_ORDERBOOK",
        "DEX_MANAGE_BUY_OFFER",
        "DEX_MANAGE_SELL_OFFER",
      ].sort(),
    );
  });
});

describe("makeAsset", () => {
  it("returns native for XLM", () => {
    const a = makeAsset({ code: "XLM" });
    expect(a.isNative()).toBe(true);
  });

  it("returns native for the alias 'native'", () => {
    expect(makeAsset({ code: "native" }).isNative()).toBe(true);
  });

  it("returns a credit asset when issuer is provided", () => {
    const issuer = Keypair.random().publicKey();
    const a = makeAsset({ code: "USDC", issuer });
    expect(a.isNative()).toBe(false);
    expect(a.getCode()).toBe("USDC");
    expect(a.getIssuer()).toBe(issuer);
  });

  it("throws ISSUER_REQUIRED when a non-native asset is missing an issuer", () => {
    expect(() => makeAsset({ code: "USDC" })).toThrowError(/issuer/i);
  });
});

describe("requireHorizon", () => {
  it("throws HORIZON_NOT_CONFIGURED when horizonUrl is unset", () => {
    const agent = makeAgent();
    expect(() => requireHorizon(agent)).toThrowError(/horizonUrl/);
  });

  it("returns the Horizon server when configured", () => {
    const agent = makeAgent({ withHorizon: true });
    expect(requireHorizon(agent)).toBe(agent.horizonServer);
  });
});

describe("schema validation", () => {
  it("ASSET_TRANSFER rejects bad input", () => {
    const agent = makeAgent({ withHorizon: true });
    const transfer = agent.actions.find((a) => a.name === "ASSET_TRANSFER")!;
    expect(transfer.schema.safeParse({}).success).toBe(false);
    expect(
      transfer.schema.safeParse({
        destination: "G...",
        assetCode: "XLM",
        amount: "1",
      }).success,
    ).toBe(true);
  });

  it("ASSET_PATH_PAYMENT_STRICT_RECEIVE accepts complete input and rejects empty", () => {
    const agent = makeAgent({ withHorizon: true });
    const action = agent.actions.find((a) => a.name === "ASSET_PATH_PAYMENT_STRICT_RECEIVE")!;
    expect(action.schema.safeParse({}).success).toBe(false);
    const issuer = Keypair.random().publicKey();
    const parsed = action.schema.safeParse({
      destination: "G...",
      sendAsset: { code: "XLM" },
      sendMax: "120",
      destAsset: { code: "USDC", issuer },
      destAmount: "10",
    });
    expect(parsed.success).toBe(true);
  });

  it("DEX_MANAGE_SELL_OFFER defaults offerId to '0' for new offers", () => {
    const agent = makeAgent({ withHorizon: true });
    const action = agent.actions.find((a) => a.name === "DEX_MANAGE_SELL_OFFER")!;
    const issuer = Keypair.random().publicKey();
    const parsed = action.schema.safeParse({
      selling: { code: "XLM" },
      buying: { code: "USDC", issuer },
      amount: "100",
      price: "0.1",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.offerId).toBe("0");
    }
  });

  it("DEX_MANAGE_BUY_OFFER requires buyAmount", () => {
    const agent = makeAgent({ withHorizon: true });
    const action = agent.actions.find((a) => a.name === "DEX_MANAGE_BUY_OFFER")!;
    const issuer = Keypair.random().publicKey();
    expect(
      action.schema.safeParse({
        selling: { code: "XLM" },
        buying: { code: "USDC", issuer },
        price: "10",
      }).success,
    ).toBe(false);
    expect(
      action.schema.safeParse({
        selling: { code: "XLM" },
        buying: { code: "USDC", issuer },
        buyAmount: "10",
        price: "10",
      }).success,
    ).toBe(true);
  });

  it("DEX_CANCEL_OFFER requires offerId", () => {
    const agent = makeAgent({ withHorizon: true });
    const action = agent.actions.find((a) => a.name === "DEX_CANCEL_OFFER")!;
    const issuer = Keypair.random().publicKey();
    expect(
      action.schema.safeParse({
        selling: { code: "XLM" },
        buying: { code: "USDC", issuer },
      }).success,
    ).toBe(false);
    expect(
      action.schema.safeParse({
        selling: { code: "XLM" },
        buying: { code: "USDC", issuer },
        offerId: "12345",
      }).success,
    ).toBe(true);
  });

  it("DEX_GET_ORDERBOOK accepts default limit", () => {
    const agent = makeAgent({ withHorizon: true });
    const action = agent.actions.find((a) => a.name === "DEX_GET_ORDERBOOK")!;
    const issuer = Keypair.random().publicKey();
    const parsed = action.schema.safeParse({
      selling: { code: "XLM" },
      buying: { code: "USDC", issuer },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(20);
    }
  });

  it("ACCOUNT_FRIENDBOT_FUND accepts empty input", () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "ACCOUNT_FRIENDBOT_FUND")!;
    expect(action.schema.safeParse({}).success).toBe(true);
    expect(action.schema.safeParse({ account: "GABCDEF" }).success).toBe(true);
  });
});

describe("ACCOUNT_FRIENDBOT_FUND handler", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns funded=true with hash and ledger on a 200 response", async () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "ACCOUNT_FRIENDBOT_FUND")!;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ hash: "abc", ledger: 99 }),
      text: async () => "",
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await action.handler(agent, {});
    expect(result).toEqual({ hash: "abc", ledger: 99, funded: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(agent.wallet.publicKey)}`,
      { method: "POST" },
    );
  });

  it("throws FRIENDBOT_FAILED on a non-2xx response", async () => {
    const agent = makeAgent();
    const action = agent.actions.find((a) => a.name === "ACCOUNT_FRIENDBOT_FUND")!;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({}),
      text: async () => "already funded",
    }) as unknown as typeof fetch;

    await expect(action.handler(agent, {})).rejects.toMatchObject({ code: "FRIENDBOT_FAILED" });
  });

  it("warns when networkPassphrase is PUBLIC", async () => {
    const agent = makeAgent({ networkPassphrase: Networks.PUBLIC });
    const action = agent.actions.find((a) => a.name === "ACCOUNT_FRIENDBOT_FUND")!;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ hash: "h", ledger: 1 }),
      text: async () => "",
    }) as unknown as typeof fetch;

    await action.handler(agent, {});
    expect(warnSpy).toHaveBeenCalled();
  });
});
