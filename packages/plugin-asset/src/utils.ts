import {
  Asset,
  Horizon,
  Operation,
  TransactionBuilder,
  Transaction,
  FeeBumpTransaction,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import type { StellarAgentKit } from "@stellar-agent-kit/core";

export function requireHorizon(agent: StellarAgentKit): Horizon.Server {
  if (!agent.horizonServer) {
    const err = new Error("Classic asset operations require horizonUrl to be configured.");
    (err as Error & { code: string }).code = "HORIZON_NOT_CONFIGURED";
    throw err;
  }
  return agent.horizonServer;
}

export function makeAsset(input: { code: string; issuer?: string }): Asset {
  if (input.code === "XLM" || input.code === "native") return Asset.native();
  if (!input.issuer) {
    const err = new Error(`Asset code ${input.code} requires an issuer.`);
    (err as Error & { code: string }).code = "ISSUER_REQUIRED";
    throw err;
  }
  return new Asset(input.code, input.issuer);
}

export async function ensureTrustline(
  horizon: Horizon.Server,
  account: string,
  asset: Asset,
): Promise<void> {
  if (asset.isNative()) return;
  const acc = await horizon.loadAccount(account);
  const has = acc.balances.some(
    (b) =>
      b.asset_type !== "native" &&
      "asset_code" in b &&
      b.asset_code === asset.getCode() &&
      "asset_issuer" in b &&
      b.asset_issuer === asset.getIssuer(),
  );
  if (!has) {
    const err = new Error(
      `Account ${account} has no trustline for ${asset.getCode()}:${asset.getIssuer()}.`,
    );
    (err as Error & { code: string }).code = "TRUSTLINE_REQUIRED";
    throw err;
  }
}

export async function buildSubmitClassic(
  agent: StellarAgentKit,
  buildOps: (b: TransactionBuilder) => TransactionBuilder,
  options: { memo?: string } = {},
): Promise<{ hash: string; ledger: number }> {
  const horizon = requireHorizon(agent);
  const account = await horizon.loadAccount(agent.wallet.publicKey);
  let builder = new TransactionBuilder(account, {
    fee: agent.config.defaultFeeStroops ?? BASE_FEE,
    networkPassphrase: agent.config.networkPassphrase,
  });
  builder = buildOps(builder);
  if (options.memo) {
    const { Memo } = await import("@stellar/stellar-sdk");
    builder = builder.addMemo(Memo.text(options.memo));
  }
  const tx = builder.setTimeout(180).build();

  const signedXdr = await agent.wallet.signTransaction(tx.toXDR(), {
    networkPassphrase: agent.config.networkPassphrase,
    accountToSign: agent.wallet.publicKey,
  });

  const signedTx = TransactionBuilder.fromXDR(signedXdr, agent.config.networkPassphrase) as
    | Transaction
    | FeeBumpTransaction;

  const resp = await horizon.submitTransaction(signedTx);
  return { hash: resp.hash, ledger: resp.ledger };
}

export { Operation };
