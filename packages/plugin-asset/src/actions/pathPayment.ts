import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { Operation } from "@stellar/stellar-sdk";
import { buildSubmitClassic, makeAsset } from "../utils";

const assetSchema = z.object({
  code: z.string(),
  issuer: z.string().optional(),
});

export const pathPaymentStrictSend: Action = {
  name: "ASSET_PATH_PAYMENT_STRICT_SEND",
  similes: ["path payment", "convert and send", "swap and pay"],
  description:
    "Send a fixed amount of one asset which is converted along the way to a destination asset using Stellar's classic DEX path-payment.",
  examples: [
    [
      {
        input: {
          destination: "G...",
          sendAsset: { code: "XLM" },
          sendAmount: "100",
          destAsset: { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
          destMin: "10",
          path: [],
        },
        output: { hash: "...", ledger: 1 },
        explanation: "Convert 100 XLM into at least 10 USDC",
      },
    ],
  ],
  schema: z.object({
    destination: z.string(),
    sendAsset: assetSchema,
    sendAmount: z.string(),
    destAsset: assetSchema,
    destMin: z.string(),
    path: z.array(assetSchema).default([]),
  }),
  handler: async (agent, input) => {
    const sendAsset = makeAsset(input.sendAsset);
    const destAsset = makeAsset(input.destAsset);
    const path = input.path.map(makeAsset);
    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(
        Operation.pathPaymentStrictSend({
          destination: input.destination,
          sendAsset,
          sendAmount: input.sendAmount,
          destAsset,
          destMin: input.destMin,
          path,
        }),
      ),
    );
    return { hash, ledger };
  },
};
