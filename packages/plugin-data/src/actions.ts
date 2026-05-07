import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";

const NETWORK_PATH = { mainnet: "public", testnet: "testnet" } as const;

export const stellarExpertAccount: Action = {
  name: "STELLAR_EXPERT_ACCOUNT",
  similes: ["lookup account", "explorer account", "account info"],
  description:
    "Fetch account metadata from Stellar Expert: tags, balances, payment counts, and metadata. Read-only.",
  examples: [
    [
      {
        input: { account: "GA..." },
        output: { account: "GA...", tags: [] },
        explanation: "Look up account",
      },
    ],
  ],
  schema: z.object({
    account: z.string(),
    network: z.enum(["mainnet", "testnet"]).default("mainnet"),
  }),
  handler: async (_agent, input) => {
    const path = NETWORK_PATH[input.network as "mainnet" | "testnet"];
    const url = `https://api.stellar.expert/explorer/${path}/account/${input.account}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const err = new Error(`stellar.expert account lookup failed: ${resp.status}`);
      (err as Error & { code: string }).code = "EXPLORER_LOOKUP_FAILED";
      throw err;
    }
    return (await resp.json()) as Record<string, unknown>;
  },
};

export const stellarExpertAsset: Action = {
  name: "STELLAR_EXPERT_ASSET",
  similes: ["asset info", "explorer asset"],
  description:
    "Fetch asset metadata from Stellar Expert: total supply, holders, payments, related anchors.",
  examples: [
    [
      {
        input: { asset: "USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
        output: { asset: "USDC-..." },
        explanation: "Look up USDC",
      },
    ],
  ],
  schema: z.object({
    asset: z.string().describe("Format: CODE-ISSUER, or just CODE for native (XLM)"),
    network: z.enum(["mainnet", "testnet"]).default("mainnet"),
  }),
  handler: async (_agent, input) => {
    const path = NETWORK_PATH[input.network as "mainnet" | "testnet"];
    const url = `https://api.stellar.expert/explorer/${path}/asset/${encodeURIComponent(input.asset)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const err = new Error(`stellar.expert asset lookup failed: ${resp.status}`);
      (err as Error & { code: string }).code = "EXPLORER_LOOKUP_FAILED";
      throw err;
    }
    return (await resp.json()) as Record<string, unknown>;
  },
};

export const rpcGetLatestLedger: Action = {
  name: "RPC_GET_LATEST_LEDGER",
  similes: ["latest ledger", "current ledger"],
  description: "Fetch the latest ledger sequence number and hash from the Soroban RPC.",
  examples: [[{ input: {}, output: { sequence: 1234567 }, explanation: "" }]],
  schema: z.object({}),
  handler: async (agent) => {
    const r = await agent.rpcServer.getLatestLedger();
    return { sequence: r.sequence, id: r.id, protocolVersion: r.protocolVersion };
  },
};

export const horizonTxHistory: Action = {
  name: "HORIZON_TX_HISTORY",
  similes: ["transaction history", "recent transactions", "tx history"],
  description:
    "Fetch the most recent transactions for the agent's wallet (or a given account) from Horizon.",
  examples: [
    [
      {
        input: { limit: 10 },
        output: { transactions: [] },
        explanation: "Last 10 txs of agent wallet",
      },
    ],
  ],
  schema: z.object({
    account: z.string().optional(),
    limit: z.number().int().positive().max(200).default(10),
    order: z.enum(["asc", "desc"]).default("desc"),
  }),
  handler: async (agent, input) => {
    if (!agent.horizonServer) {
      const err = new Error("HORIZON_TX_HISTORY requires horizonUrl to be configured.");
      (err as Error & { code: string }).code = "HORIZON_NOT_CONFIGURED";
      throw err;
    }
    const account = input.account ?? agent.wallet.publicKey;
    const resp = await agent.horizonServer
      .transactions()
      .forAccount(account)
      .limit(input.limit)
      .order(input.order)
      .call();
    return {
      transactions: resp.records.map((tx) => ({
        hash: tx.hash,
        ledger: tx.ledger,
        createdAt: tx.created_at,
        successful: tx.successful,
        memo: tx.memo,
        feeCharged: tx.fee_charged,
      })),
    };
  },
};
