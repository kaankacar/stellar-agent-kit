import { type Tool, tool } from "ai";
import type { StellarAgentKit } from "../agent";
import type { Action } from "../types/action";
import { executeAction } from "../utils/actionExecutor";

export function createVercelAITools(
  agent: StellarAgentKit,
  actions: Action[],
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  if (actions.length > 128) {
    console.warn(
      `Too many actions provided. Vercel AI SDK limits to 128. ${actions.length - 128} will be dropped.`,
    );
  }

  for (const action of actions.slice(0, 128)) {
    tools[action.name] = tool({
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
