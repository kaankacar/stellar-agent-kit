import "dotenv/config";
/**
 * Personal Stellar agent — interactive terminal mode WITH in-process heartbeat.
 *
 * Conversational REPL: type freely, the agent uses Stellar tools, web search,
 * and its own memory to answer.
 *
 * In-process heartbeat: standing goals (added via AGENT_ADD_STANDING_GOAL) are
 * re-evaluated on a polling loop while you're using the REPL. Results print
 * above the prompt without interrupting your typing.
 *
 * If you'd rather run the heartbeat as a separate process (e.g. for cron /
 * systemd deployment, or to keep the REPL fully quiet), set
 * STELLAR_AGENT_HEARTBEAT=off and run `npm run heartbeat` in another terminal.
 */
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { autonomousRun, runOnce } from "@stellar-agent-kit/all/runner";
import { buildAgent, buildSystemPrompt, printBanner } from "./lib/agent";

const HEARTBEAT_POLL_MS = Number(process.env.STELLAR_AGENT_HEARTBEAT_POLL_MS ?? 60_000);

async function main() {
  const bundle = await buildAgent();
  printBanner(bundle);

  // ---------------------------------------------------------------------------
  // In-process heartbeat — runs alongside the REPL.
  // Skipped if STELLAR_AGENT_HEARTBEAT=off (e.g. when the user wants to run a
  // separate `npm run heartbeat` process and keep this terminal silent).
  // ---------------------------------------------------------------------------
  let heartbeatStopped = false;
  const heartbeatEnabled = process.env.STELLAR_AGENT_HEARTBEAT !== "off";
  if (heartbeatEnabled) {
    console.log(
      `🫀 heartbeat: every ${Math.round(HEARTBEAT_POLL_MS / 1000)}s (set STELLAR_AGENT_HEARTBEAT=off to disable in this process)\n`,
    );
    void runHeartbeatLoop(bundle, () => heartbeatStopped);
  }

  // ---------------------------------------------------------------------------
  // Interactive REPL
  // ---------------------------------------------------------------------------
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const goal = (await rl.question("you ▸ ")).trim();
      if (!goal) continue;
      if (goal === "exit" || goal === "quit") break;
      if (goal === "/soul") {
        console.log("\n" + (await bundle.soul.read()) + "\n");
        continue;
      }
      if (goal === "/memory") {
        const mem = await bundle.memory.recall({ limit: 20 });
        console.log(
          "\n" + (mem.length ? mem.map((e) => `  [${e.kind}] ${e.content}`).join("\n") : "  (empty)") + "\n",
        );
        continue;
      }
      if (goal === "/goals") {
        const list = await bundle.goals.list({ activeOnly: true });
        console.log(
          "\n" +
            (list.length
              ? list
                  .map((g) => `  ${g.id}: ${g.goal} (every ${Math.round(g.intervalMs / 60_000)}min)`)
                  .join("\n")
              : "  (no standing goals — say e.g. 'every 5 minutes, check ...' to add one)") +
            "\n",
        );
        continue;
      }

      const result = await autonomousRun({
        agent: bundle.agent,
        llm: bundle.llm,
        goal,
        loop: { maxIterations: 12 },
        systemPrompt: await buildSystemPrompt(bundle),
        safety: bundle.safety,
        onEvent: (e) => {
          if (e.type === "tool.call") console.log(`  → ${e.actionName}`);
          if (e.type === "tool.blocked") console.log(`  ✕ blocked: ${e.actionName} — ${e.reason}`);
          if (e.type === "human.requested") console.log(`  ? human confirm needed: ${e.request.actionName}`);
        },
      });
      console.log(`\nagent ▸ ${result.finalText}\n`);
    }
  } finally {
    heartbeatStopped = true;
    rl.close();
  }
}

/**
 * Background heartbeat loop. Keeps polling for due standing goals and runs
 * them serially so they can't overlap with each other or with REPL turns.
 */
async function runHeartbeatLoop(
  bundle: Awaited<ReturnType<typeof buildAgent>>,
  isStopped: () => boolean,
): Promise<void> {
  // First poll happens after one full interval — gives the user a chance to
  // type a prompt without immediate heartbeat output.
  await sleepCancellable(HEARTBEAT_POLL_MS, isStopped);
  while (!isStopped()) {
    try {
      const due = await bundle.goals.due();
      for (const sg of due) {
        if (isStopped()) break;
        try {
          // Print above the prompt so the user can see firings live.
          process.stdout.write(`\n  🫀 [${new Date().toISOString().slice(11, 19)}] firing: ${sg.goal.slice(0, 80)}\n`);
          const result = await runOnce({
            agent: bundle.agent,
            llm: bundle.llm,
            goal: sg.goal,
            systemPrompt: await buildSystemPrompt(bundle),
            safety: bundle.safety,
            resumeFromState: false,
          });
          await bundle.goals.markRun(sg.id, result.text);
          if (result.text) {
            process.stdout.write(
              `  🫀 result: ${result.text.slice(0, 200)}${result.text.length > 200 ? "…" : ""}\n`,
            );
          }
          process.stdout.write("you ▸ "); // re-render prompt
        } catch (err) {
          process.stdout.write(`  🫀 error for ${sg.id}: ${(err as Error).message}\n`);
        }
      }
    } catch (err) {
      console.error("heartbeat poll failed:", (err as Error).message);
    }
    await sleepCancellable(HEARTBEAT_POLL_MS, isStopped);
  }
}

async function sleepCancellable(ms: number, isStopped: () => boolean): Promise<void> {
  const start = Date.now();
  while (!isStopped() && Date.now() - start < ms) {
    await new Promise((r) => setTimeout(r, Math.min(500, ms - (Date.now() - start))));
  }
}

main().catch((err) => {
  if ((err as Error).name === "AbortError" || (err as { code?: string }).code === "ABORT_ERR") {
    console.log("\nbye 👋");
    process.exit(0);
  }
  console.error("\n[error]", (err as Error).message);
  process.exit(1);
});
