import type { Action } from "@stellar-agent-kit/core";

/**
 * Set of action name patterns that are read-only and safe to execute even in
 * `dryRun` mode. Anything not matching is intercepted and returns a stub result.
 */
const READ_ONLY_PREFIXES = [
  "ASSET_GET_",
  "STELLAR_EXPERT_",
  "RPC_",
  "HORIZON_",
  "BLEND_GET_",
  "DEX_GET_",
  "SOROSWAP_QUOTE",
  "REFLECTOR_PRICE",
  "REFLECTOR_TWAP",
  "REFLECTOR_LIST",
  "DOMAIN_RESOLVE",
  "DOMAIN_REVERSE",
  "DEFINDEX_LIST_VAULTS",
  "DEFINDEX_GET_POSITION",
  "TW_GET_ESCROW",
  "SOROBAN_SIMULATE",
  "SOROBAN_GET_",
  "SOROBAN_FUNGIBLE_TOKEN_INFO",
  "SOROBAN_FUNGIBLE_TOKEN_BALANCE",
  "NFT_BALANCE_OF",
  "NFT_OWNER_OF",
  "NFT_TOKEN_URI",
  "NFT_COLLECTION_INFO",
  "NFT_ROYALTY_INFO",
  "SMART_WALLET_INFO",
  "SMART_WALLET_GET_SIGNERS",
  "BRIDGE_LIST_TOKENS",
  "BRIDGE_QUOTE",
  "ANCHOR_GET_QUOTE",
  "ANCHOR_GET_KYC_URL",
  "ANCHOR_GET_ONRAMP_STATUS",
  "ANCHOR_GET_OFFRAMP_STATUS",
  "COINGECKO_",
];

export function isReadOnlyAction(name: string): boolean {
  return READ_ONLY_PREFIXES.some((p) => name === p || name.startsWith(p));
}

export function dryRunStub(
  action: Action,
  input: Record<string, unknown>,
): Record<string, unknown> {
  return {
    dryRun: true,
    wouldSubmit: { actionName: action.name, input },
    note: "Action was intercepted by safety.dryRun. Set dryRun:false to actually submit.",
  };
}
