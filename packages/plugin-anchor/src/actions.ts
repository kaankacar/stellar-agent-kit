import { z } from "zod";
import {
  TransactionBuilder,
  type Transaction,
  type FeeBumpTransaction,
} from "@stellar/stellar-sdk";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";
import { pollTransaction } from "@stellar-agent-kit/core";
import { EtherfuseClient, type EtherfuseConfig, type AnchorNetwork } from "./etherfuse/client";
import { AlfredPayClient } from "./alfredpay/client";
import { BlindPayClient } from "./blindpay/client";
import type { AnchorClient } from "./types";

const PROVIDERS = ["etherfuse", "alfredpay", "blindpay"] as const;
type Provider = (typeof PROVIDERS)[number];

interface KvIds {
  customerId: string;
  bankAccountId: string;
}

function kvKey(provider: Provider, address: string) {
  return `anchor:${provider}:${address}:ids`;
}

/**
 * Resolve the network for a given provider, with this precedence:
 *   1. Per-provider override (e.g. `apiKeys.etherfuseNetwork`)
 *   2. Global anchor network (`apiKeys.anchorNetwork`)
 *   3. Default `"testnet"`
 *
 * Any value other than `"mainnet"` is treated as `"testnet"`.
 */
function resolveNetwork(
  apiKeys: Record<string, string | undefined>,
  perProviderKey: string,
): AnchorNetwork {
  const raw = apiKeys[perProviderKey] ?? apiKeys.anchorNetwork ?? "testnet";
  return raw === "mainnet" ? "mainnet" : "testnet";
}

async function getClient(agent: StellarAgentKit, provider: Provider): Promise<AnchorClient> {
  const apiKeys = agent.config.apiKeys ?? {};
  if (provider === "etherfuse") {
    const apiKey = apiKeys.etherfuse;
    if (!apiKey) {
      const err = new Error("Etherfuse API key missing. Set config.apiKeys.etherfuse.");
      (err as Error & { code: string }).code = "API_KEY_MISSING";
      throw err;
    }
    const cfg: EtherfuseConfig = {
      apiKey,
      baseUrl: apiKeys.etherfuseBaseUrl,
      network: resolveNetwork(apiKeys, "etherfuseNetwork"),
      storage: {
        getIds: (addr) => agent.kvStore.get<KvIds>(kvKey(provider, addr)),
        saveIds: (addr, ids) => agent.kvStore.set<KvIds>(kvKey(provider, addr), ids),
      },
    };
    return new EtherfuseClient(cfg);
  }
  if (provider === "alfredpay") {
    const apiKey = apiKeys.alfredpay;
    const apiSecret = apiKeys.alfredpaySecret;
    if (!apiKey || !apiSecret) {
      const err = new Error(
        "AlfredPay creds missing. Set config.apiKeys.alfredpay AND config.apiKeys.alfredpaySecret.",
      );
      (err as Error & { code: string }).code = "API_KEY_MISSING";
      throw err;
    }
    return new AlfredPayClient({
      apiKey,
      apiSecret,
      baseUrl: apiKeys.alfredpayBaseUrl,
      network: resolveNetwork(apiKeys, "alfredpayNetwork"),
    });
  }
  if (provider === "blindpay") {
    const apiKey = apiKeys.blindpay;
    const instanceId = apiKeys.blindpayInstanceId;
    if (!apiKey || !instanceId) {
      const err = new Error(
        "BlindPay creds missing. Set config.apiKeys.blindpay AND config.apiKeys.blindpayInstanceId.",
      );
      (err as Error & { code: string }).code = "API_KEY_MISSING";
      throw err;
    }
    return new BlindPayClient({
      apiKey,
      instanceId,
      baseUrl: apiKeys.blindpayBaseUrl,
      network: resolveNetwork(apiKeys, "blindpayNetwork"),
    });
  }
  const err = new Error(`Unknown anchor provider: ${provider}`);
  (err as Error & { code: string }).code = "UNKNOWN_PROVIDER";
  throw err;
}

const providerSchema = z.enum(PROVIDERS).default("etherfuse");

export const anchorCreateCustomer: Action = {
  name: "ANCHOR_CREATE_CUSTOMER",
  similes: ["onboard customer", "register with anchor", "create anchor account"],
  description:
    "Create or look up a customer record at an anchor (Etherfuse only in v0.1). Persists customer/bank-account IDs in the agent's KV store, keyed by Stellar wallet address — required because Etherfuse permanently binds these IDs to the user during KYC.",
  examples: [
    [
      {
        input: { provider: "etherfuse", email: "user@example.com", country: "MX" },
        output: { id: "...", kycStatus: "not_started" },
        explanation: "First-time customer setup",
      },
    ],
  ],
  schema: z.object({
    provider: providerSchema,
    email: z.string().email(),
    country: z.string().length(2).default("MX"),
    publicKey: z
      .string()
      .optional()
      .describe("Defaults to the agent's wallet pubkey"),
  }),
  handler: async (agent, input) => {
    const client = await getClient(agent, input.provider);
    return client.createCustomer({
      email: input.email,
      publicKey: input.publicKey ?? agent.wallet.publicKey,
      country: input.country,
    });
  },
};

