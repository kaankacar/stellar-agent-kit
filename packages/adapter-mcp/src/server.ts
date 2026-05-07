import zodToJsonSchema from "zod-to-json-schema";
import type { StellarAgentKit, Action } from "@stellar-agent-kit/core";
import { executeAction } from "@stellar-agent-kit/core";

/**
 * Build an MCP server that exposes a StellarAgentKit's actions as MCP tools.
 *
 * @example
 * ```ts
 * import { Server } from "@modelcontextprotocol/sdk/server/index.js";
 * import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
 * import { createMcpServer } from "@stellar-agent-kit/adapter-mcp";
 *
 * const server = createMcpServer({
 *   name: "stellar-agent",
 *   version: "0.1.0",
 *   agent,
 * });
 * await server.connect(new StdioServerTransport());
 * ```
 */
export interface McpServerOptions {
  name: string;
  version: string;
  agent: StellarAgentKit;
  /** Override the action set; defaults to `agent.actions`. */
  actions?: Action[];
}

interface McpServer {
  connect(transport: unknown): Promise<void>;
  setRequestHandler(schema: unknown, handler: (req: unknown) => unknown): void;
}

export async function createMcpServer(options: McpServerOptions): Promise<McpServer> {
  const { Server } = (await import("@modelcontextprotocol/sdk/server/index.js")) as {
    Server: new (info: { name: string; version: string }, opts: unknown) => McpServer;
  };
  const { ListToolsRequestSchema, CallToolRequestSchema } = (await import(
    "@modelcontextprotocol/sdk/types.js"
  )) as { ListToolsRequestSchema: unknown; CallToolRequestSchema: unknown };

  const actions = options.actions ?? options.agent.actions;
  const byName = new Map<string, Action>();
  for (const action of actions) byName.set(action.name, action);

  const server = new Server(
    { name: options.name, version: options.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: actions.map((action) => ({
      name: action.name,
      description: buildDescription(action),
      inputSchema: zodToJsonSchema(action.schema, { target: "openAi" }),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req: unknown) => {
    const r = req as { params: { name: string; arguments?: Record<string, unknown> } };
    const action = byName.get(r.params.name);
    if (!action) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "UNKNOWN_TOOL" }) }],
        isError: true,
      };
    }
    const result = await executeAction(action, options.agent, r.params.arguments ?? {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: result.status === "error",
    };
  });

  return server;
}

function buildDescription(action: Action): string {
  const similes = action.similes.length ? ` Aliases: ${action.similes.join(", ")}.` : "";
  return `${action.description}${similes}`.slice(0, 1023);
}
