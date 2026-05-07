import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { Operation, Asset } from "@stellar/stellar-sdk";
import { buildSubmitClassic, requireHorizon } from "../utils";

/**
 * One-shot helper for the classic Stellar issuance pattern:
 *   issuer wallet pays the distribution account → distribution trustlines the asset → issuer pays N tokens.
 *
 * Assumes the agent's wallet IS the issuer. The distribution account must already exist;
 * use a separate call (e.g. CreateAccount) or fund via Friendbot in advance.
 *
 * NOTE: For production issuance, set the issuer's `auth_required` / `set_options(home_domain, ...)`
 * via ASSET_SET_OPTIONS first.
 */
export const issue: Action = {
  name: "ASSET_ISSUE",
  similes: ["issue token", "create asset", "mint token"],
  description:
    "Issue a custom Stellar Classic asset by sending an initial supply from the agent (issuer) to a distribution account that has already trustlined the asset.",
  examples: [
    [
      {
        input: { assetCode: "MYTOKEN", distribution: "G...", initialSupply: "1000000" },
        output: { hash: "...", ledger: 1 },
        explanation: "Mint 1M MYTOKEN to the distribution account",
      },
    ],
  ],
  schema: z.object({
    assetCode: z.string().describe("4 or 12 chars, e.g. USDX, MYTOKEN"),
    distribution: z.string().describe("Distribution account G... that already trustlined the asset"),
    initialSupply: z.string().describe("Initial supply, decimal string"),
  }),
  handler: async (agent, input) => {
    const horizon = requireHorizon(agent);
    const asset = new Asset(input.assetCode, agent.wallet.publicKey);
    const dist = await horizon.loadAccount(input.distribution);
    const hasTrust = dist.balances.some(
      (b) =>
        b.asset_type !== "native" &&
        "asset_code" in b &&
        b.asset_code === input.assetCode &&
        "asset_issuer" in b &&
        b.asset_issuer === agent.wallet.publicKey,
    );
    if (!hasTrust) {
      const err = new Error(
        `Distribution account ${input.distribution} has no trustline for ${input.assetCode}:${agent.wallet.publicKey}. Call ASSET_TRUSTLINE_ADD from the distribution account first.`,
      );
      (err as Error & { code: string }).code = "TRUSTLINE_REQUIRED";
      throw err;
    }

    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(
        Operation.payment({ destination: input.distribution, asset, amount: input.initialSupply }),
      ),
    );
    return { hash, ledger, assetCode: input.assetCode, issuer: agent.wallet.publicKey };
  },
};
