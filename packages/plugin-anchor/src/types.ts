/**
 * Minimal anchor interface — a slimmed-down adaptation of the framework-agnostic
 * `Anchor` interface in ElliotFriend/regional-starter-pack/src/lib/anchors/types.ts.
 *
 * Each anchor provider implements these methods. Actions dispatch to the
 * appropriate provider based on the `provider` discriminator.
 */
export type KycStatus = "pending" | "approved" | "rejected" | "not_started" | "update_required";

export interface Customer {
  id: string;
  email?: string;
  kycStatus: KycStatus;
  country?: string;
  bankAccountId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Quote {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
  toAmount: string;
  exchangeRate?: string;
  fee?: string;
  expiresAt?: string;
}

export interface OnRampTransaction {
  id: string;
  status: string;
  fromAmount?: string;
  toAmount?: string;
  paymentInstructions?: Record<string, unknown>;
  receiveTxHash?: string;
  createdAt?: string;
}

export interface OffRampTransaction {
  id: string;
  status: string;
  fromAmount?: string;
  toAmount?: string;
  depositAddress?: string;
  receiveAccount?: string;
  createdAt?: string;
}

export interface CreateCustomerInput {
  email: string;
  publicKey: string;
  country?: string;
}

export interface GetQuoteInput {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
  customerId?: string;
  stellarAddress?: string;
}

export interface CreateOnRampInput {
  customerId: string;
  quoteId: string;
  bankAccountId?: string;
  stellarAddress: string;
}

export interface CreateOffRampInput {
  customerId: string;
  quoteId: string;
  bankAccountId: string;
  stellarAddress: string;
}

export interface AnchorClient {
  readonly name: string;
  createCustomer(input: CreateCustomerInput): Promise<Customer>;
  getCustomer(customerId: string): Promise<Customer | null>;
  getKycUrl(customerId: string, publicKey: string): Promise<string>;
  getQuote(input: GetQuoteInput): Promise<Quote>;
  createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction>;
  getOnRampTransaction(txId: string): Promise<OnRampTransaction | null>;
  createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction>;
  getOffRampTransaction(txId: string): Promise<OffRampTransaction | null>;
}
