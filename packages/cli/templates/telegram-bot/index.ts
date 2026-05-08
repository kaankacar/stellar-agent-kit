import "dotenv/config";
/**
 * Personal Stellar agent over Telegram.
 *
 * Strict allowlist: only responds to TELEGRAM_USER_ID. All other senders are
 * silently ignored (no replies, no logs visible to them).
 *
 * The bot also runs the heartbeat in-process — standing goals are checked
 * every minute and fired when due. Results are pushed to the user as DMs.
 */
import { Telegraf } from "telegraf";
import { autonomousRun, runOnce } from "@stellar-agent-kit/all/runner";
import { buildAgent, buildSystemPrompt, printBanner } from "./lib/agent";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;
if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN required");
if (!TELEGRAM_USER_ID || !/^\d+$/.test(TELEGRAM_USER_ID)) {
  throw new Error("TELEGRAM_USER_ID required (numeric).");
}
const allowedUserId = Number(TELEGRAM_USER_ID);
const HEARTBEAT_INTERVAL_MS = 60_000;

async function main() {
  const bundle = await buildAgent();
  const bot = new Telegraf(TELEGRAM_BOT_TOKEN!);
  printBanner(bundle, allowedUserId);

  const guard = (ctx: Parameters<Parameters<typeof bot.on>[1]>[0]) => {
    const fromId = ctx.from?.id;
    if (!fromId || fromId !== allowedUserId) {
      console.warn(`[ignored] message from unauthorized user ${fromId ?? "unknown"}`);
      return false;
    }
    return true;
  };

  bot.start(async (ctx) => {
    if (!guard(ctx)) return;
    await ctx.reply(
      `🌟 stellar-agent online (${bundle.network}).\nWallet: \`${bundle.agent.wallet.publicKey}\`\n\nSlash commands: /soul /memory /goals /balance`,
      { parse_mode: "Markdown" },
    );
  });

  bot.command("soul", async (ctx) => {
    if (!guard(ctx)) return;
    const content = await bundle.soul.read();
    await ctx.reply(content || "(empty soul.md)");
  });

  bot.command("memory", async (ctx) => {
    if (!guard(ctx)) return;
    const mem = await bundle.memory.recall({ limit: 10 });
    await ctx.reply(
      mem.length ? mem.map((e) => `[${e.kind}] ${e.content}`).join("\n\n") : "(no memory yet)",
    );
  });

  bot.command("goals", async (ctx) => {
    if (!guard(ctx)) return;
    const list = await bundle.goals.list({ activeOnly: true });
    await ctx.reply(
      list.length
        ? list.map((g) => `${g.id}\n${g.goal}\n(every ${Math.round(g.intervalMs / 60_000)}min)`).join("\n\n")
        : "(no standing goals)",
    );
  });

  bot.command("balance", async (ctx) => {
    if (!guard(ctx)) return;
    const action = bundle.agent.actions.find((a) => a.name === "ASSET_GET_BALANCE");
    if (!action) return ctx.reply("ASSET_GET_BALANCE not registered");
    const result = await action.handler(bundle.agent, {});
    await ctx.reply("```json\n" + JSON.stringify(result, null, 2) + "\n```", {
      parse_mode: "Markdown",
    });
  });

  bot.on("text", async (ctx) => {
    if (!guard(ctx)) return;
    const goal = ctx.message.text;
    await ctx.sendChatAction("typing");
    try {
      const result = await autonomousRun({
        agent: bundle.agent,
        llm: bundle.llm,
        goal,
        loop: { maxIterations: 8 },
        systemPrompt: await buildSystemPrompt(bundle, ctx.from.first_name),
        safety: bundle.safety,
        onEvent: async (e) => {
          if (e.type === "tool.call") await ctx.sendChatAction("typing").catch(() => {});
          if (e.type === "tool.blocked") {
            await ctx.reply(`✕ blocked: ${e.actionName} — ${e.reason}`).catch(() => {});
          }
        },
      });
      const reply = result.finalText || `(no text — ${result.succeeded} actions, ${result.blocked} blocked)`;
      await ctx.reply(reply.slice(0, 4000));
    } catch (err) {
      await ctx.reply(`Error: ${(err as Error).message.slice(0, 500)}`);
    }
  });

  // Heartbeat — runs in-process alongside the bot listener. Uses a recursive
  // setTimeout instead of setInterval so a long-running standing goal can't
  // overlap with itself when the next tick fires.
  let heartbeatStopped = false;
  const tickHeartbeat = async (): Promise<void> => {
    if (heartbeatStopped) return;
    try {
      const due = await bundle.goals.due();
      for (const sg of due) {
        if (heartbeatStopped) break;
        try {
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
            await bot.telegram.sendMessage(
              allowedUserId,
              `🫀 standing goal fired: ${sg.goal.slice(0, 80)}...\n\n${result.text.slice(0, 3500)}`,
            );
          }
        } catch (err) {
          console.error(`heartbeat error for ${sg.id}:`, (err as Error).message);
        }
      }
    } catch (err) {
      console.error("heartbeat tick failed:", (err as Error).message);
    }
    if (!heartbeatStopped) {
      setTimeout(tickHeartbeat, HEARTBEAT_INTERVAL_MS);
    }
  };
  setTimeout(tickHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Graceful shutdown — Telegram needs us to call bot.stop() so it sends a
  // proper getUpdates close to the API. Without this, Ctrl+C orphans the
  // long-poll connection and the next start is rejected with 409 Conflict
  // for ~30 seconds.
  const shutdown = (signal: string) => {
    console.log(`\n[${signal}] stopping bot...`);
    heartbeatStopped = true;
    bot.stop(signal);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  await bot.launch();
}

main().catch((err) => {
  console.error("[fatal]", (err as Error).message);
  process.exit(1);
});
