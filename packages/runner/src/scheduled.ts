import { runOnce } from "./loop";
import type { AutonomousRunOptions, RunnerEvent } from "./types";

export interface ScheduledRunOptions extends AutonomousRunOptions {
  /** How often the runner re-evaluates the goal. Min 30s. */
  intervalMs: number;
  /** Optional cap on total iterations. Undefined = run forever (until process exit). */
  maxIterations?: number;
  /** Stop the loop when this signal aborts. */
  signal?: AbortSignal;
}

export interface ScheduledRunHandle {
  /** Stop the heartbeat. */
  stop(): void;
  /** Promise that resolves when the loop exits (signal aborted, max iterations reached, or fatal error). */
  done: Promise<{ iterations: number; events: RunnerEvent[] }>;
}

/**
 * Start a heartbeat loop that re-runs the agent's goal every `intervalMs`.
 * Conversation state persists between iterations via the agent's KVStore (or
 * the override `state`), so the agent stays coherent across firings.
 *
 * Best for "watch X and act on Y" patterns. For example: "Watch Reflector
 * XLM/USD; if price < $0.10, swap." The agent re-evaluates each interval and
 * decides whether to act.
 *
 * Returns a handle. Call `handle.stop()` to terminate, await `handle.done`
 * to know when it's actually exited.
 */
export function scheduledRun(opts: ScheduledRunOptions): ScheduledRunHandle {
  if (opts.intervalMs < 30_000) {
    throw new Error("scheduledRun: intervalMs must be >= 30_000 (30 seconds).");
  }

  let iterations = 0;
  const events: RunnerEvent[] = [];
  let stopped = false;
  let resolveDone!: (v: { iterations: number; events: RunnerEvent[] }) => void;
  const done = new Promise<{ iterations: number; events: RunnerEvent[] }>((r) => {
    resolveDone = r;
  });

  const tick = async () => {
    if (stopped) return;
    if (opts.maxIterations !== undefined && iterations >= opts.maxIterations) {
      stop();
      return;
    }
    iterations++;
    try {
      const result = await runOnce({ ...opts });
      events.push(...result.events);
    } catch (err) {
      const evt: RunnerEvent = {
        type: "tool.blocked",
        actionName: "<scheduledRun>",
        reason: `Iteration error: ${(err as Error).message}`,
      };
      events.push(evt);
      opts.onEvent?.(evt);
    }
    if (!stopped) {
      timer = setTimeout(tick, opts.intervalMs);
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    resolveDone({ iterations, events });
  };

  if (opts.signal) {
    opts.signal.addEventListener("abort", stop, { once: true });
  }

  // Kick off the first iteration immediately, then space subsequent ones.
  timer = setTimeout(tick, 0);

  return { stop, done };
}
