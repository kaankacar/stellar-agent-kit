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
import type { AnchorNetwork } from "../etherfuse/client";

export interface AlfredPayConfig {
  apiKey: string;
  apiSecret: string;
  /** Optional override; when omitted the URL is derived from `network`. */
  baseUrl?: string;
  /**
   * Selects sandbox vs production base URL automatically. Default: `"testnet"`.
   * - testnet → `https://penny-api-restricted-dev.alfredpay.io/api/v1/third-party-service/penny`
   * - mainnet → `https://api-service-co.alfredpay.app/api/v1/third-party-service/penny`
   *
   * Note the prod host uses `.app`, NOT `.io`.
   */
  network?: AnchorNetwork;
}

const ALFREDPAY_BASE_URLS: Record<AnchorNetwork, string> = {
  testnet: "https://penny-api-restricted-dev.alfredpay.io/api/v1/third-party-service/penny",
  mainnet: "https://api-service-co.alfredpay.app/api/v1/third-party-service/penny",
};

/**
 * AlfredPay anchor client (Mexico SPEI ↔ USDC, Brazil PIX ↔ USDC).
 *
 * Auth: dual-header `api-key` + `api-secret`. NOT Bearer. Differs from
 * Etherfuse (`Authorization: <key>` no Bearer) and DeFindex (`Bearer`).
 *
 * Endpoint paths follow the canonical AlfredPay API (regional-starter-pack
 * `feat/brazil` reference):
 *  - `POST /customers/create` — create customer
 *  - `GET  /customers/find/{email}/{country}` — lookup by email
 *  - `GET  /customers/{id}/kyc/{country}/url` — KYC iframe URL
 *  - `POST /quotes` — quote (chain hardcoded to `XLM`, payment method derived)
 *  - `POST /onramp` — create on-ramp; response is wrapped `{transaction, fiatPaymentInstructions}`
 *  - `GET  /onramp/{id}` — flat shape (NO `transaction` wrapper)
 *  - `POST /offramp` / `GET /offramp/{id}` — off-ramp
 */
export class AlfredPayClient implements AnchorClient {
  readonly name = "alfredpay";
  readonly network: AnchorNetwork;
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor(config: AlfredPayConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.network = config.network ?? "testnet";
    this.baseUrl = config.baseUrl ?? ALFREDPAY_BASE_URLS[this.network];
  }

