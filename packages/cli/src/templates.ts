/**
 * Registry of templates shipped with `create-stellar-agent`.
 *
 * Each entry's `id` matches a directory under `packages/cli/templates/<id>/`.
 * The `description` is shown in the interactive picker.
 */

export interface TemplateDescriptor {
  id: string;
  title: string;
  description: string;
}

export const TEMPLATES: readonly TemplateDescriptor[] = [
  {
    id: "remittance-mx",
    title: "Remittance (MX)",
    description:
      "Node script: USD/MXN remittance flow via Etherfuse anchor (KYC, quote, on-ramp, poll).",
  },
  {
    id: "agentic-defi",
    title: "Agentic DeFi",
    description:
      "LangChain tool-calling agent that checks balances, swaps on Soroswap, and supplies to Blend.",
  },
  {
    id: "mcp-server",
    title: "MCP Server",
    description:
      "Stdio MCP server exposing Stellar tools to Claude Code, Cursor, and other MCP clients.",
  },
  {
    id: "autonomous-runner",
    title: "Autonomous Runner",
    description:
      "Sandboxed autonomous agent loop with spend cap + allowlist (e.g. keep a USDC reserve topped up).",
  },
] as const;

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

export type TemplateId = (typeof TEMPLATES)[number]["id"];

export function isTemplateId(value: string): value is TemplateId {
  return TEMPLATE_IDS.includes(value);
}
