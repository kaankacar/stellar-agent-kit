import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { StellarAgentKit } from "../agent";
import type { Action } from "../types/action";
import { executeAction } from "../utils/actionExecutor";

/**
 * Build LangChain tools from the agent's action surface.
 *
 * NOTE: `@langchain/core` is loaded lazily so consumers that don't use
 * LangChain don't need to install it. The `import type` above is stripped
 * at build time by tsup; only the runtime `await import(...)` below stays.
 *
 * Call as `await createLangchainTools(agent, actions)`.
 */
export async function createLangchainTools(
  agent: StellarAgentKit,
  actions: Action[],
): Promise<DynamicStructuredTool[]> {
  const mod = await import("@langchain/core/tools");
  return actions.map(
    (action) =>
      new mod.DynamicStructuredTool({
        name: action.name,
        description: buildDescription(action),
        schema: action.schema,
        func: async (input: Record<string, unknown>) => {
          const result = await executeAction(action, agent, input);
          return JSON.stringify(result);
        },
      }) as DynamicStructuredTool,
  );
}

function buildDescription(action: Action): string {
  const similes = action.similes.length ? ` Aliases: ${action.similes.join(", ")}.` : "";
  return `${action.description}${similes}`.slice(0, 1023);
}