export const anchorGetKycUrl: Action = {
  name: "ANCHOR_GET_KYC_URL",
  similes: ["kyc url", "verification url", "get kyc link"],
  description:
    "Get a user-facing KYC onboarding URL for the customer. The user must complete KYC at this URL before quotes/orders will succeed.",
  examples: [
    [
      {
        input: { provider: "etherfuse", customerId: "..." },
        output: { url: "https://..." },
        explanation: "Send the user to this URL",
      },
    ],
  ],
  schema: z.object({
    provider: providerSchema,
    customerId: z.string(),
    publicKey: z.string().optional(),
  }),
  handler: async (agent, input) => {
    const client = await getClient(agent, input.provider);
    const url = await client.getKycUrl(
      input.customerId,
      input.publicKey ?? agent.wallet.publicKey,
    );
    return { url };
  },
};

export const anchorGetQuote: Action = {
  name: "ANCHOR_GET_QUOTE",
  similes: ["quote ramp", "fiat rate", "anchor exchange rate"],
  description:
    "Get a fiat ↔ on-chain asset quote from an anchor. Etherfuse covers MXN ↔ CETES (and other stablebonds).",
  examples: [
    [
      {
        input: {
          provider: "etherfuse",
          fromCurrency: "MXN",
          toCurrency: "CETES",
          fromAmount: "1000",
          customerId: "...",
        },
        output: { id: "...", toAmount: "..." },
        explanation: "Quote 1000 MXN -> CETES",
      },
    ],
  ],
  schema: z.object({
    provider: providerSchema,
    fromCurrency: z.string(),
    toCurrency: z.string(),
    fromAmount: z.string(),
    customerId: z.string().optional(),
    stellarAddress: z.string().optional(),
  }),
  handler: async (agent, input) => {
    const client = await getClient(agent, input.provider);
    return client.getQuote({
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      fromAmount: input.fromAmount,
      customerId: input.customerId,
      stellarAddress: input.stellarAddress ?? agent.wallet.publicKey,
    });
  },
};

export const anchorCreateOnRamp: Action = {
  name: "ANCHOR_CREATE_ONRAMP",
  similes: ["create onramp", "fiat to crypto", "buy with bank"],
  description:
    "Create an on-ramp order at an anchor. Returns payment instructions (e.g. SPEI CLABE for Etherfuse) that the end-user must use to send fiat.",
  examples: [
    [
      {
        input: {
          provider: "etherfuse",
          customerId: "...",
          quoteId: "...",
          bankAccountId: "...",
        },
        output: { id: "...", status: "pending", paymentInstructions: { clabe: "..." } },
        explanation: "Create an MXN -> CETES order",
      },
    ],
  ],
  schema: z.object({
    provider: providerSchema,
    customerId: z.string(),
    quoteId: z.string(),
    bankAccountId: z.string().optional(),
    stellarAddress: z.string().optional(),
  }),
  handler: async (agent, input) => {
    const client = await getClient(agent, input.provider);
    let bankAccountId = input.bankAccountId;
    if (!bankAccountId) {
      const ids = await agent.kvStore.get<KvIds>(kvKey(input.provider, agent.wallet.publicKey));
      bankAccountId = ids?.bankAccountId;
    }
    if (!bankAccountId) {
      const err = new Error(
        "bankAccountId not found. Run ANCHOR_CREATE_CUSTOMER first to generate and persist it.",
      );
      (err as Error & { code: string }).code = "BANK_ACCOUNT_ID_MISSING";
      throw err;
    }
    return client.createOnRamp({
      customerId: input.customerId,
      quoteId: input.quoteId,
      bankAccountId,
      stellarAddress: input.stellarAddress ?? agent.wallet.publicKey,
    });
  },
};

export const anchorGetOnRampTx: Action = {
  name: "ANCHOR_GET_ONRAMP_STATUS",
  similes: ["onramp status", "check ramp order"],
  description:
    "Check the status of an on-ramp order. NOTE: Etherfuse has a 3-10 second indexing delay after order creation — querying immediately may return null/404.",
  examples: [
    [
      {
        input: { provider: "etherfuse", txId: "..." },
        output: { id: "...", status: "completed" },
        explanation: "Poll until completed",
      },
    ],
  ],
  schema: z.object({
    provider: providerSchema,
    txId: z.string(),
  }),
  handler: async (agent, input) => {
    const client = await getClient(agent, input.provider);
    const tx = await client.getOnRampTransaction(input.txId);
    return tx ?? { found: false };
  },
};

