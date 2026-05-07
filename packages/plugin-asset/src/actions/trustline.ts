import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { Operation } from "@stellar/stellar-sdk";
import { buildSubmitClassic, makeAsset } from "../utils";

export const trustlineAdd: Action = {
  name: "ASSET_TRUSTLINE_ADD",
  similes: ["change trust", "add trustline", "trust asset"],
  description:
    "Establish or update a trustline from the agent's wallet for a non-native Stellar asset.",
  examples: [
    [
      {
        input: { assetCode: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
        output: { hash: "...", ledger: 1 },
        explanation: "Trustline USDC at default limit",
      },
    ],
  ],
  schema: z.object({
    assetCode: z.string(),
    issuer: z.string(),
    limit: z
      .string()
      .optional()
      .describe("Trust limit (omit for max). String decimal, e.g. 1000000"),
  }),
  handler: async (agent, input) => {
    const asset = makeAsset({ code: input.assetCode, issuer: input.issuer });
    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(Operation.changeTrust({ asset, ...(input.limit ? { limit: input.limit } : {}) })),
    );
    return { hash, ledger };
  },
};

export const trustlineRemove: Action = {
  name: "ASSET_TRUSTLINE_REMOVE",
  similes: ["remove trustline", "untrust asset"],
  description:
    "Remove a trustline by setting its limit to 0. The agent's balance for that asset must already be 0.",
  examples: [
    [
      {
        input: { assetCode: "USDC", issuer: "GA..." },
        output: { hash: "...", ledger: 1 },
        explanation: "Remove a USDC trustline",
      },
    ],
  ],
  schema: z.object({ assetCode: z.string(), issuer: z.string() }),
  handler: async (agent, input) => {
    const asset = makeAsset({ code: input.assetCode, issuer: input.issuer });
    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(Operation.changeTrust({ asset, limit: "0" })),
    );
    return { hash, ledger };
  },
};
