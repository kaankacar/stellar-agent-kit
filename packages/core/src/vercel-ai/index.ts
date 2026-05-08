import type { Tool } from "ai";
import type { StellarAgentKit } from "../agent";
import type { Action } from "../types/action";
import { executeAction } from "../utils/actionExecutor";

/**
 * Build Vercel AI SDK tools from the agent's action surface.
 *
 * NOTE: `ai` is loaded lazily so consumers that don't use the Vercel AI SDK
 * don't need it installed. The `import type` above is stripped at build time;
 * only the runtime `await import(...)` below stays.
 *
 * Call as `await createVercelAITools(agent, actions)`.
 */
export async function createVercelAITools(
  agent: StellarAgentKit,
  actions: Action[],
): Promise<Record<string, Tool>> {
  const mod = await import("ai");
  const tools: Record<string, Tool> = {};

  if (actions.length > 128) {
    console.warn(
      `Too many actions provided. Vercel AI SDK limits to 128. ${actions.length - 128} will be dropped.`,
    );
  }

  for (const action of actions.slice(0, 128)) {
    tools[action.name] = mod.tool({
      description: buildDescription(action),
      parameters: action.schema,
      execute: (params: Record<string, unknown>) => executeAction(action, agent, params),
    });
  }

  return tools;
}

function buildDescription(action: Action): string {
  const examples = action.examples
    .flat()
    .slice(0, 2)
    .map(
      (ex) =>
        `Input: ${JSON.stringify(ex.input)} Output: ${JSON.stringify(ex.output)} (${ex.explanation})`,
    )
    .join(" | ");
  const similes = action.similes.length ? ` Aliases: ${action.similes.join(", ")}.` : "";
  const examplesText = examples ? ` Examples: ${examples}` : "";
  return `${action.description}${similes}${examplesText}`.slice(0, 1023);
}
