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

/**
 * BlindPay's underlying network identifier values. Note production is the bare
 * string `"stellar"`, NOT `"stellar_mainnet"`.
 */
export type BlindPayNetwork = "stellar_testnet" | "stellar";

const BLINDPAY_NETWORK_MAP: Record<AnchorNetwork, BlindPayNetwork> = {
  testnet: "stellar_testnet",
  mainnet: "stellar",
};

export interface BlindPayConfig {
  apiKey: string;
  instanceId: string;
  /** Optional override; BlindPay uses the same host for both networks. */
  baseUrl?: string;
  /**
   * Generic network selector ("testnet" | "mainnet"). Internally translated to
   * BlindPay's `stellar_testnet` / `stellar` network parameter. Default `"testnet"`.
   */
  network?: AnchorNetwork;
}

const DEFAULT_BASE_URL = "https://api.blindpay.com";

/**
 * BlindPay anchor client (Mexico SPEI ↔ USDB).
 *
 * Quirks vs Etherfuse and AlfredPay (encoded as gotchas):
 *  - Auth header: `Authorization: Bearer <api-key>` (Bearer; like DeFindex)
 *  - Per-instance API paths: `/v1/instances/{instanceId}/...`
 *  - "External" instance paths (ToS, e.g. `/v1/e/instances/{instanceId}/tos`)
 *    use a different `/e/` prefix.
 *  - Amounts in cents (integers); we convert decimal → cents on input,
 *    cents → decimal on output, so callers can use familiar decimal strings.
 *  - ToS acceptance redirect required before receiver creation.
 *  - Off-ramp settlement is 2-step: `POST /payouts/stellar/authorize` returns
 *    XDR for the consumer to sign + submit. After signing, call
 *    `POST /payouts/stellar` (or `confirmPayout` here) with the signed XDR.
 *
 * v0.1 limitation: full ToS + receiver creation flow is NOT implemented; that
 * requires multi-step KYC submission. {@link createCustomer} returns a stub
 * and throws `NOT_IMPLEMENTED_v01` if the receiver-creation path is invoked
 * without a pre-existing receiver. See regional-starter-pack `feat/brazil` for
 * the full flow.
 */
export class BlindPayClient implements AnchorClient {
  readonly name = "blindpay";
  readonly network: AnchorNetwork;
  /** Internal BlindPay network value (e.g. `"stellar_testnet"` or `"stellar"`). */
  readonly blindpayNetwork: BlindPayNetwork;
  private apiKey: string;
  private instanceId: string;
  private baseUrl: string;

  constructor(config: BlindPayConfig) {
    this.apiKey = config.apiKey;
    this.instanceId = config.instanceId;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.network = config.network ?? "testnet";
    this.blindpayNetwork = BLINDPAY_NETWORK_MAP[this.network];
  }

  /** Build an instance-scoped path: `/v1/instances/{id}{suffix}`. */
  private path(suffix: string): string {
    return `/v1/instances/${this.instanceId}${suffix}`;
  }

