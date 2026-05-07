import zodToJsonSchema from "zod-to-json-schema";
import type Anthropic from "@anthropic-ai/sdk";
import type { StellarAgentKit } from "../agent";
import type { Action } from "../types/action";
import { executeAction } from "../utils/actionExecutor";

export interface ClaudeToolBundle {
  tools: Anthropic.Tool[];
  execute(name: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function createClaudeTools(
  agent: StellarAgentKit,
  actions: Action[],
): ClaudeToolBundle {
  const byName = new Map<string, Action>();
  const tools: Anthropic.Tool[] = actions.map((action) => {
    byName.set(action.name, action);
    const schema = zodToJsonSchema(action.schema, { target: "openAi" }) as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    return {
      name: action.name,
      description: buildDescription(action),
      input_schema: {
        type: "object",
        properties: schema.properties ?? {},
        required: schema.required,
      } as Anthropic.Tool["input_schema"],
    };
  });

  return {
    tools,
    async execute(name, input) {
      const action = byName.get(name);
      if (!action) return { status: "error", error: "UNKNOWN_TOOL", name };
      return executeAction(action, agent, input);
    },
  };
}

function buildDescription(action: Action): string {
  const similes = action.similes.length ? ` Aliases: ${action.similes.join(", ")}.` : "";
  return `${action.description}${similes}`.slice(0, 1023);
}
