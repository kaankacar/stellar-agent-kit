import { Networks } from "@stellar/stellar-sdk";

/**
 * Verified-canonical asset issuers per network. Use this to avoid LLM
 * hallucination of issuer addresses when the user says "trustline USDC" without
 * specifying which one.
 *
 * Sources (verified 2026-05-08):
 * - USDC mainnet: Circle's official issuer (https://stellar.expert/explorer/public/asset/USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN)
 * - USDC testnet: Circle's testnet issuer (https://stellar.expert/explorer/testnet/asset/USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5)
 * - EURC mainnet: Circle's official EURC issuer
 * - AQUA mainnet: Aquarius DEX governance token
 * - yXLM, yUSDC mainnet: Ultracapital yield assets
 *
 * NOTE: testnet has MULTIPLE USDC issuers (Circle, Blend, Etherfuse). We
 * default to Circle's. To use a different one, callers must pass the issuer
 * explicitly to ASSET_TRUSTLINE_ADD.
 */
export interface KnownAssetEntry {
  code: string;
  issuer: string;
  /** Stellar Asset Contract address — for Soroswap / Soroban interactions. */
  sac?: string;
  description?: string;
}

export const KNOWN_ASSETS_MAINNET: Record<string, KnownAssetEntry> = {
  XLM: {
    code: "XLM",
    issuer: "native",
    sac: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
    description: "Native Stellar lumens. No trustline needed.",
  },
  USDC: {
    code: "USDC",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    sac: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    description: "Circle's official mainnet USDC.",
  },
  EURC: {
    code: "EURC",
    issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
    sac: "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV",
    description: "Circle's official mainnet EURC.",
  },
  AQUA: {
    code: "AQUA",
    issuer: "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA",
    sac: "CAUIKL3IYGMERDRUN6YSCLWVAKIFG5Q4YJHUKM4S4NJZQIA3BAS6OJPK",
    description: "Aquarius DEX governance token.",
  },
  YXLM: {
    code: "yXLM",
    issuer: "GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55",
    description: "Ultracapital yield XLM.",
  },
  YUSDC: {
    code: "yUSDC",
    issuer: "GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF",
    sac: "CDOFW7HNKLUZRLFZST4EW7V3AV4JI5IHMT6BPXXSY2IEFZ4NE5TWU2P4",
    description: "Ultracapital yield USDC.",
  },
};

export const KNOWN_ASSETS_TESTNET: Record<string, KnownAssetEntry> = {
  XLM: {
    code: "XLM",
    issuer: "native",
    description: "Native Stellar lumens (testnet). No trustline needed.",
  },
  USDC: {
    code: "USDC",
    issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    description:
      "Circle's testnet USDC. NOTE: testnet has multiple USDC issuers (Circle / Blend / Etherfuse) that don't share liquidity — pass an explicit issuer to use a different one.",
  },
};

export type StellarNetworkTag = "mainnet" | "testnet" | "futurenet";

export function networkTag(passphrase: string): StellarNetworkTag {
  if (passphrase === Networks.PUBLIC) return "mainnet";
  if (passphrase === Networks.FUTURENET) return "futurenet";
  return "testnet";
}

/**
 * Look up a known asset by code on the current network. Returns null if the
 * code isn't in the registry. Codes are matched case-insensitively but the
 * registry's canonical casing wins.
 */
export function lookupKnownAsset(
  passphrase: string,
  code: string,
): KnownAssetEntry | null {
  const network = networkTag(passphrase);
  const reg =
    network === "mainnet" ? KNOWN_ASSETS_MAINNET : KNOWN_ASSETS_TESTNET;
  const upper = code.toUpperCase();
  // Try exact (case-sensitive) first, then upper.
  return reg[code] ?? reg[upper] ?? null;
}

/**
 * Render a compact summary of known assets for inclusion in the agent's
 * system prompt. Helps the LLM pick the right issuer without guessing.
 */
export function describeKnownAssets(passphrase: string): string {
  const network = networkTag(passphrase);
  const reg =
    network === "mainnet" ? KNOWN_ASSETS_MAINNET : KNOWN_ASSETS_TESTNET;
  const lines: string[] = [`Known canonical assets on ${network}:`];
  for (const entry of Object.values(reg)) {
    if (entry.issuer === "native") {
      lines.push(`  - ${entry.code} (native, no trustline needed)`);
    } else {
      lines.push(
        `  - ${entry.code}: issuer=${entry.issuer}${entry.sac ? `, SAC=${entry.sac}` : ""}`,
      );
    }
  }
  if (network === "testnet") {
    lines.push(
      "  Note: testnet has multiple USDC issuers (Circle / Blend / Etherfuse) that DON'T share liquidity.",
    );
  }
  return lines.join("\n");
}
