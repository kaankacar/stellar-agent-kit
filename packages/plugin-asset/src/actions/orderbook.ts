import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { makeAsset, requireHorizon } from "../utils";

const assetSchema = z.object({
  code: z.string(),
  issuer: z.string().optional(),
});

export const getOrderbook: Action = {
  name: "DEX_GET_ORDERBOOK",
  similes: ["get orderbook", "read orderbook", "show order book", "fetch dex orderbook"],
  description:
    "Read the Stellar Classic DEX order book between a base (selling) asset and a counter (buying) asset via Horizon.",
  examples: [
    [
      {
        input: {
          selling: { code: "XLM" },
          buying: {
            code: "USDC",
            issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          },
          limit: 20,
        },
        output: { bids: [], asks: [], base: {}, counter: {} },
        explanation: "Fetch the top 20 bid/ask levels for XLM/USDC",
      },
    ],
  ],
  schema: z.object({
    selling: assetSchema,
    buying: assetSchema,
    limit: z.number().int().positive().max(200).default(20),
  }),
  handler: async (agent, input) => {
    const horizon = requireHorizon(agent);
    const selling = makeAsset(input.selling);
    const buying = makeAsset(input.buying);
    const resp = await horizon.orderbook(selling, buying).limit(input.limit).call();
    return {
      bids: resp.bids,
      asks: resp.asks,
      base: resp.base,
      counter: resp.counter,
    };
  },
};
