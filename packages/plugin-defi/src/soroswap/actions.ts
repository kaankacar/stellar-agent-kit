import { z } from "zod";
import {
  TransactionBuilder,
  type Transaction,
  type FeeBumpTransaction,
} from "@stellar/stellar-sdk";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";
import { pollTransaction } from "@stellar-agent-kit/core";
import {
  getQuote,
  buildSwapXdr,
  buildAddLiquidityXdr,
  buildRemoveLiquidityXdr,
} from "./api";

const protocolEnum = z.enum(["soroswap", "phoenix", "aqua", "sdex"]);
const networkEnum = z.enum(["mainnet", "testnet"]);

/**
 * Sign a built XDR with the agent wallet, submit it via the Soroban RPC, and
 * poll until terminal. Same flow used by `soroswapSwap`; factored out so the
 * liquidity actions can reuse it without duplicating the dance.
 */
async function signSendXdr(agent: StellarAgentKit, xdr: string) {
  const signedXdr = await agent.wallet.signTransaction(xdr, {
    networkPassphrase: agent.config.networkPassphrase,
    accountToSign: agent.wallet.publicKey,
  });
  const signedTx = TransactionBuilder.fromXDR(signedXdr, agent.config.networkPassphrase) as
    | Transaction
    | FeeBumpTransaction;

  const sendResp = await agent.rpcServer.sendTransaction(signedTx);
  if (sendResp.status === "ERROR") {
    const err = new Error(`sendTransaction failed: ${sendResp.errorResult?.toString()}`);
    (err as Error & { code: string }).code = "SEND_FAILED";
    throw err;
  }
  return await pollTransaction(agent, sendResp.hash);
}

export const soroswapQuote: Action = {
  name: "SOROSWAP_QUOTE",
  similes: ["dex quote", "best swap rate", "get swap quote"],
  description:
    "Get the best route quote across Soroswap, Phoenix, Aquarius, and SDEX. Specify the input and output asset contract IDs (Stellar Asset Contract addresses for classic assets), an amount, and tradeType (EXACT_IN or EXACT_OUT).",
  examples: [
    [
      {
        input: {
          assetIn: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
          assetOut: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
          amount: "10000000",
          tradeType: "EXACT_IN",
        },
        output: { amountIn: "10000000", amountOut: "...", protocol: "soroswap" },
        explanation: "Quote 1 XLM (1e7 stroops) -> USDC mainnet",
      },
    ],
  ],
  schema: z.object({
    assetIn: z.string().describe("Asset contract address (SAC for classic assets)"),
    assetOut: z.string(),
    amount: z.string().describe("Amount in smallest unit (stroops/atomic)"),
    tradeType: z.enum(["EXACT_IN", "EXACT_OUT"]).default("EXACT_IN"),
    slippageBps: z.string().default("50"),
    protocols: z.array(protocolEnum).optional(),
    network: networkEnum.default("mainnet"),
  }),
  handler: async (agent, input) => {
    const apiKey = agent.config.apiKeys?.soroswap;
    const quote = await getQuote(
      {
        assetIn: input.assetIn,
        assetOut: input.assetOut,
        amount: input.amount,
        tradeType: input.tradeType,
        slippageBps: input.slippageBps,
        protocols: input.protocols,
        network: input.network,
      },
      apiKey,
    );
    return {
      assetIn: quote.assetIn,
      assetOut: quote.assetOut,
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
      protocol: quote.protocol,
      otherAmountThreshold: quote.otherAmountThreshold,
      priceImpactPct: quote.priceImpactPct,
      raw: quote,
    };
  },
};

export const soroswapSwap: Action = {
  name: "SOROSWAP_SWAP",
  similes: ["swap tokens", "execute swap", "trade tokens"],
  description:
    "Quote-and-execute a swap via Soroswap. Returns the transaction hash and final status. Caller's account must have a trustline / SAC balance for the input asset.",
  examples: [
    [
      {
        input: {
          assetIn: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
          assetOut: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
          amount: "10000000",
        },
        output: { hash: "...", status: "SUCCESS", amountOut: "..." },
        explanation: "Swap 1 XLM for USDC, mainnet",
      },
    ],
  ],
  schema: z.object({
    assetIn: z.string(),
    assetOut: z.string(),
    amount: z.string(),
    tradeType: z.enum(["EXACT_IN", "EXACT_OUT"]).default("EXACT_IN"),
    slippageBps: z.string().default("50"),
    protocols: z.array(protocolEnum).optional(),
    network: networkEnum.default("mainnet"),
  }),
  handler: async (agent, input) => {
    const apiKey = agent.config.apiKeys?.soroswap;
    const quote = await getQuote(
      {
        assetIn: input.assetIn,
        assetOut: input.assetOut,
        amount: input.amount,
        tradeType: input.tradeType,
        slippageBps: input.slippageBps,
        protocols: input.protocols,
        network: input.network,
      },
      apiKey,
    );
    const { xdr: builtXdr } = await buildSwapXdr(quote, agent.wallet.publicKey, input.network, apiKey);

    const result = await signSendXdr(agent, builtXdr);
    return { ...result, amountIn: quote.amountIn, amountOut: quote.amountOut, protocol: quote.protocol };
  },
};

