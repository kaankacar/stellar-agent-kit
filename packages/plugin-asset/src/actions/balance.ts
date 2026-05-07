import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { requireHorizon } from "../utils";

export const balance: Action = {
  name: "ASSET_GET_BALANCE",
  similes: ["check balance", "get balance", "wallet balance"],
  description:
    "Returns native (XLM) and asset balances for the given account, or for the agent's wallet if no account is specified.",
  examples: [
    [
      {
        input: {},
        output: {
          account: "G...",
          balances: [{ asset: "XLM", balance: "10000.0" }],
        },
        explanation: "Default to agent's wallet",
      },
    ],
  ],
  schema: z.object({
    account: z.string().optional(),
  }),
  handler: async (agent, input) => {
    const horizon = requireHorizon(agent);
    const account = input.account ?? agent.wallet.publicKey;
    const acc = await horizon.loadAccount(account);
    return {
      account,
      balances: acc.balances.map((b) => {
        if (b.asset_type === "native") return { asset: "XLM", balance: b.balance };
        return {
          asset: "asset_code" in b ? b.asset_code : "?",
          issuer: "asset_issuer" in b ? b.asset_issuer : undefined,
          balance: b.balance,
        };
      }),
    };
  },
};
