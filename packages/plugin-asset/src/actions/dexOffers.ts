import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { Operation } from "@stellar/stellar-sdk";
import { buildSubmitClassic, makeAsset } from "../utils";

const assetSchema = z.object({
  code: z.string(),
  issuer: z.string().optional(),
});

export const manageSellOffer: Action = {
  name: "DEX_MANAGE_SELL_OFFER",
  similes: ["sell offer", "create sell offer", "update sell offer", "place sell order"],
  description:
    "Create, update or cancel a sell offer on the Stellar Classic DEX. Pass offerId='0' to create a new offer; pass an existing offer id to update it. To cancel use DEX_CANCEL_OFFER.",
  examples: [
    [
      {
        input: {
          selling: { code: "XLM" },
          buying: {
            code: "USDC",
            issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          },
          amount: "100",
          price: "0.1",
          offerId: "0",
        },
        output: { hash: "...", ledger: 1 },
        explanation: "Place a new sell offer of 100 XLM at 0.1 USDC each",
      },
    ],
  ],
  schema: z.object({
    selling: assetSchema,
    buying: assetSchema,
    amount: z.string().describe("Amount of selling asset, decimal string. Use '0' to cancel."),
    price: z.string().describe("Price as decimal string, units of buying per selling"),
    offerId: z.string().default("0").describe("Existing offer id, or '0' to create a new offer"),
  }),
  handler: async (agent, input) => {
    const selling = makeAsset(input.selling);
    const buying = makeAsset(input.buying);
    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(
        Operation.manageSellOffer({
          selling,
          buying,
          amount: input.amount,
          price: input.price,
          offerId: input.offerId,
        }),
      ),
    );
    return { hash, ledger };
  },
};

export const manageBuyOffer: Action = {
  name: "DEX_MANAGE_BUY_OFFER",
  similes: ["buy offer", "create buy offer", "update buy offer", "place buy order"],
  description:
    "Create, update or cancel a buy offer on the Stellar Classic DEX. Pass offerId='0' to create a new offer; pass an existing offer id to update it. Set buyAmount to '0' to cancel.",
  examples: [
    [
      {
        input: {
          selling: { code: "XLM" },
          buying: {
            code: "USDC",
            issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          },
          buyAmount: "10",
          price: "10",
          offerId: "0",
        },
        output: { hash: "...", ledger: 1 },
        explanation: "Place a new buy offer to buy 10 USDC at 10 XLM each",
      },
    ],
  ],
  schema: z.object({
    selling: assetSchema,
    buying: assetSchema,
    buyAmount: z.string().describe("Amount of buying asset, decimal string. Use '0' to cancel."),
    price: z.string().describe("Price as decimal string, units of selling per buying"),
    offerId: z.string().default("0").describe("Existing offer id, or '0' to create a new offer"),
  }),
  handler: async (agent, input) => {
    const selling = makeAsset(input.selling);
    const buying = makeAsset(input.buying);
    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(
        Operation.manageBuyOffer({
          selling,
          buying,
          buyAmount: input.buyAmount,
          price: input.price,
          offerId: input.offerId,
        }),
      ),
    );
    return { hash, ledger };
  },
};

export const cancelOffer: Action = {
  name: "DEX_CANCEL_OFFER",
  similes: ["cancel offer", "delete offer", "remove offer"],
  description:
    "Cancel an existing sell offer on the Stellar Classic DEX. Submits a manageSellOffer with amount='0' for the supplied offerId.",
  examples: [
    [
      {
        input: {
          selling: { code: "XLM" },
          buying: {
            code: "USDC",
            issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          },
          price: "0.1",
          offerId: "12345",
        },
        output: { hash: "...", ledger: 1 },
        explanation: "Cancel an existing sell offer with id 12345",
      },
    ],
  ],
  schema: z.object({
    selling: assetSchema,
    buying: assetSchema,
    price: z.string().default("1").describe("Price is required by the operation but ignored when cancelling"),
    offerId: z.string().describe("Existing offer id to cancel"),
  }),
  handler: async (agent, input) => {
    const selling = makeAsset(input.selling);
    const buying = makeAsset(input.buying);
    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(
        Operation.manageSellOffer({
          selling,
          buying,
          amount: "0",
          price: input.price,
          offerId: input.offerId,
        }),
      ),
    );
    return { hash, ledger };
  },
};