export const anchorCreateOffRamp: Action = {
  name: "ANCHOR_CREATE_OFFRAMP",
  similes: ["create offramp", "crypto to fiat", "withdraw to bank"],
  description:
    "Create an off-ramp order. For Etherfuse/AlfredPay, returns a Stellar deposit address (or burn-tx XDR for Etherfuse); once tokens arrive there, fiat is paid out. For BlindPay, automatically signs the authorize-XDR with the agent's wallet, submits to BlindPay's `/payouts/stellar` endpoint to release fiat. Set autoSignBlindPay:false to receive the XDR back instead.",
  examples: [
    [
      {
        input: {
          provider: "etherfuse",
          customerId: "...",
          quoteId: "...",
          bankAccountId: "...",
        },
        output: { id: "...", depositAddress: "G..." },
        explanation: "CETES -> MXN withdraw",
      },
    ],
  ],
  schema: z.object({
    provider: providerSchema,
    customerId: z.string(),
    quoteId: z.string(),
    bankAccountId: z.string(),
    stellarAddress: z.string().optional(),
    autoSignBlindPay: z.boolean().default(true),
  }),
  handler: async (agent, input) => {
    const client = await getClient(agent, input.provider);
    const initial = await client.createOffRamp({
      customerId: input.customerId,
      quoteId: input.quoteId,
      bankAccountId: input.bankAccountId,
      stellarAddress: input.stellarAddress ?? agent.wallet.publicKey,
    });

    if (
      input.provider !== "blindpay" ||
      !input.autoSignBlindPay ||
      initial.status !== "pending_signature" ||
      !initial.depositAddress
    ) {
      return initial;
    }

    // BlindPay 2-step: sign authorize-XDR, then POST signed XDR to
    // /payouts/stellar via confirmPayout.
    const senderAddress = input.stellarAddress ?? agent.wallet.publicKey;
    const signedXdr = await agent.wallet.signTransaction(initial.depositAddress, {
      networkPassphrase: agent.config.networkPassphrase,
      accountToSign: senderAddress,
    });

    // Best-effort sanity check that the signed XDR is parseable. We don't
    // submit it ourselves — BlindPay's `/payouts/stellar` endpoint relays it
    // for us. The parse is purely defensive.
    try {
      TransactionBuilder.fromXDR(signedXdr, agent.config.networkPassphrase) as
        | Transaction
        | FeeBumpTransaction;
    } catch (parseErr) {
      const err = new Error(
        `BlindPay signed XDR is not a valid Stellar transaction: ${(parseErr as Error).message}`,
      );
      (err as Error & { code: string }).code = "BLINDPAY_INVALID_XDR";
      throw err;
    }

    const confirmed = await (client as BlindPayClient).confirmPayout(
      input.quoteId,
      signedXdr,
      senderAddress,
    );

    // Suppress lint warning about pollTransaction being unused: BlindPay's
    // `/payouts/stellar` endpoint submits the signed XDR on our behalf, so we
    // don't poll Soroban directly. Keeping the import in case callers want
    // to extend the flow later.
    void pollTransaction;
    return confirmed;
  },
};

export const anchorGetOffRampTx: Action = {
  name: "ANCHOR_GET_OFFRAMP_STATUS",
  similes: ["offramp status", "withdraw status"],
  description: "Check the status of an off-ramp order.",
  examples: [
    [
      {
        input: { provider: "etherfuse", txId: "..." },
        output: { id: "...", status: "completed" },
        explanation: "Poll until completed",
      },
    ],
  ],
  schema: z.object({ provider: providerSchema, txId: z.string() }),
  handler: async (agent, input) => {
    const client = await getClient(agent, input.provider);
    const tx = await client.getOffRampTransaction(input.txId);
    return tx ?? { found: false };
  },
};

/**
 * Sandbox-only action: simulate a fiat-received event for an Etherfuse on-ramp
 * order. Useful for hackathon demos and integration tests because sandbox
 * orders do NOT auto-progress without a real SPEI transfer.
 *
 * Throws `SANDBOX_ONLY` if the resolved Etherfuse network is `"mainnet"`.
 */
export const anchorSimulateFiatReceived: Action = {
  name: "ANCHOR_SIMULATE_FIAT_RECEIVED",
  similes: ["simulate fiat", "sandbox fiat received", "fake spei deposit"],
  description:
    "Etherfuse sandbox-only: simulate a fiat-received event for an on-ramp order. Throws SANDBOX_ONLY when the Etherfuse client is configured for mainnet.",
  examples: [
    [
      {
        input: { provider: "etherfuse", orderId: "..." },
        output: { status: 200 },
        explanation: "Force a sandbox order to progress",
      },
    ],
  ],
  schema: z.object({
    provider: z.literal("etherfuse"),
    orderId: z.string(),
  }),
  handler: async (agent, input) => {
    const client = (await getClient(agent, input.provider)) as EtherfuseClient;
    return client.simulateFiatReceived(input.orderId);
  },
};