  private getPaymentMethodType(fromCurrency: string, toCurrency: string): string {
    const fiat = fromCurrency === "USDC" ? toCurrency : fromCurrency;
    return fiat === "BRL" ? "PIX" : "SPEI";
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = {
      "Content-Type": "application/json",
      "api-key": this.apiKey,
      "api-secret": this.apiSecret,
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
        `AlfredPay ${path} failed: ${resp.status} ${typeof body === "string" ? body : JSON.stringify(body)}`,
      );
      (err as Error & { code: string; status: number }).code = "ALFREDPAY_API_ERROR";
      (err as Error & { code: string; status: number }).status = resp.status;
      throw err;
    }
    return body as T;
  }

  private mapStatus(s: string | undefined): string {
    const map: Record<string, string> = {
      CREATED: "pending",
      PENDING: "pending",
      PROCESSING: "processing",
      COMPLETED: "completed",
      FAILED: "failed",
      EXPIRED: "expired",
      CANCELLED: "cancelled",
    };
    return map[s ?? ""] ?? "pending";
  }

  private mapKycStatus(s: string | undefined): KycStatus {
    const raw = s?.toUpperCase();
    const map: Record<string, KycStatus> = {
      IN_REVIEW: "pending",
      COMPLETED: "approved",
      APPROVED: "approved",
      REJECTED: "rejected",
      UPDATE_REQUIRED: "update_required",
      FAILED: "rejected",
    };
    return map[raw ?? ""] ?? "not_started";
  }

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const data = await this.request<{
      customerId: string;
      createdAt?: string;
    }>("/customers/create", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        type: "INDIVIDUAL",
        country: input.country ?? "MX",
      }),
    });
    return {
      id: data.customerId,
      email: input.email,
      kycStatus: "not_started",
      country: input.country,
      createdAt: data.createdAt,
      updatedAt: data.createdAt,
    };
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    try {
      const data = await this.request<{
        customerId: string;
        statusKyc?: string;
        country?: string;
      }>(`/customers/${customerId}`);
      return {
        id: data.customerId,
        kycStatus: this.mapKycStatus(data.statusKyc),
        country: data.country,
      };
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) return null;
      throw e;
    }
  }

  /**
   * Look up a customer by email and country code. Useful for re-discovering
   * a previously created customer when only their email is known.
   * Path: `GET /customers/find/{email}/{country}`.
   */
  async findCustomerByEmail(email: string, country = "MX"): Promise<Customer | null> {
    try {
      const data = await this.request<{ customerId: string }>(
        `/customers/find/${encodeURIComponent(email)}/${country}`,
      );
      return {
        id: data.customerId,
        email,
        kycStatus: "not_started",
        country,
      };
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) return null;
      throw e;
    }
  }

  async getKycUrl(customerId: string, _publicKey: string, country = "MX"): Promise<string> {
    const data = await this.request<{ verification_url: string }>(
      `/customers/${customerId}/kyc/${country}/url`,
    );
    return data.verification_url;
  }

  async getQuote(input: GetQuoteInput): Promise<Quote> {
    const paymentMethodType = this.getPaymentMethodType(input.fromCurrency, input.toCurrency);
    const data = await this.request<{
      quoteId: string;
      fromCurrency: string;
      toCurrency: string;
      fromAmount: string;
      toAmount: string;
      rate?: string;
      fees?: Array<{ amount: string }>;
      expiration?: string;
    }>("/quotes", {
      method: "POST",
      body: JSON.stringify({
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        chain: "XLM",
        paymentMethodType,
        customerId: input.customerId ?? "",
        businessId: "",
        metadata: {},
        fromAmount: String(input.fromAmount),
      }),
    });
    const totalFee = (data.fees ?? [])
      .reduce((sum, f) => sum + parseFloat(f.amount || "0"), 0)
      .toFixed(2);
    return {
      id: data.quoteId,
      fromCurrency: data.fromCurrency,
      toCurrency: data.toCurrency,
      fromAmount: data.fromAmount,
      toAmount: data.toAmount,
      exchangeRate: data.rate,
      fee: totalFee,
      expiresAt: data.expiration,
    };
  }

  async createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction> {
    // POST /onramp returns wrapped { transaction, fiatPaymentInstructions } per reference.
    const data = await this.request<{
      transaction: {
        transactionId: string;
        status: string;
        fromAmount?: string;
        fromCurrency?: string;
        toAmount?: string;
        toCurrency?: string;
        depositAddress?: string;
        txHash?: string;
        createdAt?: string;
        updatedAt?: string;
      };
      fiatPaymentInstructions: {
        clabe?: string;
        bankName?: string;
        accountHolderName?: string;
        reference?: string;
      };
    }>("/onramp", {
      method: "POST",
      body: JSON.stringify({
        customerId: input.customerId,
        quoteId: input.quoteId,
        chain: "XLM",
        depositAddress: input.stellarAddress,
        memo: "",
        onrampTransactionRequiredFieldsJson: {},
      }),
    });
    return {
      id: data.transaction.transactionId,
      status: this.mapStatus(data.transaction.status),
      fromAmount: data.transaction.fromAmount,
      toAmount: data.transaction.toAmount,
      paymentInstructions: data.fiatPaymentInstructions as unknown as Record<string, unknown>,
      receiveTxHash: data.transaction.txHash,
      createdAt: data.transaction.createdAt,
    };
  }

  async getOnRampTransaction(txId: string): Promise<OnRampTransaction | null> {
    try {
      // GET /onramp/{id} returns a FLAT shape — no `transaction` wrapper.
      const data = await this.request<{
        transactionId: string;
        status: string;
        fromAmount?: string;
        toAmount?: string;
        txHash?: string;
        fiatPaymentInstructions?: Record<string, unknown>;
        createdAt?: string;
      }>(`/onramp/${txId}`);
      return {
        id: data.transactionId,
        status: this.mapStatus(data.status),
        fromAmount: data.fromAmount,
        toAmount: data.toAmount,
        paymentInstructions: data.fiatPaymentInstructions,
        receiveTxHash: data.txHash,
        createdAt: data.createdAt,
      };
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) return null;
      throw e;
    }
  }

  async createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction> {
    const data = await this.request<{
      transactionId: string;
      status: string;
      fromAmount?: string;
      toAmount?: string;
      depositAddress?: string;
      memo?: string;
      createdAt?: string;
    }>("/offramp", {
      method: "POST",
      body: JSON.stringify({
        customerId: input.customerId,
        quoteId: input.quoteId,
        fiatAccountId: input.bankAccountId,
        chain: "XLM",
        memo: "",
        originAddress: input.stellarAddress,
      }),
    });
    return {
      id: data.transactionId,
      status: this.mapStatus(data.status),
      fromAmount: data.fromAmount,
      toAmount: data.toAmount,
      depositAddress: data.depositAddress,
      createdAt: data.createdAt,
    };
  }

  async getOffRampTransaction(txId: string): Promise<OffRampTransaction | null> {
    try {
      const data = await this.request<{
        transactionId: string;
        status: string;
        fromAmount?: string;
        toAmount?: string;
        depositAddress?: string;
        createdAt?: string;
      }>(`/offramp/${txId}`);
      return {
        id: data.transactionId,
        status: this.mapStatus(data.status),
        fromAmount: data.fromAmount,
        toAmount: data.toAmount,
        depositAddress: data.depositAddress,
        createdAt: data.createdAt,
      };
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) return null;
      throw e;
    }
  }
}
