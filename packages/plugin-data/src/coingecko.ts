import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";

const FREE_BASE = "https://api.coingecko.com/api/v3";
const PRO_BASE = "https://pro-api.coingecko.com/api/v3";

interface CoinGeckoCallOpts {
  proKey?: string;
}

function resolveBase(opts: CoinGeckoCallOpts): { base: string; headers: Record<string, string> } {
  if (opts.proKey) {
    return {
      base: PRO_BASE,
      headers: { "x-cg-pro-api-key": opts.proKey },
    };
  }
  return { base: FREE_BASE, headers: {} };
}

async function coinGeckoFetch(path: string, opts: CoinGeckoCallOpts): Promise<unknown> {
  const { base, headers } = resolveBase(opts);
  const url = `${base}${path}`;
  let resp: Response;
  try {
    resp = await fetch(url, { headers });
  } catch (cause) {
    const err = new Error(
      `CoinGecko request failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    (err as Error & { code: string }).code = "COINGECKO_API_ERROR";
    throw err;
  }
  if (!resp.ok) {
    const err = new Error(`CoinGecko ${path} failed: ${resp.status} ${await resp.text()}`);
    (err as Error & { code: string }).code = "COINGECKO_API_ERROR";
    throw err;
  }
  return resp.json();
}

export const coinGeckoTokenPrice: Action = {
  name: "COINGECKO_TOKEN_PRICE",
  similes: ["token price", "coin price", "spot price", "market price"],
  description:
    "Fetch current spot prices from CoinGecko for a list of tokens (by CoinGecko ID, e.g. 'stellar', 'usd-coin') quoted in one or more fiat / crypto currencies. Wraps GET /simple/price.",
  examples: [
    [
      {
        input: { ids: ["stellar", "usd-coin"], vsCurrencies: ["usd"] },
        output: { stellar: { usd: 0.12 }, "usd-coin": { usd: 1.0 } },
        explanation: "XLM and USDC prices in USD",
      },
    ],
  ],
  schema: z.object({
    ids: z.array(z.string()).min(1).describe("CoinGecko coin IDs, e.g. ['stellar','usd-coin']"),
    vsCurrencies: z.array(z.string()).min(1).default(["usd"]),
  }),
  handler: async (agent, input) => {
    const ids = (input.ids as string[]).join(",");
    const vs = (input.vsCurrencies as string[]).join(",");
    const path = `/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs)}`;
    const data = (await coinGeckoFetch(path, {
      proKey: agent.config.apiKeys?.coinGeckoPro,
    })) as Record<string, unknown>;
    return data;
  },
};

export const coinGeckoTrending: Action = {
  name: "COINGECKO_TRENDING",
  similes: ["trending coins", "trending tokens", "what's hot"],
  description:
    "Fetch the current trending search list from CoinGecko (top-7 coins, plus trending NFTs and categories). Wraps GET /search/trending.",
  examples: [
    [
      {
        input: {},
        output: { coins: [], nfts: [], categories: [] },
        explanation: "Trending data",
      },
    ],
  ],
  schema: z.object({}),
  handler: async (agent) => {
    const data = (await coinGeckoFetch("/search/trending", {
      proKey: agent.config.apiKeys?.coinGeckoPro,
    })) as { coins?: unknown; nfts?: unknown; categories?: unknown };
    return {
      coins: data.coins ?? [],
      nfts: data.nfts ?? [],
      categories: data.categories ?? [],
    };
  },
};

export const coinGeckoTokenInfo: Action = {
  name: "COINGECKO_TOKEN_INFO",
  similes: ["token info", "coin info", "token metadata", "market data"],
  description:
    "Fetch detailed market data for a single coin from CoinGecko by ID (e.g. 'stellar'). Returns price, market cap, volume, ATH/ATL etc. Wraps GET /coins/{id} with localization=false, tickers=false, market_data=true, community_data=false, developer_data=false, sparkline=false.",
  examples: [
    [
      {
        input: { id: "stellar" },
        output: { id: "stellar", symbol: "xlm", market_data: { current_price: { usd: 0.12 } } },
        explanation: "Stellar (XLM) market info",
      },
    ],
  ],
  schema: z.object({
    id: z.string().describe("CoinGecko coin ID, e.g. 'stellar'"),
  }),
  handler: async (agent, input) => {
    const qs =
      "localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false";
    const path = `/coins/${encodeURIComponent(input.id)}?${qs}`;
    const data = (await coinGeckoFetch(path, {
      proKey: agent.config.apiKeys?.coinGeckoPro,
    })) as Record<string, unknown>;
    return data;
  },
};
