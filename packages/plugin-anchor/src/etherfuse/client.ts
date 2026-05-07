import type {
  AnchorClient,
  Customer,
  CreateCustomerInput,
  CreateOffRampInput,
  CreateOnRampInput,
  GetQuoteInput,
  KycStatus,
  OffRampTransaction,
  OnRampTransaction,
  Quote,
} from "../types";

export type AnchorNetwork = "testnet" | "mainnet";

export interface EtherfuseConfig {
  apiKey: string;
  /** Optional override; when omitted the URL is derived from `network`. */
  baseUrl?: string;
  /**
   * Selects sandbox vs production base URL automatically. Default: `"testnet"`.
   * - testnet → `https://api.sand.etherfuse.com`
   * - mainnet → `https://api.etherfuse.com`
   */
  network?: AnchorNetwork;
  /** Blockchain identifier sent to Etherfuse. Defaults to `"stellar"`. */
  blockchain?: string;
  // Persistence callback for customer/bank-account ids — REQUIRED for production.
  // Without this, ids regenerate per session and Etherfuse will refuse subsequent quotes.
  // (See `briwylde08/stellar-hackathon-faq` "Bank Account ID Issue" for the gotcha.)
  storage?: {
    getIds(stellarAddress: string): Promise<{ customerId: string; bankAccountId: string } | null>;
    saveIds(
      stellarAddress: string,
      ids: { customerId: string; bankAccountId: string },
    ): Promise<void>;
  };
}

const ETHERFUSE_BASE_URLS: Record<AnchorNetwork, string> = {
  testnet: "https://api.sand.etherfuse.com",
  mainnet: "https://api.etherfuse.com",
};

/**
 * Etherfuse anchor client.
 *
 * Auth header: `Authorization: <api-key>` — no `Bearer` prefix. Differs from
 * DeFindex (`Bearer`) and Trustless Work (`x-api-key:`).
 *
 * Network selection: `config.network` ("testnet" | "mainnet"). An explicit
 * `config.baseUrl` always overrides the derived value.
 *
 * Sandbox order progression: orders do NOT auto-progress in sandbox. To simulate
 * fiat arrival, POST to `/ramp/order/fiat_received` (see {@link simulateFiatReceived}).
 *
 * Endpoint paths follow the canonical Etherfuse API (regional-starter-pack
 * `feat/brazil` reference):
 *  - `POST /ramp/onboarding-url` — create customer / generate KYC URL
 *  - `GET  /ramp/customer/{id}`  — fetch customer
 *  - `GET  /ramp/customer/{id}/kyc/{publicKey}` — KYC status
 *  - `POST /ramp/quote` — quote
 *  - `POST /ramp/order` — create on-ramp / off-ramp (response wrapped in `onramp`/`offramp`)
 *  - `GET  /ramp/order/{id}` — fetch order
 *  - `POST /ramp/order/fiat_received` — sandbox-only fiat simulation
 */
export class EtherfuseClient implements AnchorClient {
  readonly name = "etherfuse";
  readonly network: AnchorNetwork;
  private apiKey: string;
  private baseUrl: string;
  private blockchain: string;
  private storage?: EtherfuseConfig["storage"];