  /** Build an external instance path: `/v1/e/instances/{id}{suffix}` (used for ToS). */
  private externalPath(suffix: string): string {
    return `/v1/e/instances/${this.instanceId}${suffix}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
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
        `BlindPay ${path} failed: ${resp.status} ${typeof body === "string" ? body : JSON.stringify(body)}`,
      );
      (err as Error & { code: string; status: number }).code = "BLINDPAY_API_ERROR";
      (err as Error & { code: string; status: number }).status = resp.status;
      throw err;
    }
    return body as T;
  }

  private toCents(decimal: string): number {
    const n = parseFloat(decimal);
    return Math.round(n * 100);
  }

  private fromCents(cents: number | string | undefined): string | undefined {
    if (cents === undefined) return undefined;
    const n = typeof cents === "string" ? parseFloat(cents) : cents;
    return (n / 100).toFixed(2);
  }

  private mapReceiverStatus(s: string | undefined): KycStatus {
    const map: Record<string, KycStatus> = {
      verifying: "pending",
      approved: "approved",
      rejected: "rejected",
    };
    return map[s ?? ""] ?? "not_started";
  }

  private mapStatus(s: string | undefined): string {
    const map: Record<string, string> = {
      pending: "pending",
      waiting_for_payment: "pending",
      processing: "processing",
      completed: "completed",
      failed: "failed",
      refunded: "cancelled",
    };
    return map[(s ?? "").toLowerCase()] ?? "pending";
  }

  /**
   * v0.1 limitation: BlindPay receiver creation is a multi-step ToS + KYC flow
   * that requires a `tos_id` from a browser-side ToS acceptance redirect, plus
   * a complete KYC submission (PII, ID document URLs, proof of address, etc.).
   * That cannot be done in a single server-side call. Callers must orchestrate
   * the ToS flow externally and POST the receiver themselves.
   *
   * To keep the AnchorClient contract honest we throw `NOT_IMPLEMENTED_v01`
   * with a pointer to the canonical reference. {@link generateTosUrl} is
   * exposed below to start the flow.
   */
  async createCustomer(_input: CreateCustomerInput): Promise<Customer> {
    const err = new Error(
      "BlindPay receiver creation requires a ToS-acceptance redirect (`tos_id`) and a full KYC submission. " +
        "Use `generateTosUrl()` to start the flow, complete it in a browser, then POST the receiver " +
        "via your own integration. See regional-starter-pack `feat/brazil` for the canonical flow.",
    );
    (err as Error & { code: string }).code = "NOT_IMPLEMENTED_v01";
    throw err;
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    try {
      const data = await this.request<{
        id: string;
        email?: string;
        kyc_status?: string;
        created_at?: string;
        updated_at?: string;
      }>(this.path(`/receivers/${customerId}`));
      return {
        id: data.id,
        email: data.email,
        kycStatus: this.mapReceiverStatus(data.kyc_status),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) return null;
      throw e;
    }
  }

  /**
   * For BlindPay the "KYC URL" is a ToS acceptance URL that must be opened
   * in the user's browser. ToS acceptance returns a `tos_id` to the redirect
   * URL, which is then used during receiver creation.
   */
  async getKycUrl(_customerId: string): Promise<string> {
    return this.generateTosUrl();
  }

  /**
   * Generate a ToS URL via the external instance path
   * `POST /v1/e/instances/{instanceId}/tos`. Note the `/e/` prefix differs
   * from regular instance paths.
   */
  async generateTosUrl(redirectUrl?: string): Promise<string> {
    const data = await this.request<{ url: string }>(this.externalPath("/tos"), {
      method: "POST",
      body: JSON.stringify({ idempotency_key: crypto.randomUUID() }),
    });
    let url = data.url;
    if (redirectUrl) {
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}redirect_url=${encodeURIComponent(redirectUrl)}`;
    }
    return url;
  }

  async getQuote(input: GetQuoteInput): Promise<Quote> {
    const fiatCurrencies = ["MXN", "USD", "BRL", "ARS", "COP"];
    const isOnRamp = fiatCurrencies.includes(input.fromCurrency.toUpperCase());
    const amountCents = this.toCents(input.fromAmount);
    if (isOnRamp) {
      // Payin (on-ramp): /payin-quotes
      const data = await this.request<{
        id: string;
        sender_amount: number;
        receiver_amount: number;
        flat_fee?: number;
        partner_fee_amount?: number;
        billing_fee_amount?: number;
        blindpay_quotation?: number;
        commercial_quotation?: number;
        expires_at: string | number;
      }>(this.path("/payin-quotes"), {
        method: "POST",
        body: JSON.stringify({
          blockchain_wallet_id: input.customerId ?? "",
          currency_type: "sender",
          cover_fees: false,
          request_amount: amountCents,
          payment_method: "spei",
          token: input.toCurrency === "USDC" ? "USDC" : "USDB",
        }),
      });
      const totalFee = (data.flat_fee ?? 0) + (data.partner_fee_amount ?? 0) + (data.billing_fee_amount ?? 0);
      return {
        id: data.id,
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        fromAmount: this.fromCents(data.sender_amount) ?? input.fromAmount,
        toAmount: this.fromCents(data.receiver_amount) ?? "0",
        exchangeRate: String(data.blindpay_quotation ?? data.commercial_quotation ?? "0"),
        fee: this.fromCents(totalFee),
        expiresAt: new Date(data.expires_at).toISOString(),
      };
    }

    // Payout (off-ramp): /quotes
    const data = await this.request<{
      id: string;
      sender_amount: number;
      receiver_amount: number;
      flat_fee?: number;
      partner_fee_amount?: number;
      billing_fee_amount?: number;
      blindpay_quotation?: number;
      commercial_quotation?: number;
      expires_at: string | number;
    }>(this.path("/quotes"), {
      method: "POST",
      body: JSON.stringify({
        bank_account_id: input.customerId ?? "",
        currency_type: "sender",
        cover_fees: false,
        request_amount: amountCents,
        network: this.blindpayNetwork,
        token: input.fromCurrency === "USDC" ? "USDC" : "USDB",
      }),
    });
    const totalFee = (data.flat_fee ?? 0) + (data.partner_fee_amount ?? 0) + (data.billing_fee_amount ?? 0);
    return {
      id: data.id,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      fromAmount: this.fromCents(data.sender_amount) ?? input.fromAmount,
      toAmount: this.fromCents(data.receiver_amount) ?? "0",
      exchangeRate: String(data.blindpay_quotation ?? data.commercial_quotation ?? "0"),
      fee: this.fromCents(totalFee),
      expiresAt: new Date(data.expires_at).toISOString(),
    };
  }

  async createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction> {
    // BlindPay's payin endpoint is `/payins/evm`. The reference uses the same
    // path for Stellar-bound payins because the on-ramp is a fiat receipt; the
    // chain comes from the underlying blockchain wallet associated with the quote.
    const data = await this.request<{
      id: string;
      status?: string;
      sender_amount?: number;
      receiver_amount?: number;
      currency?: string;
      token?: string;
      clabe?: string;
      memo_code?: string;
      tracking_complete?: { transaction_hash?: string };
      created_at?: string;
      updated_at?: string;
    }>(this.path("/payins/evm"), {
      method: "POST",
      body: JSON.stringify({ payin_quote_id: input.quoteId }),
    });
    return {
      id: data.id,
      status: this.mapStatus(data.status),
      fromAmount: this.fromCents(data.sender_amount),
      toAmount: this.fromCents(data.receiver_amount),
      paymentInstructions: data.clabe
        ? {
            type: "spei",
            clabe: data.clabe,
            reference: data.memo_code ?? "",
            amount: this.fromCents(data.sender_amount),
            currency: data.currency ?? "MXN",
          }
        : undefined,
      receiveTxHash: data.tracking_complete?.transaction_hash,
      createdAt: data.created_at,
    };
  }

  async getOnRampTransaction(txId: string): Promise<OnRampTransaction | null> {
    try {
      const data = await this.request<{
        id: string;
        status?: string;
        sender_amount?: number;
        receiver_amount?: number;
        clabe?: string;
        memo_code?: string;
        currency?: string;
        tracking_complete?: { transaction_hash?: string };
        created_at?: string;
      }>(this.path(`/payins/${txId}`));
      return {
        id: data.id,
        status: this.mapStatus(data.status),
        fromAmount: this.fromCents(data.sender_amount),
        toAmount: this.fromCents(data.receiver_amount),
        paymentInstructions: data.clabe
          ? {
              type: "spei",
              clabe: data.clabe,
              reference: data.memo_code ?? "",
              amount: this.fromCents(data.sender_amount),
              currency: data.currency ?? "MXN",
            }
          : undefined,
        receiveTxHash: data.tracking_complete?.transaction_hash,
        createdAt: data.created_at,
      };
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) return null;
      throw e;
    }
  }

  async createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction> {
    // Stellar-specific authorize path. Returns an XDR hash for the consumer to
    // sign with their wallet. After signing, call `confirmPayout` (which posts
    // to `/payouts/stellar` per the reference's `submitSignedPayout`).
    const data = await this.request<{
      transaction_hash?: string;
      transaction_xdr?: string;
    }>(this.path("/payouts/stellar/authorize"), {
      method: "POST",
      body: JSON.stringify({
        quote_id: input.quoteId,
        sender_wallet_address: input.stellarAddress,
      }),
    });
    const xdr = data.transaction_hash ?? data.transaction_xdr;
    if (xdr) {
      // Caller must sign the XDR with the agent's wallet, submit, then call
      // confirmPayout(quoteId, signedXdr, senderAddress).
      return {
        id: input.quoteId,
        status: "pending_signature",
        depositAddress: xdr,
      };
    }
    return { id: input.quoteId, status: "pending" };
  }

  async getOffRampTransaction(txId: string): Promise<OffRampTransaction | null> {
    try {
      const data = await this.request<{
        id: string;
        status?: string;
        sender_amount?: number;
        receiver_amount?: number;
        sender_currency?: string;
        receiver_currency?: string;
        sender_wallet_address?: string;
        blockchain_tx_hash?: string;
        created_at?: string;
      }>(this.path(`/payouts/${txId}`));
      return {
        id: data.id,
        status: this.mapStatus(data.status),
        fromAmount: this.fromCents(data.sender_amount),
        toAmount: this.fromCents(data.receiver_amount),
        receiveAccount: data.sender_wallet_address,
        createdAt: data.created_at,
      };
    } catch (e) {
      if ((e as Error & { status?: number }).status === 404) return null;
      throw e;
    }
  }

  /**
   * Step 2 of off-ramp: after the consumer has signed the authorize-XDR via
   * their Stellar wallet, submit the signed XDR back to BlindPay. Internally
   * this hits `POST /v1/instances/{instanceId}/payouts/stellar`.
   */
  async confirmPayout(
    quoteId: string,
    signedTransaction: string,
    senderWalletAddress: string,
  ): Promise<OffRampTransaction> {
    const data = await this.request<{
      id: string;
      status?: string;
      sender_amount?: number;
      receiver_amount?: number;
    }>(this.path("/payouts/stellar"), {
      method: "POST",
      body: JSON.stringify({
        quote_id: quoteId,
        signed_transaction: signedTransaction,
        sender_wallet_address: senderWalletAddress,
      }),
    });
    return {
      id: data.id,
      status: this.mapStatus(data.status),
      fromAmount: this.fromCents(data.sender_amount),
      toAmount: this.fromCents(data.receiver_amount),
    };
  }
}
