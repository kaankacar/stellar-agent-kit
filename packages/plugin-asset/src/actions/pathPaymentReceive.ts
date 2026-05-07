import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { Operation } from "@stellar/stellar-sdk";
import { buildSubmitClassic, makeAsset } from "../utils";

const assetSchema = z.object({
  code: z.string(),
  issuer: z.string().optional(),
});

export const pathPaymentStrictReceive: Action = {
  name: "ASSET_PATH_PAYMENT_STRICT_RECEIVE",
  similes: ["path payment receive", "buy exact amount", "swap to receive"],
  description:
    "Send up to a maximum amount of one asset which is converted along the way so the destination receives an exact amount of another asset using Stellar's classic DEX path-payment.",
  examples: [
    [
      {
        input: {
          destination: "G...",
          sendAsset: { code: "XLM" },
          sendMax: "120",
          destAsset: { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
          destAmount: "10",
          path: [],
        },
        output: { hash: "...", ledger: 1 },
        explanation: "Spend at most 120 XLM to deliver exactly 10 USDC",
      },
    ],
  ],
  schema: z.object({
    destination: z.string(),
    sendAsset: assetSchema,
    sendMax: z.string(),
    destAsset: assetSchema,
    destAmount: z.string(),
    path: z.array(assetSchema).default([]),
  }),
  handler: async (agent, input) => {
    const sendAsset = makeAsset(input.sendAsset);
    const destAsset = makeAsset(input.destAsset);
    const path = input.path.map(makeAsset);
    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(
        Operation.pathPaymentStrictReceive({
          destination: input.destination,
          sendAsset,
          sendMax: input.sendMax,
          destAsset,
          destAmount: input.destAmount,
          path,
        }),
      ),
    );
    return { hash, ledger };
  },
};
