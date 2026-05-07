import { z } from "zod";
import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";
import { Contract } from "@stellar/stellar-sdk";
import { MAINNET_CONTRACTS } from "../constants";

/**
 * Reflector returns prices via lastprice() / twap() that take an `Asset` enum:
 *   enum Asset { Stellar(Address), Other(Symbol) }
 *
 * For convenience this action accepts either a contract address (treated as Stellar variant)
 * or a symbol like "BTC" (treated as Other variant).
 */
function buildAssetScVal(asset: { type: "stellar"; address: string } | { type: "other"; symbol: string }) {
  if (asset.type === "stellar") {
    return xdr.ScVal.scvVec([
      xdr.ScVal.scvSymbol("Stellar"),
      Address.fromString(asset.address).toScVal(),
    ]);
  }
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("Other"),
    xdr.ScVal.scvSymbol(asset.symbol),
  ]);
}

async function readReflector(
  agent: StellarAgentKit,
  oracleId: string,
  fn: "lastprice" | "twap",
  args: xdr.ScVal[],
): Promise<{ price?: string; timestamp?: number; decimals?: number; raw?: unknown }> {
  const { rpc } = await import("@stellar/stellar-sdk");
  const { TransactionBuilder, BASE_FEE } = await import("@stellar/stellar-sdk");
  const account = agent.horizonServer
    ? ((await agent.horizonServer.loadAccount(agent.wallet.publicKey)) as never)
    : ((await agent.rpcServer.getAccount(agent.wallet.publicKey)) as never);
  const contract = new Contract(oracleId);
  const tx = new TransactionBuilder(account, {
    fee: agent.config.defaultFeeStroops ?? BASE_FEE,
    networkPassphrase: agent.config.networkPassphrase,
  })
    .addOperation(contract.call(fn, ...args))
    .setTimeout(180)
    .build();
  const sim = await agent.rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    return { raw: { error: sim.error } };
  }
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) {
    return { raw: undefined };
  }
  const { scValToNative } = await import("@stellar/stellar-sdk");
  const decoded = scValToNative(sim.result.retval) as
    | { price: bigint; timestamp: bigint }
    | bigint
    | undefined;
  if (!decoded) return { raw: undefined };
  if (typeof decoded === "bigint") return { price: decoded.toString() };
  return {
    price: decoded.price.toString(),
    timestamp: Number(decoded.timestamp),
  };
}

export const reflectorPrice: Action = {
  name: "REFLECTOR_PRICE",
  similes: ["get price", "fetch oracle price", "asset price"],
  description:
    "Fetch the latest on-chain price for an asset from a Reflector oracle. Defaults to the mainnet XLM/USD oracle.",
  examples: [
    [
      {
        input: { asset: { type: "other", symbol: "XLM" } },
        output: { price: "...", timestamp: 1234567890 },
        explanation: "Fetch XLM/USD",
      },
    ],
  ],
  schema: z.object({
    oracleId: z.string().default(MAINNET_CONTRACTS.reflectorXlmUsd),
    asset: z.union([
      z.object({ type: z.literal("stellar"), address: z.string() }),
      z.object({ type: z.literal("other"), symbol: z.string() }),
    ]),
  }),
  handler: async (agent, input) => {
    return readReflector(agent, input.oracleId, "lastprice", [buildAssetScVal(input.asset)]);
  },
};

/**
 * Hardcoded directory of public Reflector mainnet oracles.
 * Verified against the stellar/stellar-docs oracle-providers.mdx page
 * (https://github.com/stellar/stellar-docs/blob/main/docs/data/oracles/oracle-providers.mdx).
 * Reflector docs: https://reflector.network/docs.
 */
const REFLECTOR_FEEDS: Array<{
  name: string;
  contractId: string;
  baseAsset: string;
  quoteAsset: string;
  kind: "stellar" | "external";
  description: string;
}> = [
  {
    name: "External CEX & DEX",
    contractId: "CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN",
    baseAsset: "(multi-asset, e.g. BTC, ETH, USDC, XLM)",
    quoteAsset: "USD",
    kind: "external",
    description:
      "Aggregates prices for major crypto assets from external CEXs & DEXs (Binance, Coinbase, etc.). Quoted in USD. This is the oracle currently exposed as MAINNET_CONTRACTS.reflectorXlmUsd.",
  },
  {
    name: "Stellar Mainnet DEX",
    contractId: "CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M",
    baseAsset: "(Stellar-native assets via Stellar Classic DEX & Soroban AMMs)",
    quoteAsset: "USDC",
    kind: "stellar",
    description:
      "Prices derived from on-chain Stellar DEX (Classic DEX + Soroban AMMs). Use the Stellar variant of Asset (Address) for lookups.",
  },
  {
    name: "Forex (Fiat exchange rates)",
    contractId: "CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC",
    baseAsset: "(fiat currency symbols: EUR, GBP, JPY, etc.)",
    quoteAsset: "USD",
    kind: "external",
    description:
      "Foreign exchange rates for major fiat currencies. Use the Other variant of Asset with the fiat symbol (e.g. 'EUR').",
  },
];

export const reflectorListFeeds: Action = {
  name: "REFLECTOR_LIST_FEEDS",
  similes: ["list reflector oracles", "reflector feeds", "available oracles"],
  description:
    "Return a directory of known public Reflector mainnet oracles (Stellar DEX, External CEX/DEX, Forex). Each entry includes the contract id and which variant of Asset (Stellar address vs Other symbol) the oracle expects.",
  examples: [
    [
      {
        input: {},
        output: {
          feeds: [
            { name: "External CEX & DEX", contractId: "CAFJZQWSED...", kind: "external" },
          ],
        },
        explanation: "List the registered Reflector oracles",
      },
    ],
  ],
  schema: z.object({}),
  handler: async () => {
    return {
      feeds: REFLECTOR_FEEDS,
      note:
        "Verified against stellar/stellar-docs as of the current SDK release. Always re-check reflector.network/docs for the canonical list before relying on these in production.",
      source:
        "https://github.com/stellar/stellar-docs/blob/main/docs/data/oracles/oracle-providers.mdx",
    };
  },
};

export const reflectorTwap: Action = {
  name: "REFLECTOR_TWAP",
  similes: ["time-weighted price", "twap", "average price"],
  description:
    "Fetch a time-weighted average price for an asset from a Reflector oracle. Records argument is the number of historical records to average.",
  examples: [
    [
      {
        input: { asset: { type: "other", symbol: "XLM" }, records: 10 },
        output: { price: "..." },
        explanation: "10-record TWAP",
      },
    ],
  ],
  schema: z.object({
    oracleId: z.string().default(MAINNET_CONTRACTS.reflectorXlmUsd),
    asset: z.union([
      z.object({ type: z.literal("stellar"), address: z.string() }),
      z.object({ type: z.literal("other"), symbol: z.string() }),
    ]),
    records: z.number().int().positive().max(100).default(10),
  }),
  handler: async (agent, input) => {
    return readReflector(agent, input.oracleId, "twap", [
      buildAssetScVal(input.asset),
      nativeToScVal(input.records, { type: "u32" }),
    ]);
  },
};
