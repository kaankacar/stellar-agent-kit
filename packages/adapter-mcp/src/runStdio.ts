import { createMcpServer, type McpServerOptions } from "./server";

/**
 * Convenience: build the MCP server and start it on stdio.
 *
 * @example
 * ```ts
 * #!/usr/bin/env node
 * import { runStdio } from "@stellar-agent-kit/adapter-mcp";
 * import { agent } from "./my-agent.js";
 * await runStdio({ name: "stellar-agent", version: "0.1.0", agent });
 * ```
 */
export async function runStdio(options: McpServerOptions): Promise<void> {
  const server = await createMcpServer(options);
  const { StdioServerTransport } = (await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  )) as { StdioServerTransport: new () => unknown };
  await server.connect(new StdioServerTransport());
}
