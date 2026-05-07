import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { Operation, Claimant } from "@stellar/stellar-sdk";
import { buildSubmitClassic, makeAsset } from "../utils";

export const claimableBalanceCreate: Action = {
  name: "ASSET_CLAIMABLE_BALANCE_CREATE",
  similes: ["create claimable", "send claimable balance"],
  description:
    "Create a claimable balance — escrow-like primitive where one or more claimants can later claim the funds without needing a trustline first.",
  examples: [
    [
      {
        input: { assetCode: "XLM", amount: "5", claimants: ["G..."] },
        output: { hash: "...", ledger: 1 },
        explanation: "Send 5 XLM as claimable to a recipient",
      },
    ],
  ],
  schema: z.object({
    assetCode: z.string(),
    issuer: z.string().optional(),
    amount: z.string(),
    claimants: z.array(z.string()).min(1),
  }),
  handler: async (agent, input) => {
    const asset = makeAsset({ code: input.assetCode, issuer: input.issuer });
    const claimants = input.claimants.map(
      (dest: string) => new Claimant(dest, Claimant.predicateUnconditional()),
    );
    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(Operation.createClaimableBalance({ asset, amount: input.amount, claimants })),
    );
    return { hash, ledger };
  },
};

export const claimableBalanceClaim: Action = {
  name: "ASSET_CLAIMABLE_BALANCE_CLAIM",
  similes: ["claim claimable", "redeem claimable"],
  description: "Claim a claimable balance the agent's wallet is a claimant of.",
  examples: [
    [
      {
        input: { balanceId: "00000000..." },
        output: { hash: "...", ledger: 1 },
        explanation: "Claim by id",
      },
    ],
  ],
  schema: z.object({ balanceId: z.string() }),
  handler: async (agent, input) => {
    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(Operation.claimClaimableBalance({ balanceId: input.balanceId })),
    );
    return { hash, ledger };
  },
};
