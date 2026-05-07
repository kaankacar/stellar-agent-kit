import { z } from "zod";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";
import { TrustlessWorkClient } from "./client";

function getClient(agent: StellarAgentKit): TrustlessWorkClient {
  const apiKey = agent.config.apiKeys?.trustlessWork;
  if (!apiKey) {
    const err = new Error("Trustless Work API key missing. Set config.apiKeys.trustlessWork.");
    (err as Error & { code: string }).code = "API_KEY_MISSING";
    throw err;
  }
  return new TrustlessWorkClient({
    apiKey,
    network: (agent.config.apiKeys?.trustlessWorkNetwork as "testnet" | "mainnet") ?? "testnet",
    baseUrl: agent.config.apiKeys?.trustlessWorkBaseUrl,
    authStyle:
      (agent.config.apiKeys?.trustlessWorkAuthStyle as "bearer" | "x-api-key" | undefined) ??
      "bearer",
  });
}

const rolesSchema = z.object({
  approver: z.string(),
  serviceProvider: z.string(),
  releaseSigner: z.string(),
  platformAddress: z.string(),
  disputeResolver: z.string(),
  receiver: z.string().optional(),
});

const trustlineSchema = z.object({
  address: z.string().describe("Issuer G... address — NOT a contract id"),
  code: z.string(),
});

