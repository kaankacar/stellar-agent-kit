import zodToJsonSchema from "zod-to-json-schema";
import type OpenAI from "openai";
import type { StellarAgentKit } from "../agent";
import type { Action } from "../types/action";
import { executeAction } from "../utils/actionExecutor";

export interface OpenAIToolBundle {
  tools: OpenAI.Chat.Completions.ChatCompletionTool[];
  execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function createOpenAITools(
  agent: StellarAgentKit,
  actions: Action[],
): OpenAIToolBundle {
  const byName = new Map<string, Action>();
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = actions.map((action) => {
    byName.set(action.name, action);
    return {
      type: "function",
      function: {
        name: action.name,
        description: buildDescription(action),
        parameters: zodToJsonSchema(action.schema, { target: "openAi" }) as Record<string, unknown>,
      },
    };
  });

  return {
    tools,
    async execute(name, args) {
      const action = byName.get(name);
      if (!action) return { status: "error", error: "UNKNOWN_TOOL", name };
      return executeAction(action, agent, args);
    },
  };
}

function buildDescription(action: Action): string {
  const similes = action.similes.length ? ` Aliases: ${action.similes.join(", ")}.` : "";
  return `${action.description}${similes}`.slice(0, 1023);
}
