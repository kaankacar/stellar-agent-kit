import type { StellarAgentKit, KVStore } from "@stellar-agent-kit/core";
import type { LanguageModelV1 } from "ai";

export type StellarNetwork = "testnet" | "mainnet" | "futurenet";

/**
 * Cumulative spend cap for a specific asset over a rolling time window.
 * Amounts are atomic-unit decimal strings (i128 for Soroban, stroops for classic).
 *
 * `asset` matches the action's input field (`assetCode` for classic, contract id
 * for SAC/Soroban tokens). The runner inspects each tool call's input and sums
 * spends per `asset` over `windowMs` from the agent's KV store.
 */
export interface SpendCap {
  asset: string;
  limit: string;
  windowMs: number;
}

export interface HumanThreshold {
  asset: string;
  amount: string;
}

export interface ConfirmRequest {
  actionName: string;
  input: Record<string, unknown>;
  reason: string;
}

export interface SafetyConfig {
  /** Only these action names may run. If undefined, all actions on the agent are allowed. */
  actionAllowlist?: string[];
  /** These action names never run, even if on the allowlist. */
  actionDenylist?: string[];
  /** Per-asset cumulative spend caps. */
  spendCaps?: SpendCap[];
  /** Hard refuse the run if the agent's network isn't on this list. */
  network?: { allow: StellarNetwork[] };
  /** Actions matching these rules require human confirmation before submission. */
  requireHumanFor?: {
    actionNames?: string[];
    aboveAtomicAmount?: HumanThreshold[];
  };
  /** Override default readline-based confirmation prompt. */
  confirm?: (request: ConfirmRequest) => Promise<boolean>;
  /** If true, simulate-only — state-changing actions return `{dryRun:true, ...}` and never invoke handlers. */
  dryRun?: boolean;
}

export type RunnerEvent =
  | { type: "iteration.start"; iteration: number }
  | { type: "tool.call"; actionName: string; input: Record<string, unknown> }
  | { type: "tool.blocked"; actionName: string; reason: string; details?: Record<string, unknown> }
  | { type: "tool.result"; actionName: string; result: Record<string, unknown> }
  | { type: "human.requested"; request: ConfirmRequest }
  | { type: "human.rejected"; request: ConfirmRequest }
  | { type: "iteration.end"; iteration: number; finishReason: string }
  | { type: "run.done"; iterations: number };

export interface AutonomousRunOptions {
  agent: StellarAgentKit;
  llm: LanguageModelV1;
  goal: string;
  loop?: {
    maxIterations?: number;
    intervalMs?: number;
  };
  safety?: SafetyConfig;
  state?: KVStore;
  systemPrompt?: string;
  onEvent?: (event: RunnerEvent) => void;
}

export interface AutonomousRunResult {
  iterations: number;
  finalText: string;
  events: RunnerEvent[];
  blocked: number;
  succeeded: number;
}

export interface RunOnceOptions extends AutonomousRunOptions {
  /** Override stored conversation messages for one-shot runs. */
  resumeFromState?: boolean;
  /**
   * Max LLM steps within a single runOnce. Defaults to 30 — enough headroom
   * for the LLM to chain multiple tools (e.g. quote → swap → confirm) and
   * still produce a summary. Set to 1 only if you specifically want a no-tool
   * single-pass evaluation.
   */
  maxSteps?: number;
}

export interface RunOnceResult {
  finishReason: string;
  text: string;
  events: RunnerEvent[];
}
