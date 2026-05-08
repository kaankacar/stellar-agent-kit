import "dotenv/config";
/**
 * Heartbeat — evaluates standing goals on a schedule.
 *
 * Run as a separate process (cron, systemd, or just `npm run heartbeat &` in
 * a tmux pane). Each goal is re-evaluated every `intervalMs` defined when the
 * goal was added. Results are written back into the goal record so the next
 * iteration sees prior context.
 */
import { runOnce } from "@stellar-agent-kit/all/runner";
import { buildAgent, buildSystemPrompt } from "./lib/agent";

const HEARTBEAT_INTERVAL_MS = 60_000; // poll for due goals every minute

async function main() {
  const bundle = await buildAgent();
  console.log(
    `🫀 heartbeat started (${bundle.network}) — wallet ${bundle.agent.wallet.publicKey.slice(0, 8)}…\n` +
      `   Polling every ${HEARTBEAT_INTERVAL_MS / 1000}s for due standing goals.\n` +
      `   Press Ctrl+C to stop.\n`,
  );

  let stopped = false;
  const stop = (signal: string) => {
    if (stopped) return;
    console.log(`\n[${signal}] heartbeat stopping...`);
    stopped = true;
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  // Drain at startup, then loop. Inner await keeps each tick serial — long
  // standing goals can't overlap with the next tick.
  while (!stopped) {
    const due = await bundle.goals.due();
    for (const sg of due) {
      if (stopped) break;
      console.log(`[${new Date().toISOString()}] firing standing goal ${sg.id}: ${sg.goal}`);
      try {
        const result = await runOnce({
          agent: bundle.agent,
          llm: bundle.llm,
          goal: sg.goal,
          systemPrompt: await buildSystemPrompt(bundle),
          safety: bundle.safety,
          resumeFromState: false, // standing goals are stateless re-evaluations
          onEvent: (e) => {
            if (e.type === "tool.call") console.log(`  → ${e.actionName}`);
            if (e.type === "tool.blocked") console.log(`  ✕ ${e.reason}`);
          },
        });
        await bundle.goals.markRun(sg.id, result.text);
        console.log(`  ✓ ${result.finishReason}`);
      } catch (err) {
        console.error(`  ✕ heartbeat error for ${sg.id}: ${(err as Error).message}`);
      }
    }
    if (stopped) break;
    // Sleep with cancellation: bail early if SIGINT fires mid-sleep
    const sleepMs = HEARTBEAT_INTERVAL_MS;
    const tickStart = Date.now();
    while (!stopped && Date.now() - tickStart < sleepMs) {
      await new Promise((r) => setTimeout(r, Math.min(500, sleepMs - (Date.now() - tickStart))));
    }
  }
  console.log("✓ heartbeat stopped cleanly.");
}

main().catch((err) => {
  console.error("[heartbeat fatal]", (err as Error).message);
  process.exit(1);
});
