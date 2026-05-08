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

// Re-export the canonical-asset registry helpers so templates can render the
// known-issuer list into their system prompts (prevents LLM issuer hallucination).
export {
  describeKnownAssets,
  lookupKnownAsset,
  KNOWN_ASSETS_MAINNET,
  KNOWN_ASSETS_TESTNET,
  networkTag,
} from "@stellar-agent-kit/plugin-asset";
export type {
  KnownAssetEntry,
  StellarNetworkTag,
} from "@stellar-agent-kit/plugin-asset";
