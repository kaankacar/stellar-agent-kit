import { z } from "zod";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";
import type { MemoryStore } from "./memoryStore";
import type { StandingGoals } from "./standingGoals";
import type { SoulFile } from "./soulFile";

/**
 * The personal layer is wired by the host process — the agent doesn't
 * instantiate SoulFile / MemoryStore / StandingGoals itself. The host attaches
 * them via `agent.config.apiKeys` (string keys) AND a sidecar `personal` field
 * on the agent's methods. We use a registry pattern: the host calls
 * `attachPersonal(agent, { soul, memory, goals })` once, and these actions
 * pull from there.
 */

interface PersonalContext {
  soul: SoulFile;
  memory: MemoryStore;
  goals: StandingGoals;
}

const REGISTRY = new WeakMap<StellarAgentKit, PersonalContext>();

export function attachPersonal(agent: StellarAgentKit, ctx: PersonalContext): void {
  REGISTRY.set(agent, ctx);
}

function ctxOrThrow(agent: StellarAgentKit): PersonalContext {
  const ctx = REGISTRY.get(agent);
  if (!ctx) {
    const err = new Error(
      "Personal context not attached to this agent. Call attachPersonal(agent, { soul, memory, goals }) before running.",
    );
    (err as Error & { code: string }).code = "PERSONAL_NOT_ATTACHED";
    throw err;
  }
  return ctx;
}

// =============================================================================
// Memory actions — agent's working memory
// =============================================================================

export const agentRemember: Action = {
  name: "AGENT_REMEMBER",
  similes: ["take note", "save to memory", "remember this"],
  description:
    "Save an observation to working memory. The agent should call this whenever it learns something durable about the user, the markets, or the outcome of a previous action.",
  examples: [
    [
      {
        input: {
          kind: "observation",
          content: "User prefers USDC over XLM for amounts above $100.",
          tags: ["preference"],
        },
        output: { id: "mem_..." },
        explanation: "",
      },
    ],
  ],
  schema: z.object({
    kind: z.enum(["observation", "summary", "user_note", "outcome"]),
    content: z.string().min(1).max(2000),
    tags: z.array(z.string()).optional(),
  }),
  handler: async (agent, input) => {
    const { memory } = ctxOrThrow(agent);
    const entry = await memory.remember({
      kind: input.kind,
      content: input.content,
      tags: input.tags,
    });
    return { id: entry.id, timestamp: entry.timestamp };
  },
};

