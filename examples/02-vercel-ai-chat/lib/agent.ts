import { Networks, Keypair } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
import { DataPlugin } from "@stellar-agent-kit/plugin-data";
import { DefiPlugin } from "@stellar-agent-kit/plugin-defi";
import { DomainPlugin } from "@stellar-agent-kit/plugin-domain";

let cached: StellarAgentKit | undefined;

export function getAgent(): StellarAgentKit {
  if (cached) return cached;

  const secret = process.env.STELLAR_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "STELLAR_SECRET_KEY env var is required. Generate one with `node -e \"console.log(require('@stellar/stellar-sdk').Keypair.random().secret())\"`.",
    );
  }
  // Validate up front so we fail fast with a clear error rather than mid-request.
  Keypair.fromSecret(secret);

  const isMainnet = process.env.STELLAR_NETWORK === "mainnet";
  cached = new StellarAgentKit(new KeypairWallet(secret), {
    rpcUrl:
      process.env.STELLAR_RPC_URL ??
      (isMainnet
        ? "https://mainnet.sorobanrpc.com"
        : "https://soroban-testnet.stellar.org"),
    horizonUrl:
      process.env.STELLAR_HORIZON_URL ??
      (isMainnet ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org"),
    networkPassphrase: isMainnet ? Networks.PUBLIC : Networks.TESTNET,
    apiKeys: {
      soroswap: process.env.SOROSWAP_API_KEY ?? "",
    },
  })
    .use(StellarAssetPlugin)
    .use(DataPlugin)
    .use(DefiPlugin)
    .use(DomainPlugin);

  return cached;
}
