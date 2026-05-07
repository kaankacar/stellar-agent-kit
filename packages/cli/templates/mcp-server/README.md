# {{projectName}}

Stdio MCP server exposing Stellar Agent Kit actions to MCP clients (Claude Code, Cursor, Windsurf, Cline, etc.).

## Setup

```bash
cp .env.example .env
# fill in STELLAR_SECRET_KEY
npm install
```

## Register with Claude Code

```bash
claude mcp add {{projectName}} -- npx tsx /absolute/path/to/{{projectName}}/index.ts
```

## Cursor / Windsurf

Add to `mcp.json`:

```json
{
  "mcpServers": {
    "{{projectName}}": {
      "command": "tsx",
      "args": ["/absolute/path/to/{{projectName}}/index.ts"],
      "env": { "STELLAR_SECRET_KEY": "S..." }
    }
  }
}
```

## What's exposed

By default this loads `plugin-asset`, `plugin-data`, and `plugin-defi`. Edit `index.ts` to add anchors, smart wallets, x402 payments, etc.
