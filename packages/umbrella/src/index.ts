/**
 * stellar-agent-kit — all-in-one entry point.
 *
 * For granular installs, use the @stellar-agent-kit/* scoped packages directly:
 *   import { StellarAgentKit } from "@stellar-agent-kit/core";
 *   import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
 *
 * Or pull everything in via this umbrella:
 *   import { StellarAgentKit, StellarAssetPlugin, autonomousRun } from "@stellar-agent-kit/all";
 *
 * Sub-paths are also exposed for tree-shaking:
 *   import { StellarAgentKit } from "@stellar-agent-kit/all/core";
 *   import { StellarAssetPlugin } from "@stellar-agent-kit/all/plugins";
 *   import { autonomousRun } from "@stellar-agent-kit/all/runner";
 */

// Core (StellarAgentKit, wallets, AI adapters, KVStore, withIdempotency)
export * from "@stellar-agent-kit/core";

// Plugins — default export from each
export { default as StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
export { default as SorobanPlugin } from "@stellar-agent-kit/plugin-soroban";
export { default as DefiPlugin } from "@stellar-agent-kit/plugin-defi";
export { default as DataPlugin } from "@stellar-agent-kit/plugin-data";
export { default as PaymentsPlugin } from "@stellar-agent-kit/plugin-payments";
export { default as AnchorPlugin } from "@stellar-agent-kit/plugin-anchor";
export { default as DefindexPlugin } from "@stellar-agent-kit/plugin-defindex";
export { default as SmartWalletPlugin } from "@stellar-agent-kit/plugin-smart-wallet";
export { default as DomainPlugin } from "@stellar-agent-kit/plugin-domain";
export { default as TrustlessWorkPlugin } from "@stellar-agent-kit/plugin-trustless-work";
export { default as BridgePlugin } from "@stellar-agent-kit/plugin-bridge";
export { default as NftPlugin } from "@stellar-agent-kit/plugin-nft";

// Runner (autonomousRun, runOnce, SpendCap, TestnetSandbox, ...)
export * from "@stellar-agent-kit/runner";

// MCP adapter
export { createMcpServer, runStdio } from "@stellar-agent-kit/adapter-mcp";
