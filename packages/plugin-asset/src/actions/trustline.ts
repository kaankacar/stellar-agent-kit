import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { Operation } from "@stellar/stellar-sdk";
import { buildSubmitClassic, makeAsset } from "../utils";
import { lookupKnownAsset } from "../knownAssets";

export const trustlineAdd: Action = {
  name: "ASSET_TRUSTLINE_ADD",
  similes: ["change trust", "add trustline", "trust asset"],
  description:
    "Establish or update a trustline from the agent's wallet for a non-native Stellar asset. " +
    "If `issuer` is omitted, the kit auto-resolves it from a verified canonical-asset registry " +
    "(USDC, EURC, AQUA, etc. — see ASSET_KNOWN_ISSUERS). On testnet there are multiple USDC " +
    "issuers (Circle / Blend / Etherfuse); the auto-resolver picks Circle's. To use a different " +
    "one, pass `issuer` explicitly.",
  examples: [
    [
      {
        input: { assetCode: "USDC" },
        output: { hash: "...", ledger: 1, resolvedIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
        explanation: "Trustline mainnet Circle USDC (issuer auto-resolved)",
      },
    ],
  ],
  schema: z.object({
    assetCode: z.string(),
    issuer: z
      .string()
      .optional()
      .describe(
        "Issuer G-address. If omitted, auto-resolved from the canonical-asset registry for the active network.",
      ),
    limit: z
      .string()
      .optional()
      .describe("Trust limit (omit for max). String decimal, e.g. 1000000"),
  }),
  handler: async (agent, input) => {
    const issuer = await resolveIssuer(agent, input.assetCode, input.issuer);
    const asset = makeAsset({ code: input.assetCode, issuer });
    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(Operation.changeTrust({ asset, ...(input.limit ? { limit: input.limit } : {}) })),
    );
    return { hash, ledger, resolvedIssuer: issuer };
  },
};

export const trustlineRemove: Action = {
  name: "ASSET_TRUSTLINE_REMOVE",
  similes: ["remove trustline", "untrust asset"],
  description:
    "Remove a trustline by setting its limit to 0. The agent's balance for that asset must already be 0. " +
    "Issuer is auto-resolved if omitted (see ASSET_TRUSTLINE_ADD).",
  examples: [
    [
      {
        input: { assetCode: "USDC" },
        output: { hash: "...", ledger: 1 },
        explanation: "Remove a USDC trustline (issuer auto-resolved)",
      },
    ],
  ],
  schema: z.object({
    assetCode: z.string(),
    issuer: z.string().optional(),
  }),
  handler: async (agent, input) => {
    const issuer = await resolveIssuer(agent, input.assetCode, input.issuer);
    const asset = makeAsset({ code: input.assetCode, issuer });
    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(Operation.changeTrust({ asset, limit: "0" })),
    );
    return { hash, ledger, resolvedIssuer: issuer };
  },
};

/**
 * Resolve issuer with explicit-input precedence over registry lookup.
 * Throws ISSUER_REQUIRED if neither is available.
 */
async function resolveIssuer(
  agent: { config: { networkPassphrase: string } },
  assetCode: string,
  explicit: string | undefined,
): Promise<string> {
  if (explicit) return explicit;
  const known = lookupKnownAsset(agent.config.networkPassphrase, assetCode);
  if (known && known.issuer && known.issuer !== "native") return known.issuer;
  const err = new Error(
    `Asset ${assetCode} is not in the canonical-asset registry for this network. ` +
      `Pass \`issuer\` explicitly, or use ASSET_KNOWN_ISSUERS to see what's available.`,
  );
  (err as Error & { code: string }).code = "ISSUER_REQUIRED";
  throw err;
}
