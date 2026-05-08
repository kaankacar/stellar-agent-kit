import type { StellarAgentKit } from "../agent";
import type { Action } from "../types/action";
import { executeAction } from "../utils/actionExecutor";

/**
 * Build LangChain tools from the agent's action surface.
 *
 * NOTE: `@langchain/core` is loaded lazily so consumers that don't use
 * LangChain don't need to install it. The function returns a Promise as a
 * result — call as `await createLangchainTools(agent, actions)`.
 */
export async function createLangchainTools(
  agent: StellarAgentKit,
  actions: Action[],
): Promise<unknown[]> {
  const { DynamicStructuredTool } = (await import("@langchain/core/tools")) as {
    DynamicStructuredTool: new (config: {
      name: string;
      description: string;
      schema: unknown;
      func: (input: Record<string, unknown>) => Promise<string>;
    }) => unknown;
  };
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
