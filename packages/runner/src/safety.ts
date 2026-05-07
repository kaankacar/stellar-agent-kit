import { Networks } from "@stellar/stellar-sdk";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";
import type {
  ConfirmRequest,
  HumanThreshold,
  RunnerEvent,
  SafetyConfig,
  StellarNetwork,
} from "./types";
import { SpendTracker } from "./spendTracker";
import { defaultConfirm } from "./confirm";

/**
 * Map a Stellar SDK passphrase to the runner's StellarNetwork tag.
 */
export function networkFromPassphrase(passphrase: string): StellarNetwork {
  if (passphrase === Networks.PUBLIC) return "mainnet";
  if (passphrase === Networks.FUTURENET) return "futurenet";
  return "testnet";
}

/**
 * Throws at construction time if the agent's wallet is on a network the safety
 * config disallows. Failing fast is the point — we never want to discover this
 * after the LLM has already issued a tool call.
 */
export function validateNetworkSandbox(agent: StellarAgentKit, safety?: SafetyConfig): void {
  if (!safety?.network?.allow) return;
  const current = networkFromPassphrase(agent.config.networkPassphrase);
  if (!safety.network.allow.includes(current)) {
    const err = new Error(
      `Network sandbox violation: agent is on ${current} but safety.network.allow = [${safety.network.allow.join(", ")}]`,
    );
    (err as Error & { code: string }).code = "NETWORK_SANDBOX_VIOLATION";
    throw err;
  }
}

export interface SafetyDecision {
  /** True iff the call is allowed to proceed to the action handler. */
  allowed: boolean;
  /** Structured reason an LLM-readable error if `allowed === false`. */
  blockReason?: string;
  blockCode?: string;
  blockDetails?: Record<string, unknown>;
}

/**
 * Pre-flight safety checks for a single LLM-emitted tool call.
 * Order matters: cheaper / more-protective checks first.
 */
export async function checkSafety(
  action: Action,
  input: Record<string, unknown>,
  safety: SafetyConfig | undefined,
  spendTracker: SpendTracker | undefined,
  emit: (event: RunnerEvent) => void,
): Promise<SafetyDecision> {
  if (!safety) return { allowed: true };

  // 1. Allowlist / denylist
  if (safety.actionDenylist?.includes(action.name)) {
    const reason = `Action ${action.name} is on the denylist.`;
    emit({ type: "tool.blocked", actionName: action.name, reason });
    return { allowed: false, blockReason: reason, blockCode: "BLOCKED_BY_DENYLIST" };
  }
  if (safety.actionAllowlist && !safety.actionAllowlist.includes(action.name)) {
    const reason = `Action ${action.name} is not on the allowlist.`;
    emit({ type: "tool.blocked", actionName: action.name, reason });
    return {
      allowed: false,
      blockReason: reason,
      blockCode: "BLOCKED_BY_ALLOWLIST",
      blockDetails: { allowed: safety.actionAllowlist },
    };
  }

  // 2. Spend caps. We inspect the input for `assetCode` (classic) or `asset`
  //    (Soroban contract id) plus an `amount` field. If neither is present,
  //    spend caps don't apply to this action.
  if (spendTracker && safety.spendCaps && safety.spendCaps.length > 0) {
    const spend = extractSpend(input);
    if (spend) {
      const result = await spendTracker.wouldExceed(spend.asset, spend.amount);
      if (result.exceeded) {
        const reason = `Spend cap exceeded for ${spend.asset}: would-spend=${spend.amount} current=${result.current ?? "0"} limit=${result.cap!.limit}`;
        emit({
          type: "tool.blocked",
          actionName: action.name,
          reason,
          details: { spend, cap: result.cap },
        });
        return {
          allowed: false,
          blockReason: reason,
          blockCode: "BLOCKED_BY_SPEND_CAP",
          blockDetails: { asset: spend.asset, attempted: spend.amount, limit: result.cap!.limit },
        };
      }
    }
  }

  // 3. Human confirmation
  if (safety.requireHumanFor) {
    if (humanRequired(action.name, input, safety.requireHumanFor)) {
      const request: ConfirmRequest = {
        actionName: action.name,
        input,
        reason: "Confirmation required by safety config.",
      };
      emit({ type: "human.requested", request });
      const confirmFn = safety.confirm ?? defaultConfirm;
      const ok = await confirmFn(request);
      if (!ok) {
        emit({ type: "human.rejected", request });
        return {
          allowed: false,
          blockReason: "Human declined confirmation.",
          blockCode: "REJECTED_BY_HUMAN",
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Extract `(asset, amount)` from an action's input. Best-effort — only used for
 * spend-cap accounting. If no recognizable shape, returns null and the call is
 * not subject to spend-cap enforcement (safety still falls through to allowlist
 * + human-confirmation layers).
 */
function extractSpend(input: Record<string, unknown>): { asset: string; amount: string } | null {
  const amount =
    typeof input.amount === "string"
      ? input.amount
      : typeof input.amountIn === "string"
        ? input.amountIn
        : typeof input.fromAmount === "string"
          ? input.fromAmount
          : null;
  if (!amount) return null;
  const asset =
    typeof input.assetCode === "string"
      ? input.assetCode
      : typeof input.assetIn === "string"
        ? input.assetIn
        : typeof input.fromCurrency === "string"
          ? input.fromCurrency
          : typeof input.asset === "string"
            ? input.asset
            : null;
  if (!asset) return null;
  return { asset, amount };
}

function humanRequired(
  actionName: string,
  input: Record<string, unknown>,
  rules: NonNullable<SafetyConfig["requireHumanFor"]>,
): boolean {
  if (rules.actionNames?.includes(actionName)) return true;
  if (rules.aboveAtomicAmount && rules.aboveAtomicAmount.length > 0) {
    const spend = extractSpend(input);
    if (spend) {
      for (const t of rules.aboveAtomicAmount) {
        if (t.asset === spend.asset && BigInt(spend.amount) >= BigInt(t.amount)) return true;
      }
    }
  }
  return false;
}

/**
 * Internal helper to surface a `(asset, amount)` pair for accountancy after a
 * successful action submission.
 */
export function spendForAction(input: Record<string, unknown>): { asset: string; amount: string } | null {
  return extractSpend(input);
}

/**
 * Threshold helpers for ergonomic config.
 */
export const SpendCap = {
  daily(opts: { asset: string; limit: string }) {
    return { asset: opts.asset, limit: opts.limit, windowMs: 24 * 60 * 60 * 1000 };
  },
  hourly(opts: { asset: string; limit: string }) {
    return { asset: opts.asset, limit: opts.limit, windowMs: 60 * 60 * 1000 };
  },
  perWindow(opts: { asset: string; limit: string; windowMs: number }) {
    return opts;
  },
};

export const TestnetSandbox: NonNullable<SafetyConfig["network"]> = { allow: ["testnet"] };
export const MainnetSandbox: NonNullable<SafetyConfig["network"]> = { allow: ["mainnet"] };
