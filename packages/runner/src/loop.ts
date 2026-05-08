import { tool, generateText, type Tool, type CoreMessage } from "ai";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";
import { executeAction, InMemoryKVStore } from "@stellar-agent-kit/core";
import type {
  AutonomousRunOptions,
  AutonomousRunResult,
  RunOnceOptions,
  RunOnceResult,
  RunnerEvent,
} from "./types";
import { checkSafety, validateNetworkSandbox, spendForAction } from "./safety";
import { SpendTracker } from "./spendTracker";
import { dryRunStub, isReadOnlyAction } from "./dryRun";

const STATE_KEY = "runner:conversation:messages";

function buildSystemPrompt(opts: AutonomousRunOptions): string {
  if (opts.systemPrompt) return opts.systemPrompt;
  const pubkey = opts.agent.wallet.publicKey;
  const allowed = opts.safety?.actionAllowlist
    ? `You may only call: ${opts.safety.actionAllowlist.join(", ")}.`
    : "All registered actions are available.";
  const sandbox = opts.safety?.network?.allow
    ? `Network sandbox: only ${opts.safety.network.allow.join(", ")} is permitted.`
    : "";
  const dryRun = opts.safety?.dryRun
    ? "DRY-RUN MODE: state-changing actions are intercepted and not submitted."
    : "";
  return [
    `You are a Stellar/Soroban operator. The agent's wallet is ${pubkey}.`,
    "Use tools to act on Stellar. Always describe what you'll do before doing it.",
    "If a tool call is blocked by safety, respect the block and try a different approach (e.g. lower amount, ask the user).",
    "When the goal is satisfied or you cannot proceed safely, stop and explain.",
    allowed,
    sandbox,
    dryRun,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildToolMap(
  agent: StellarAgentKit,
  opts: AutonomousRunOptions,
  emit: (event: RunnerEvent) => void,
  spendTracker: SpendTracker | undefined,
): Record<string, Tool> {
  const allActions = opts.agent.actions;
  // Pre-filter the allowlist to limit how many tools the LLM even sees, but the
  // safety check still runs at call-time as a defence-in-depth gate.
  const exposed = opts.safety?.actionAllowlist
    ? allActions.filter((a) => opts.safety!.actionAllowlist!.includes(a.name))
    : allActions;

  const tools: Record<string, Tool> = {};
  for (const action of exposed.slice(0, 128)) {
    tools[action.name] = tool({
      description: buildDescription(action),
      parameters: action.schema,
      execute: async (params: Record<string, unknown>) => {
        emit({ type: "tool.call", actionName: action.name, input: params });
        const decision = await checkSafety(action, params, opts.safety, spendTracker, emit);
        if (!decision.allowed) {
          return {
            status: "error",
            error: decision.blockCode,
            message: decision.blockReason,
            details: decision.blockDetails,
          };
        }

        if (opts.safety?.dryRun && !isReadOnlyAction(action.name)) {
          const stub = dryRunStub(action, params);
          emit({ type: "tool.result", actionName: action.name, result: stub });
          return stub;
        }

        const result = await executeAction(action, agent, params);
        // Record spend on success (heuristic: any non-error result).
        if (!("error" in result) && spendTracker) {
          const spend = spendForAction(params);
          if (spend) await spendTracker.record(spend.asset, spend.amount);
        }
        emit({ type: "tool.result", actionName: action.name, result });
        return result;
      },
    });
  }
  return tools;
}

function buildDescription(action: Action): string {
  const similes = action.similes.length ? ` Aliases: ${action.similes.join(", ")}.` : "";
  return `${action.description}${similes}`.slice(0, 1023);
}

/**
 * Conversation-state policy:
 *
 * - On a fresh state (or when `forceFresh`), seed with [system, user-goal].
 * - On resume, load prior messages, replace the leading system message with the
 *   current system prompt (since soul / memory / standing-goals may have
 *   changed since last run), and append the new user goal.
 *
 * This means subsequent `autonomousRun` / `runOnce` calls REUSE prior
 * assistant + tool turns (the agent stays coherent) but always see the new
 * user instruction. Prior to this fix, subsequent calls silently dropped the
 * new `opts.goal` because the seed-only branch was never taken.
 */
async function loadMessages(
  opts: AutonomousRunOptions,
  forceFresh = false,
): Promise<CoreMessage[]> {
  const store = opts.state ?? opts.agent.kvStore;
  const stored = forceFresh ? null : await store.get<CoreMessage[]>(STATE_KEY);
  if (!stored || stored.length === 0) {
    return [
      { role: "system", content: buildSystemPrompt(opts) },
      { role: "user", content: opts.goal },
    ];
  }
  // Replace the leading system message (if any) with the fresh one.
  const tail = stored[0]?.role === "system" ? stored.slice(1) : stored;
  return [
    { role: "system", content: buildSystemPrompt(opts) },
    ...tail,
    { role: "user", content: opts.goal },
  ];
}

async function saveMessages(opts: AutonomousRunOptions, messages: CoreMessage[]): Promise<void> {
  const store = opts.state ?? opts.agent.kvStore;
  await store.set(STATE_KEY, messages);
}

export async function autonomousRun(opts: AutonomousRunOptions): Promise<AutonomousRunResult> {
  validateNetworkSandbox(opts.agent, opts.safety);

  const events: RunnerEvent[] = [];
  const emit = (event: RunnerEvent) => {
    events.push(event);
    opts.onEvent?.(event);
  };

  const stateStore = opts.state ?? opts.agent.kvStore ?? new InMemoryKVStore();
  const spendTracker =
    opts.safety?.spendCaps && opts.safety.spendCaps.length > 0
      ? new SpendTracker(stateStore, opts.safety.spendCaps)
      : undefined;
  const tools = buildToolMap(opts.agent, opts, emit, spendTracker);

  const maxIterations = opts.loop?.maxIterations ?? 10;
  const intervalMs = opts.loop?.intervalMs ?? 0;

  const messages = await loadMessages(opts);
  let finalText = "";
  let blocked = 0;
  let succeeded = 0;
  let iterations = 0;

  for (let i = 0; i < maxIterations; i++) {
    iterations = i + 1;
    emit({ type: "iteration.start", iteration: iterations });
    const result = await generateText({
      model: opts.llm,
      messages,
      tools,
      maxSteps: 1,
    });
    if (result.text) finalText = result.text;
    messages.push(...(result.response.messages as CoreMessage[]));
    await saveMessages(opts, messages);

    emit({
      type: "iteration.end",
      iteration: iterations,
      finishReason: result.finishReason,
    });

    if (result.finishReason === "stop") break;
    if (intervalMs > 0 && i + 1 < maxIterations) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  for (const event of events) {
    if (event.type === "tool.blocked") blocked++;
    if (event.type === "tool.result") succeeded++;
  }

  emit({ type: "run.done", iterations });
  return { iterations, finalText, events, blocked, succeeded };
}

export async function runOnce(opts: RunOnceOptions): Promise<RunOnceResult> {
  validateNetworkSandbox(opts.agent, opts.safety);

  const events: RunnerEvent[] = [];
  const emit = (event: RunnerEvent) => {
    events.push(event);
    opts.onEvent?.(event);
  };

  const stateStore = opts.state ?? opts.agent.kvStore ?? new InMemoryKVStore();
  const spendTracker =
    opts.safety?.spendCaps && opts.safety.spendCaps.length > 0
      ? new SpendTracker(stateStore, opts.safety.spendCaps)
      : undefined;
  const tools = buildToolMap(opts.agent, opts, emit, spendTracker);

  // Stateless mode (resumeFromState:false) is for one-shot evaluations like
  // standing-goal heartbeats — they don't pollute or read the persistent
  // conversation. Stateful mode (default) loads-and-appends.
  const fresh = opts.resumeFromState === false;
  const messages = await loadMessages(opts, fresh);

  // maxSteps must be > 1 for the LLM to (a) call a tool, (b) read its result,
  // and (c) write a summary. With maxSteps:1 the heartbeat would announce
  // "firing" but never report the price/answer because the loop ended on the
  // tool call before a final assistant text was produced. 30 gives plenty of
  // headroom for multi-step workflows (quote → swap → confirm) inside a single
  // heartbeat firing.
  const maxSteps = opts.maxSteps ?? 30;

  emit({ type: "iteration.start", iteration: 1 });
  const result = await generateText({
    model: opts.llm,
    messages,
    tools,
    maxSteps,
  });
  messages.push(...(result.response.messages as CoreMessage[]));
  if (!fresh) {
    await saveMessages(opts, messages);
  }
  emit({ type: "iteration.end", iteration: 1, finishReason: result.finishReason });
  emit({ type: "run.done", iterations: 1 });
  return { finishReason: result.finishReason, text: result.text ?? "", events };
}