/**
 * Soroswap LP add. Wraps `POST /liquidity/add?network=...` (verified against
 * Soroswap's OpenAPI at https://api.soroswap.finance/api-json on 2026-05-07).
 *
 * The API returns an unsigned XDR; agent signs and submits via Soroban RPC.
 */
export const soroswapLiquidityAdd: Action = {
  name: "SOROSWAP_LIQUIDITY_ADD",
  similes: ["add liquidity", "provide liquidity", "deposit lp", "lp deposit"],
  description:
    "Provide liquidity to a Soroswap pool by depositing both sides of a pair. Returns the transaction hash and final status. Amounts are atomic (e.g. stroops for 7-decimal assets).",
  examples: [
    [
      {
        input: {
          assetA: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
          assetB: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
          amountA: "10000000",
          amountB: "1000000",
        },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "Add 1 XLM + 0.1 USDC (atomic) of liquidity on mainnet",
      },
    ],
  ],
  schema: z.object({
    assetA: z.string().describe("Asset A contract address (SAC for classic assets)"),
    assetB: z.string(),
    amountA: z.string().describe("Amount of asset A in atomic units"),
    amountB: z.string().describe("Amount of asset B in atomic units"),
    slippageBps: z.string().default("50"),
    network: networkEnum.default("mainnet"),
  }),
  handler: async (agent, input) => {
    const apiKey = agent.config.apiKeys?.soroswap;
    const { xdr: builtXdr, ...rest } = await buildAddLiquidityXdr(
      {
        assetA: input.assetA,
        assetB: input.assetB,
        amountA: input.amountA,
        amountB: input.amountB,
        to: agent.wallet.publicKey,
        slippageBps: input.slippageBps,
        network: input.network,
      },
      apiKey,
    );
    const result = await signSendXdr(agent, builtXdr);
    return { ...result, ...rest };
  },
};

/**
 * Soroswap LP remove. Wraps `POST /liquidity/remove?network=...`.
 *
 * Soroswap's RemoveLiquidityDto requires (in addition to `liquidity`) the
 * minimum acceptable per-side outputs `amountA` / `amountB` for slippage
 * protection. We default both to "0" so callers can rely solely on
 * `slippageBps`; advanced users can override via `minAmountA` / `minAmountB`.
 */
export const soroswapLiquidityRemove: Action = {
  name: "SOROSWAP_LIQUIDITY_REMOVE",
  similes: ["remove liquidity", "withdraw lp", "lp withdraw", "burn lp tokens"],
  description:
    "Withdraw liquidity from a Soroswap pool by burning LP tokens. `liquidity` is the LP token amount in atomic units. Returns the transaction hash and final status.",
  examples: [
    [
      {
        input: {
          assetA: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
          assetB: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
          liquidity: "10000000",
        },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "Burn 1e7 LP tokens of XLM/USDC mainnet pool",
      },
    ],
  ],
  schema: z.object({
    assetA: z.string(),
    assetB: z.string(),
    liquidity: z.string().describe("LP token amount to burn (atomic units)"),
    minAmountA: z
      .string()
      .default("0")
      .describe("Minimum atomic units of asset A to receive (slippage floor)"),
    minAmountB: z
      .string()
      .default("0")
      .describe("Minimum atomic units of asset B to receive (slippage floor)"),
    slippageBps: z.string().default("50"),
    network: networkEnum.default("mainnet"),
  }),
  handler: async (agent, input) => {
    const apiKey = agent.config.apiKeys?.soroswap;
    const { xdr: builtXdr, ...rest } = await buildRemoveLiquidityXdr(
      {
        assetA: input.assetA,
        assetB: input.assetB,
        liquidity: input.liquidity,
        amountA: input.minAmountA,
        amountB: input.minAmountB,
        to: agent.wallet.publicKey,
        slippageBps: input.slippageBps,
        network: input.network,
      },
      apiKey,
    );
    const result = await signSendXdr(agent, builtXdr);
    return { ...result, ...rest };
  },
};
