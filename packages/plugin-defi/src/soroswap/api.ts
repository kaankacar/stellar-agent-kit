import { SOROSWAP_API_BASE } from "../constants";

export type SoroswapNetwork = "mainnet" | "testnet";
export type SoroswapProtocol = "soroswap" | "phoenix" | "aqua" | "sdex";

export interface QuoteRequest {
  assetIn: string;
  assetOut: string;
  amount: string;
  tradeType: "EXACT_IN" | "EXACT_OUT";
  slippageBps?: string;
  protocols?: SoroswapProtocol[];
  network?: SoroswapNetwork;
}

export interface QuoteResponse {
  assetIn: string;
  assetOut: string;
  amountIn: string;
  amountOut: string;
  otherAmountThreshold?: string;
  priceImpactPct?: string;
  protocol?: SoroswapProtocol;
  routePlan: unknown[];
  trade: Record<string, unknown>;
}

export interface BuildResponse {
  xdr: string;
}

const apiKeyHeader = (apiKey?: string): Record<string, string> =>
  apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

export async function getQuote(
  req: QuoteRequest,
  apiKey?: string,
): Promise<QuoteResponse> {
  const network = req.network ?? "mainnet";
  const url = `${SOROSWAP_API_BASE}/quote?network=${network}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiKeyHeader(apiKey) },
    body: JSON.stringify({
      assetIn: req.assetIn,
      assetOut: req.assetOut,
      amount: req.amount,
      tradeType: req.tradeType,
      slippageBps: req.slippageBps ?? "50",
      protocols: req.protocols ?? ["soroswap", "phoenix", "aqua", "sdex"],
    }),
  });
  if (!resp.ok) {
    throw new Error(`Soroswap /quote failed: ${resp.status} ${await resp.text()}`);
  }
  return (await resp.json()) as QuoteResponse;
}

export async function buildSwapXdr(
  quote: QuoteResponse,
  signer: string,
  network: SoroswapNetwork,
  apiKey?: string,
): Promise<BuildResponse> {
  const url = `${SOROSWAP_API_BASE}/quote/build?network=${network}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiKeyHeader(apiKey) },
    body: JSON.stringify({ quote, sponsor: signer, from: signer }),
  });
  if (!resp.ok) {
    throw new Error(`Soroswap /quote/build failed: ${resp.status} ${await resp.text()}`);
  }
  return (await resp.json()) as BuildResponse;
}

/**
 * Liquidity request shapes mirror Soroswap's OpenAPI (`AddLiquidityDto` /
 * `RemoveLiquidityDto`) — verified against `https://api.soroswap.finance/api-json`
 * on 2026-05-07. Both endpoints expect:
 *   POST /liquidity/add?network={mainnet|testnet}
 *   POST /liquidity/remove?network={mainnet|testnet}
 * with `to` = the user wallet (LP token recipient / source).
 *
 * Response is `{ xdr: string }` — same build-XDR-then-sign-then-/send pattern as swap.
 */
export interface AddLiquidityRequest {
  assetA: string;
  assetB: string;
  amountA: string;
  amountB: string;
  to: string;
  slippageBps?: string;
  network?: SoroswapNetwork;
}

export interface RemoveLiquidityRequest {
  assetA: string;
  assetB: string;
  liquidity: string;
  /** Minimum acceptable amountA out after slippage (atomic). Default "0". */
  amountA?: string;
  /** Minimum acceptable amountB out after slippage (atomic). Default "0". */
  amountB?: string;
  to: string;
  slippageBps?: string;
  network?: SoroswapNetwork;
}

export interface LiquidityBuildResponse {
  xdr: string;
  [key: string]: unknown;
}

export async function buildAddLiquidityXdr(
  req: AddLiquidityRequest,
  apiKey?: string,
): Promise<LiquidityBuildResponse> {
  const network = req.network ?? "mainnet";
  const url = `${SOROSWAP_API_BASE}/liquidity/add?network=${network}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiKeyHeader(apiKey) },
    body: JSON.stringify({
      assetA: req.assetA,
      assetB: req.assetB,
      amountA: req.amountA,
      amountB: req.amountB,
      to: req.to,
      slippageBps: req.slippageBps ?? "50",
    }),
  });
  if (!resp.ok) {
    throw new Error(`Soroswap /liquidity/add failed: ${resp.status} ${await resp.text()}`);
  }
  return (await resp.json()) as LiquidityBuildResponse;
}

export async function buildRemoveLiquidityXdr(
  req: RemoveLiquidityRequest,
  apiKey?: string,
): Promise<LiquidityBuildResponse> {
  const network = req.network ?? "mainnet";
  const url = `${SOROSWAP_API_BASE}/liquidity/remove?network=${network}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...apiKeyHeader(apiKey) },
    body: JSON.stringify({
      assetA: req.assetA,
      assetB: req.assetB,
      liquidity: req.liquidity,
      // Soroswap's RemoveLiquidityDto requires amountA and amountB as the
      // *minimum* per-side out (slippage protection). Default to "0" if caller
      // doesn't specify; slippageBps still applies.
      amountA: req.amountA ?? "0",
      amountB: req.amountB ?? "0",
      to: req.to,
      slippageBps: req.slippageBps ?? "50",
    }),
  });
  if (!resp.ok) {
    throw new Error(`Soroswap /liquidity/remove failed: ${resp.status} ${await resp.text()}`);
  }
  return (await resp.json()) as LiquidityBuildResponse;
}
