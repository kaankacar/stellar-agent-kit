#!/usr/bin/env tsx
/**
 * Run a Stellar Agent Kit MCP server over stdio.
 *
 * Reads `STELLAR_SECRET_KEY` from the environment. Falls back to a random
 * testnet keypair (signs txs but useless without funding).
 *
 * Add to Claude Code:
 *   claude mcp add stellar-agent -- pnpm --filter @stellar-agent-kit/example-mcp-server exec tsx index.ts
 *
 * Add to Cursor / other MCP clients via the standard mcp.json config:
 *   {
 *     "mcpServers": {
 *       "stellar-agent": {
 *         "command": "tsx",
 *         "args": ["/path/to/examples/04-mcp-server/index.ts"],
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
const useMainnet = process.env.STELLAR_NETWORK === "mainnet";

const agent = new StellarAgentKit(wallet, {
  rpcUrl: useMainnet
    ? (process.env.STELLAR_RPC_URL ?? "https://soroban-rpc.creit.tech")
    : "https://soroban-testnet.stellar.org",
  horizonUrl: useMainnet
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org",
  networkPassphrase: useMainnet ? Networks.PUBLIC : Networks.TESTNET,
  apiKeys: {
    soroswap: process.env.SOROSWAP_API_KEY ?? "",
  },
})
  .use(StellarAssetPlugin)
  .use(DataPlugin)
  .use(DefiPlugin);

await runStdio({
  name: "stellar-agent-kit",
  version: "0.1.10",
  agent,
});