export const escrowCreateSingleRelease: Action = {
  name: "TW_CREATE_SINGLE_RELEASE",
  similes: ["create escrow", "single payout escrow", "lump-sum escrow"],
  description:
    "Create a single-release escrow on Trustless Work. One payout once all milestones are approved. Each role address must already have a trustline for the asset.",
  examples: [
    [
      {
        input: {
          engagementId: "order-1",
          title: "Build me a website",
          roles: {
            approver: "G...",
            serviceProvider: "G...",
            releaseSigner: "G...",
            platformAddress: "G...",
            disputeResolver: "G...",
            receiver: "G...",
          },
          amount: 1000,
          milestones: [{ description: "Design" }, { description: "Deploy" }],
          trustline: { address: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", code: "USDC" },
        },
        output: { success: true, contractId: "C..." },
        explanation: "Two-milestone, $1k single-payout job",
      },
    ],
  ],
  schema: z.object({
    engagementId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    roles: rolesSchema,
    amount: z.number().positive(),
    platformFee: z.number().optional(),
    milestones: z
      .array(z.object({ description: z.string(), status: z.string().optional() }))
      .min(1),
    trustline: trustlineSchema,
  }),
  handler: async (agent, input) => getClient(agent).createSingleRelease(input as never),
};

export const escrowCreateMultiRelease: Action = {
  name: "TW_CREATE_MULTI_RELEASE",
  similes: ["create grant escrow", "multi payout escrow"],
  description:
    "Create a multi-release escrow. Each milestone has its own amount and is paid out individually upon approval.",
  examples: [
    [
      {
        input: {
          engagementId: "grant-1",
          title: "Research grant",
          roles: {
            approver: "G...",
            serviceProvider: "G...",
            releaseSigner: "G...",
            platformAddress: "G...",
            disputeResolver: "G...",
          },
          milestones: [
            { description: "Phase 1", amount: 500, receiver: "G..." },
            { description: "Phase 2", amount: 500, receiver: "G..." },
          ],
          trustline: { address: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", code: "USDC" },
        },
        output: { success: true, contractId: "C...", totalAmount: 1000 },
        explanation: "Two-phase grant",
      },
    ],
  ],
  schema: z.object({
    engagementId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    roles: rolesSchema,
    platformFee: z.number().optional(),
    milestones: z
      .array(
        z.object({
          description: z.string(),
          amount: z.number().positive(),
          status: z.string().optional(),
          receiver: z.string(),
        }),
      )
      .min(1),
    trustline: trustlineSchema,
  }),
  handler: async (agent, input) => getClient(agent).createMultiRelease(input as never),
};

export const escrowGet: Action = {
  name: "TW_GET_ESCROW",
  similes: ["read escrow", "check escrow"],
  description: "Read full escrow details by contract id.",
  examples: [
    [{ input: { escrowId: "C..." }, output: { contractId: "C..." }, explanation: "" }],
  ],
  schema: z.object({ escrowId: z.string() }),
  handler: async (agent, input) => {
    const data = await getClient(agent).getEscrow(input.escrowId);
    return { escrow: data };
  },
};

export const escrowFund: Action = {
  name: "TW_FUND_ESCROW",
  similes: ["fund escrow", "deposit to escrow"],
  description:
    "Generate the funding transaction for an escrow. The depositor must sign the returned transaction with their wallet — Trustless Work returns the transaction hash after broadcast.",
  examples: [
    [
      {
        input: { escrowId: "C...", amount: 1000, depositor: "G..." },
        output: { success: true, transactionHash: "..." },
        explanation: "",
      },
    ],
  ],
  schema: z.object({
    escrowId: z.string(),
    amount: z.number().positive(),
    depositor: z.string().optional(),
  }),
  handler: async (agent, input) =>
    getClient(agent).fundEscrow(
      input.escrowId,
      input.amount,
      input.depositor ?? agent.wallet.publicKey,
    ),
};

export const escrowUpdateMilestone: Action = {
  name: "TW_UPDATE_MILESTONE",
  similes: ["update milestone", "mark milestone done"],
  description:
    "Service Provider marks a milestone with a new status (e.g. 'Complete') and optional evidence.",
  examples: [
    [
      {
        input: {
          escrowId: "C...",
          milestoneId: 0,
          status: "Complete",
          evidence: { url: "https://...", description: "Submitted" },
        },
        output: { success: true },
        explanation: "",
      },
    ],
  ],
  schema: z.object({
    escrowId: z.string(),
    milestoneId: z.number().int().nonnegative(),
    status: z.string(),
    evidence: z
      .object({
        url: z.string().optional(),
        description: z.string().optional(),
        timestamp: z.string().optional(),
      })
      .optional(),
  }),
  handler: async (agent, input) =>
    getClient(agent).updateMilestoneStatus(input.escrowId, input.milestoneId, input.status, input.evidence),
};

export const escrowApprove: Action = {
  name: "TW_APPROVE_MILESTONES",
  similes: ["approve milestone", "sign off"],
  description:
    "Approver signs off on one or more milestones. Single-release: pass `milestones` (array of indices). Multi-release: pass `milestoneId` (single index).",
  examples: [
    [
      {
        input: { escrowId: "C...", milestones: [0, 1] },
        output: { success: true, readyForRelease: true },
        explanation: "Single-release: approve all",
      },
    ],
  ],
  schema: z
    .object({
      escrowId: z.string(),
      milestones: z.array(z.number().int().nonnegative()).optional(),
      milestoneId: z.number().int().nonnegative().optional(),
    })
    .refine((d) => !!(d.milestones || d.milestoneId !== undefined), {
      message: "Provide either `milestones` (array) or `milestoneId` (single).",
    }),
  handler: async (agent, input) => {
    const body = input.milestones
      ? { milestones: input.milestones as number[] }
      : { milestoneId: input.milestoneId as number };
    return getClient(agent).approveMilestones(input.escrowId, body);
  },
};

export const escrowRelease: Action = {
  name: "TW_RELEASE",
  similes: ["release escrow", "payout"],
  description:
    "Release Signer triggers payout. Single-release: pass releaseAll:true. Multi-release: pass milestoneId.",
  examples: [
    [
      {
        input: { escrowId: "C...", releaseAll: true },
        output: { success: true, amountReleased: 992 },
        explanation: "Single-release final payout",
      },
    ],
  ],
  schema: z
    .object({
      escrowId: z.string(),
      releaseAll: z.boolean().optional(),
      milestoneId: z.number().int().nonnegative().optional(),
    })
    .refine((d) => d.releaseAll === true || d.milestoneId !== undefined, {
      message: "Provide either releaseAll:true or milestoneId.",
    }),
  handler: async (agent, input) => {
    const body =
      input.releaseAll === true ? ({ releaseAll: true } as const) : { milestoneId: input.milestoneId as number };
    return getClient(agent).release(input.escrowId, body);
  },
};

export const escrowDispute: Action = {
  name: "TW_RAISE_DISPUTE",
  similes: ["dispute escrow", "open dispute"],
  description: "Raise a dispute on an escrow. Locks the escrow until resolved.",
  examples: [
    [
      {
        input: { escrowId: "C...", reason: "Work incomplete" },
        output: { success: true, disputeId: "..." },
        explanation: "",
      },
    ],
  ],
  schema: z.object({
    escrowId: z.string(),
    reason: z.string(),
    evidence: z.string().optional(),
    requestedAction: z.string().optional(),
  }),
  handler: async (agent, input) =>
    getClient(agent).raiseDispute(input.escrowId, {
      reason: input.reason,
      evidence: input.evidence,
      requestedAction: input.requestedAction,
    }),
};
