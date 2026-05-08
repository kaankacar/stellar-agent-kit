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

await runStdio({ name: "{{projectName}}", version: "0.1.0", agent });
