import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import {
  KNOWN_ASSETS_MAINNET,
  KNOWN_ASSETS_TESTNET,
  lookupKnownAsset,
  networkTag,
} from "../knownAssets";

export const knownIssuers: Action = {
  name: "ASSET_KNOWN_ISSUERS",
  similes: [
    "list known issuers",
    "canonical asset issuers",
    "which usdc",
    "verified usdc issuer",
    "what issuer to use",
  ],
  description:
    "Return the kit's verified canonical-asset registry for the active network. " +
    "Use this when the user mentions a well-known asset by code (USDC, EURC, AQUA, " +
    "etc.) and you need the correct issuer G-address to avoid hallucinating one. " +
    "If `assetCode` is provided, returns just that entry (or null). Otherwise " +
    "returns the full registry for the network.",
  examples: [
    [
      {
        input: { assetCode: "USDC" },
        output: {
          network: "testnet",
          asset: {
            code: "USDC",
            issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
            description:
              "Circle's testnet USDC. NOTE: testnet has multiple USDC issuers...",
          },
        },
        explanation: "Look up Circle USDC on testnet before adding a trustline.",
      },
    ],
    [
      {
        input: {},
        output: { network: "mainnet", assets: [{ code: "XLM", issuer: "native" }] },
        explanation: "List the full registry for the active network.",
      },
    ],
  ],
  schema: z.object({
    assetCode: z
      .string()
      .optional()
      .describe("Optional: lookup a single asset by code (case-insensitive)."),
  }),
  handler: async (agent, input) => {
    const network = networkTag(agent.config.networkPassphrase);
    if (input.assetCode) {
      const asset = lookupKnownAsset(agent.config.networkPassphrase, input.assetCode);
      return { network, asset };
    }
    const reg =
      network === "mainnet" ? KNOWN_ASSETS_MAINNET : KNOWN_ASSETS_TESTNET;
    return { network, assets: Object.values(reg) };
  },
};