  constructor(config: EtherfuseConfig) {
    this.apiKey = config.apiKey;
    this.network = config.network ?? "testnet";
    this.baseUrl = config.baseUrl ?? ETHERFUSE_BASE_URLS[this.network];
    this.blockchain = config.blockchain ?? "stellar";
    this.storage = config.storage;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = {
      Authorization: this.apiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    } as Record<string, string>;
    const resp = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const text = await resp.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = text;
    }
    if (!resp.ok) {
      const err = new Error(
        `Etherfuse ${path} failed: ${resp.status} ${typeof body === "string" ? body : JSON.stringify(body)}`,
      );
      (err as Error & { code: string; status: number }).code = "ETHERFUSE_API_ERROR";
      (err as Error & { code: string; status: number }).status = resp.status;
      throw err;
    }
    return body as T;
  }

  private mapKycStatus(status: string | undefined): KycStatus {
    const map: Record<string, KycStatus> = {
      not_started: "not_started",
      proposed: "pending",
      approved: "approved",
      approved_chain_deploying: "approved",
      rejected: "rejected",
    };
    return map[status ?? ""] ?? "not_started";
  }

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    // Look for existing ids first — Etherfuse binds them to the user permanently.
    if (this.storage) {
      const existing = await this.storage.getIds(input.publicKey);
      if (existing) {
        const customer = await this.getCustomer(existing.customerId);
        if (customer) {
          return { ...customer, bankAccountId: customer.bankAccountId ?? existing.bankAccountId };
        }
      }
    }

    // Generate stable IDs in OUR app and pass them to Etherfuse.
    const ids = {
      customerId: crypto.randomUUID(),
      bankAccountId: crypto.randomUUID(),
    };
    if (this.storage) await this.storage.saveIds(input.publicKey, ids);

    // Etherfuse onboarding endpoint — also returns a presigned URL for KYC.
    await this.request<{ presigned_url?: string }>("/ramp/onboarding-url", {
      method: "POST",
      body: JSON.stringify({
        customerId: ids.customerId,
        bankAccountId: ids.bankAccountId,
        publicKey: input.publicKey,
        blockchain: this.blockchain,
      }),
    });

    return {
      id: ids.customerId,
      email: input.email,
      kycStatus: "not_started",
      bankAccountId: ids.bankAccountId,
      country: input.country,
    };
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    try {
      const data = await this.request<{
        customerId: string;
        createdAt?: string;
        updatedAt?: string;
      }>(`/ramp/customer/${customerId}`);
      return {
        id: data.customerId ?? customerId,
        // Etherfuse customer endpoint does not return email; KYC status requires
        // a separate call with the wallet pubkey.
        kycStatus: "not_started",
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) return null;
      throw e;
    }
  }

  async getKycUrl(customerId: string, publicKey: string): Promise<string> {
    // Etherfuse re-uses the onboarding endpoint to produce a fresh presigned URL.
    const bankAccountId = (await this.storage?.getIds(publicKey))?.bankAccountId ?? crypto.randomUUID();
    const data = await this.request<{ presigned_url: string }>("/ramp/onboarding-url", {
      method: "POST",
      body: JSON.stringify({
        customerId,
        bankAccountId,
        publicKey,
        blockchain: this.blockchain,
      }),
    });
    return data.presigned_url;
  }

  async getQuote(input: GetQuoteInput): Promise<Quote> {
    const quoteId = crypto.randomUUID();
    // Direction: if either currency includes a `:` (CODE:ISSUER) treat as offramp,
    // else default to onramp. Asset code resolution is intentionally simplified —
    // callers must pass `CODE:ISSUER` for crypto assets.
    const sourceAsset = input.fromCurrency;
    const targetAsset = input.toCurrency;
    const type = sourceAsset.includes(":") ? "offramp" : "onramp";

    const data = await this.request<{
      quoteId: string;
      sourceAmount: string;
      destinationAmount?: string;
      destinationAmountAfterFee?: string;
      exchangeRate?: string;
      feeAmount?: string;
      expiresAt?: string;
      quoteAssets: { sourceAsset: string; targetAsset: string };
    }>("/ramp/quote", {
      method: "POST",
      body: JSON.stringify({
        quoteId,
        customerId: input.customerId ?? "",
        blockchain: this.blockchain,
        quoteAssets: { type, sourceAsset, targetAsset },
        sourceAmount: String(input.fromAmount),
      }),
    });

    return {
      id: data.quoteId,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      fromAmount: data.sourceAmount,
      toAmount: data.destinationAmountAfterFee ?? data.destinationAmount ?? "",
      exchangeRate: data.exchangeRate,
      fee: data.feeAmount,
      expiresAt: data.expiresAt,
    };
  }

  async createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction> {
    const orderId = crypto.randomUUID();
    const data = await this.request<{
      onramp: {
        orderId: string;
        depositClabe?: string;
        depositAmount?: string;
      };
    }>("/ramp/order", {
      method: "POST",
      body: JSON.stringify({
        orderId,
        bankAccountId: input.bankAccountId,
        publicKey: input.stellarAddress,
        quoteId: input.quoteId,
      }),
    });
    const { onramp } = data;
    return {
      id: onramp.orderId,
      status: "pending",
      fromAmount: onramp.depositAmount,
      paymentInstructions: onramp.depositClabe
        ? { type: "spei", clabe: onramp.depositClabe, amount: onramp.depositAmount }
        : undefined,
    };
  }

  async getOnRampTransaction(txId: string): Promise<OnRampTransaction | null> {
    try {
      const data = await this.request<{
        orderId: string;
        status: string;
        amountInFiat?: string;
        amountInTokens?: string;
        depositClabe?: string;
        confirmedTxSignature?: string;
      }>(`/ramp/order/${txId}`);
      return {
        id: data.orderId,
        status: this.mapOrderStatus(data.status),
        fromAmount: data.amountInFiat,
        toAmount: data.amountInTokens,
        paymentInstructions: data.depositClabe ? { type: "spei", clabe: data.depositClabe } : undefined,
        receiveTxHash: data.confirmedTxSignature,
      };
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) return null;
      throw e;
    }
  }

  async createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction> {
    const orderId = crypto.randomUUID();
    const data = await this.request<{
      offramp: {
        orderId: string;
        burnTransaction?: string;
      };
    }>("/ramp/order", {
      method: "POST",
      body: JSON.stringify({
        orderId,
        bankAccountId: input.bankAccountId,
        publicKey: input.stellarAddress,
        quoteId: input.quoteId,
      }),
    });
    const { offramp } = data;
    return {
      id: offramp.orderId,
      status: "pending",
      // The burn transaction XDR (when present) needs to be signed and submitted
      // by the consumer's wallet. Surfacing via `depositAddress` to keep the
      // public interface stable across providers.
      depositAddress: offramp.burnTransaction,
    };
  }

  async getOffRampTransaction(txId: string): Promise<OffRampTransaction | null> {
    try {
      const data = await this.request<{
        orderId: string;
        status: string;
        amountInTokens?: string;
        amountInFiat?: string;
        burnTransaction?: string;
      }>(`/ramp/order/${txId}`);
      return {
        id: data.orderId,
        status: this.mapOrderStatus(data.status),
        fromAmount: data.amountInTokens,
        toAmount: data.amountInFiat,
        depositAddress: data.burnTransaction,
      };
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) return null;
      throw e;
    }
  }

  /**
   * Sandbox-only: simulate a fiat payment received event for an on-ramp order.
   * Useful for hackathon demos and integration tests because sandbox orders
   * do NOT auto-progress when no real SPEI transfer is sent.
   *
   * @throws an Error with code `SANDBOX_ONLY` when this client is configured
   *   for the mainnet network.
   */
  async simulateFiatReceived(orderId: string): Promise<{ status: number }> {
    if (this.network === "mainnet") {
      const err = new Error(
        "Etherfuse simulateFiatReceived is sandbox-only. Switch the client to network=testnet to use it.",
      );
      (err as Error & { code: string }).code = "SANDBOX_ONLY";
      throw err;
    }
    const resp = await fetch(`${this.baseUrl}/ramp/order/fiat_received`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ orderId }),
    });
    return { status: resp.status };
  }

  private mapOrderStatus(status: string | undefined): string {
    const map: Record<string, string> = {
      created: "pending",
      funded: "processing",
      completed: "completed",
      failed: "failed",
      refunded: "refunded",
      canceled: "cancelled",
    };
    return map[status ?? ""] ?? "pending";
  }
}
