import { z } from "zod";
import {
  TransactionBuilder,
  type Transaction,
  type FeeBumpTransaction,
} from "@stellar/stellar-sdk";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";
import { pollTransaction } from "@stellar-agent-kit/core";
import { DefindexClient } from "./api";

function getClient(agent: StellarAgentKit): DefindexClient {
  const apiKey = agent.config.apiKeys?.defindex;
  if (!apiKey) {
    const err = new Error("DeFindex API key missing. Set config.apiKeys.defindex.");
    (err as Error & { code: string }).code = "API_KEY_MISSING";
    throw err;
  }
  return new DefindexClient({ apiKey, baseUrl: agent.config.apiKeys?.defindexBaseUrl });
}

async function signSendXdr(agent: StellarAgentKit, xdrString: string) {
  const signedXdr = await agent.wallet.signTransaction(xdrString, {
    networkPassphrase: agent.config.networkPassphrase,
    accountToSign: agent.wallet.publicKey,
  });
  const signedTx = TransactionBuilder.fromXDR(signedXdr, agent.config.networkPassphrase) as
    | Transaction
    | FeeBumpTransaction;
  const sendResp = await agent.rpcServer.sendTransaction(signedTx);
  if (sendResp.status === "ERROR") {
    const err = new Error(`sendTransaction failed: ${sendResp.errorResult?.toString()}`);
    (err as Error & { code: string }).code = "SEND_FAILED";
    throw err;
  }
  return pollTransaction(agent, sendResp.hash);
}

const networkSchema = z.enum(["mainnet", "testnet"]).default("mainnet");

export const defindexListVaults: Action = {
  name: "DEFINDEX_LIST_VAULTS",
  similes: ["list vaults", "browse defindex"],
  description: "List available DeFindex yield vaults on the given network.",
  examples: [[{ input: {}, output: { vaults: [] }, explanation: "" }]],
  schema: z.object({ network: networkSchema }),
  handler: async (agent, input) => {
    const client = getClient(agent);
    const vaults = await client.listVaults(input.network);
    return { vaults };
  },
};

export const defindexDeposit: Action = {
  name: "DEFINDEX_DEPOSIT",
  similes: ["deposit to vault", "earn yield"],
  description:
    "Deposit assets into a DeFindex yield vault. Note: amounts are passed as an array (one entry per underlying asset). Classic Stellar assets must already be SAC-deployed.",
  examples: [
    [
      {
        input: { vaultAddress: "C...", amounts: ["1000000"] },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "Deposit 1 USDC (1e6 atomic) into a USDC vault",
      },
    ],
  ],
  schema: z.object({
    vaultAddress: z.string(),
    amounts: z.array(z.string()).min(1),
    network: networkSchema,
  }),
  handler: async (agent, input) => {
    const client = getClient(agent);
    const { xdr } = await client.buildDeposit({
      vaultAddress: input.vaultAddress,
      amounts: input.amounts,
      from: agent.wallet.publicKey,
      network: input.network,
    });
    return signSendXdr(agent, xdr);
  },
};

export const defindexWithdraw: Action = {
  name: "DEFINDEX_WITHDRAW",
  similes: ["withdraw from vault", "redeem shares"],
  description: "Redeem shares from a DeFindex yield vault.",
  examples: [
    [
      {
        input: { vaultAddress: "C...", shares: "500000" },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "Redeem 0.5 vault shares",
      },
    ],
  ],
  schema: z.object({
    vaultAddress: z.string(),
    shares: z.string(),
    network: networkSchema,
  }),
  handler: async (agent, input) => {
    const client = getClient(agent);
    const { xdr } = await client.buildWithdraw({
      vaultAddress: input.vaultAddress,
      shares: input.shares,
      from: agent.wallet.publicKey,
      network: input.network,
    });
    return signSendXdr(agent, xdr);
  },
};

export const defindexGetPosition: Action = {
  name: "DEFINDEX_GET_POSITION",
  similes: ["my vault position", "vault balance"],
  description:
    "Get the agent's position in a DeFindex vault — share balance and underlying asset exposure.",
  examples: [
    [
      {
        input: { vaultAddress: "C..." },
        output: { shares: "100", underlying: { USDC: "100.5" } },
        explanation: "Read position",
      },
    ],
  ],
  schema: z.object({
    vaultAddress: z.string(),
    account: z.string().optional(),
    network: networkSchema,
  }),
  handler: async (agent, input) => {
    const client = getClient(agent);
    const position = await client.getPosition({
      vaultAddress: input.vaultAddress,
      account: input.account ?? agent.wallet.publicKey,
      network: input.network,
    });
    return { position };
  },
};
