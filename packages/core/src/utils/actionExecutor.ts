import type { Action } from "../types/action";
import type { StellarAgentKit } from "../agent";

export async function executeAction(
  action: Action,
  agent: StellarAgentKit,
  rawInput: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const parsed = action.schema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      error: "VALIDATION_ERROR",
      issues: parsed.error.issues,
    };
  }
  try {
    return await action.handler(agent, parsed.data as Record<string, unknown>);
  } catch (err) {
    const e = err as Error & { code?: string };
    return {
      status: "error",
      error: e.code ?? "HANDLER_ERROR",
      message: e.message,
    };
  }
}
