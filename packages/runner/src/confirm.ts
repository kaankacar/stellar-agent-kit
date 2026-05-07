import type { ConfirmRequest } from "./types";

/**
 * Default human-confirmation prompt for terminal use. Reads y/N from stdin.
 *
 * Override via `safety.confirm` for non-terminal contexts (web UI, Slack bot,
 * always-true / always-false in tests).
 */
export async function defaultConfirm(request: ConfirmRequest): Promise<boolean> {
  // Lazy-import readline so this module stays bundler-friendly in non-Node envs.
  const readline = await import("node:readline/promises");
  const { stdin, stdout } = await import("node:process");

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `\n[runner] Confirm ${request.actionName}? Reason: ${request.reason}\nInput: ${JSON.stringify(
        request.input,
        null,
        2,
      )}\nProceed? [y/N] `,
    );
    return answer.trim().toLowerCase().startsWith("y");
  } finally {
    rl.close();
  }
}

/** Convenience confirm functions for tests and non-interactive contexts. */
export const alwaysApprove = async (): Promise<boolean> => true;
export const alwaysReject = async (): Promise<boolean> => false;
