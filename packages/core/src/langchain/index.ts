import { DynamicStructuredTool } from "@langchain/core/tools";
import type { StellarAgentKit } from "../agent";
import type { Action } from "../types/action";
import { executeAction } from "../utils/actionExecutor";

export function createLangchainTools(
  agent: StellarAgentKit,
  actions: Action[],
): DynamicStructuredTool[] {
  return actions.map(
    (action) =>
      new DynamicStructuredTool({
        name: action.name,
        description: buildDescription(action),
        schema: action.schema,
        func: async (input: Record<string, unknown>) => {
          const result = await executeAction(action, agent, input);
          return JSON.stringify(result);
        },
      }),
  );
}

function buildDescription(action: Action): string {
  const similes = action.similes.length ? ` Aliases: ${action.similes.join(", ")}.` : "";
  return `${action.description}${similes}`.slice(0, 1023);
}
