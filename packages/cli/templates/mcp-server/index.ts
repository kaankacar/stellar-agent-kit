#!/usr/bin/env tsx
import "dotenv/config";
/**
 * Stdio MCP server exposing Stellar Agent Kit actions.
 *
 * Add to Claude Code:
 *   claude mcp add {{projectName}} -- pnpm --filter {{projectName}} exec tsx index.ts
 *
 * Or in a Cursor / Windsurf mcp.json:
 *   {
 *     "mcpServers": {
 *       "{{projectName}}": {
 *         "command": "tsx",
 *         "args": ["/absolute/path/to/{{projectName}}/index.ts"],
 *         "env": { "STELLAR_SECRET_KEY": "S..." }
 *       }
 *     }
 *   }
 */
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
import { DataPlugin } from "@stellar-agent-kit/plugin-data";
import { DefiPlugin } from "@stellar-agent-kit/plugin-defi";
import { runStdio } from "@stellar-agent-kit/adapter-mcp";

const secret = process.env.STELLAR_SECRET_KEY ?? Keypair.random().secret();
const wallet = new KeypairWallet(secret);
const isMainnet = process.env.STELLAR_NETWORK === "mainnet";

const agent = new StellarAgentKit(wallet, {
  rpcUrl: isMainnet
    ? (process.env.STELLAR_RPC_URL ?? "https://mainnet.sorobanrpc.com")
    : "https://soroban-testnet.stellar.org",
  horizonUrl: isMainnet ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org",
  networkPassphrase: isMainnet ? Networks.PUBLIC : Networks.TESTNET,
  apiKeys: { soroswap: process.env.SOROSWAP_API_KEY ?? "" },
})
  .use(StellarAssetPlugin)
  .use(DataPlugin)
  .use(DefiPlugin);

// Banner on stderr (MCP uses stdout for JSON-RPC; we must not pollute it).
console.error(`
🛰️  {{projectName}} (${isMainnet ? "mainnet" : "testnet"})
   wallet:  ${agent.wallet.publicKey.slice(0, 8)}…${agent.wallet.publicKey.slice(-4)}
   actions: ${agent.actions.length} registered (asset, data, defi)

quick guide:
   1. Register with Claude Code:
        claude mcp add {{projectName}} -- tsx /absolute/path/to/index.ts
   2. Or add to Cursor/Windsurf mcp.json with command="tsx" and the absolute
      path to this file. Set STELLAR_SECRET_KEY in env.
   3. Add SOROSWAP_API_KEY for swap/quote actions (testnet & mainnet are gated).
   4. To extend: edit index.ts and \`.use(...)\` more plugins from
      @stellar-agent-kit/* (anchor, payments, runner, etc.).

Listening on stdio…
`);

await runStdio({ name: "{{projectName}}", version: "0.1.0", agent });
