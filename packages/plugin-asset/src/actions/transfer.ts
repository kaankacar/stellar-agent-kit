import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { Operation } from "@stellar/stellar-sdk";
import { buildSubmitClassic, ensureTrustline, makeAsset, requireHorizon } from "../utils";

export const transfer: Action = {
  name: "ASSET_TRANSFER",
  similes: ["send xlm", "send asset", "pay", "transfer asset"],
  description:
    "Transfer XLM or any Stellar Classic asset from the agent's wallet to a destination account. Verifies destination has a trustline before submitting.",
  examples: [
    [
      {
        input: { destination: "G...", assetCode: "XLM", amount: "10" },
        output: { hash: "abc...", ledger: 12345 },
        explanation: "Send 10 XLM",
      },
    ],
  ],
  schema: z.object({
    destination: z.string().describe("Stellar G... address of the recipient"),
    assetCode: z.string().describe("Asset code, e.g. XLM, USDC"),
    issuer: z.string().optional().describe("Asset issuer G... address (required for non-native)"),
    amount: z.string().describe("Amount as a decimal string, e.g. 10.5"),
    memo: z.string().optional(),
  }),
  handler: async (agent, input) => {
    const horizon = requireHorizon(agent);
    const asset = makeAsset({ code: input.assetCode, issuer: input.issuer });
    await ensureTrustline(horizon, input.destination, asset);

    const { hash, ledger } = await buildSubmitClassic(
      agent,
      (b) =>
        b.addOperation(
          Operation.payment({ destination: input.destination, asset, amount: input.amount }),
        ),
      { memo: input.memo },
    );
    return { hash, ledger };
  },
};