export const agentRecall: Action = {
  name: "AGENT_RECALL",
  similes: ["search memory", "what do I remember", "recall notes"],
  description:
    "Search working memory by tag, query string, or kind. Returns up to `limit` matching entries (most-recent first).",
  examples: [
    [
      {
        input: { tags: ["preference"], limit: 5 },
        output: { entries: [] },
        explanation: "",
      },
    ],
  ],
  schema: z.object({
    tags: z.array(z.string()).optional(),
    query: z.string().optional(),
    kinds: z.array(z.enum(["observation", "summary", "user_note", "outcome"])).optional(),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  handler: async (agent, input) => {
    const { memory } = ctxOrThrow(agent);
    const entries = await memory.recall(input);
    return { entries };
  },
};

// =============================================================================
// Soul actions — user-owned personality
// =============================================================================

export const agentReadSoul: Action = {
  name: "AGENT_READ_SOUL",
  similes: ["read my personality", "what's my soul", "show soul.md"],
  description:
    "Read the current contents of soul.md (the user-authored personality file). The agent should reference this when reasoning about user preferences.",
  examples: [[{ input: {}, output: { content: "# Agent soul\n..." }, explanation: "" }]],
  schema: z.object({}),
  handler: async (agent) => {
    const { soul } = ctxOrThrow(agent);
    const content = await soul.read();
    return { path: soul.path, content };
  },
};

export const agentProposeSoulEdit: Action = {
  name: "AGENT_PROPOSE_SOUL_EDIT",
  similes: ["suggest soul change", "propose personality update"],
  description:
    "Propose an edit to soul.md. This action does NOT apply the edit — soul.md is the user's space, not the agent's. Returns the proposed new content for the user to review and apply manually (or for a host process to gate behind a confirm prompt).",
  examples: [
    [
      {
        input: {
          reason: "I've noticed the user always asks me to swap on Soroswap, never Phoenix.",
          newContent: "# Agent soul\n\n... (with a 'prefer Soroswap' line added)",
        },
        output: { proposed: true, requiresConfirmation: true },
        explanation: "",
      },
    ],
  ],
  schema: z.object({
    reason: z.string().describe("Why the edit is being proposed."),
    newContent: z.string().describe("The full proposed new soul.md content."),
  }),
  handler: async (agent, input) => {
    const { soul } = ctxOrThrow(agent);
    const current = await soul.read();
    return {
      proposed: true,
      requiresConfirmation: true,
      reason: input.reason,
      currentLength: current.length,
      newLength: input.newContent.length,
      diff: simpleDiff(current, input.newContent),
      // The host process (or user) must call soul.applyEdit(newContent, {confirmed:true})
      // explicitly. We don't apply here.
    };
  },
};

function simpleDiff(a: string, b: string): { addedLines: number; removedLines: number } {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  return {
    addedLines: Math.max(0, bLines.length - aLines.length),
    removedLines: Math.max(0, aLines.length - bLines.length),
  };
}

// =============================================================================
// Standing-goal actions
// =============================================================================

export const agentAddStandingGoal: Action = {
  name: "AGENT_ADD_STANDING_GOAL",
  similes: ["watch and act", "monitor", "keep checking", "schedule recurring"],
  description:
    "Add a standing goal — a 'watch X and do Y' instruction the agent will re-evaluate on every heartbeat. Use intervalMs to control cadence (e.g. 300000 = every 5 min). Set expiresAt to auto-stop the goal at a future timestamp.",
  examples: [
    [
      {
        input: {
          goal: "Watch Reflector XLM/USD. If price < $0.10, swap my XLM to USDC.",
          intervalMs: 300000,
          tags: ["trading"],
        },
        output: { id: "sg_..." },
        explanation: "Trailing-stop pattern",
      },
    ],
  ],
  schema: z.object({
    goal: z.string().min(10).max(2000),
    intervalMs: z.number().int().min(60_000).max(7 * 24 * 60 * 60 * 1000).describe("Min 1 minute, max 7 days."),
    expiresAt: z.number().int().optional(),
    tags: z.array(z.string()).optional(),
  }),
  handler: async (agent, input) => {
    const { goals } = ctxOrThrow(agent);
    const sg = await goals.add({
      goal: input.goal as string,
      intervalMs: input.intervalMs as number,
      expiresAt: input.expiresAt as number | undefined,
      tags: input.tags as string[] | undefined,
    });
    return { id: sg.id, createdAt: sg.createdAt };
  },
};

export const agentListStandingGoals: Action = {
  name: "AGENT_LIST_STANDING_GOALS",
  similes: ["my standing goals", "what am I watching", "show recurring tasks"],
  description: "List all active standing goals. Filter by tags or `activeOnly` to skip expired ones.",
  examples: [[{ input: { activeOnly: true }, output: { goals: [] }, explanation: "" }]],
  schema: z.object({
    tags: z.array(z.string()).optional(),
    activeOnly: z.boolean().default(true),
  }),
  handler: async (agent, input) => {
    const { goals } = ctxOrThrow(agent);
    const list = await goals.list(input);
    return { count: list.length, goals: list };
  },
};

export const agentRemoveStandingGoal: Action = {
  name: "AGENT_REMOVE_STANDING_GOAL",
  similes: ["stop watching", "cancel standing goal", "delete recurring task"],
  description: "Remove a standing goal by id.",
  examples: [[{ input: { id: "sg_..." }, output: { removed: true }, explanation: "" }]],
  schema: z.object({ id: z.string() }),
  handler: async (agent, input) => {
    const { goals } = ctxOrThrow(agent);
    const removed = await goals.remove(input.id);
    return { removed };
  },
};
