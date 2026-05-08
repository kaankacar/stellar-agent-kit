/**
 * Personal Stellar agent — interactive terminal mode.
 *
 * Conversational. Type freely; the agent uses Stellar tools, web search, and
 * its own memory to answer. Soul.md is loaded into the system prompt every
 * turn. Standing goals run on a heartbeat (run `npm run heartbeat` separately).
 */
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { autonomousRun } from "@stellar-agent-kit/all/runner";
import { buildAgent, buildSystemPrompt } from "./lib/agent";

async function main() {
  const bundle = await buildAgent();
  console.log(
    `\n🌟 stellar-agent (${bundle.network}) — wallet ${bundle.agent.wallet.publicKey.slice(0, 8)}…${bundle.agent.wallet.publicKey.slice(-4)}\n` +
      `   Type your request, or 'exit' to quit. State persists in ./state/.\n`,
  );

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
        console.log("\n" + mem.map((e) => `  [${e.kind}] ${e.content}`).join("\n") + "\n");
        continue;
      }
      if (goal === "/goals") {
        const list = await bundle.goals.list({ activeOnly: true });
        console.log(
          "\n" + list.map((g) => `  ${g.id}: ${g.goal} (every ${Math.round(g.intervalMs / 60_000)}min)`).join("\n") + "\n",
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
    rl.close();
  }
}

main().catch((err) => {
  console.error("\n[error]", (err as Error).message);
  process.exit(1);
});
