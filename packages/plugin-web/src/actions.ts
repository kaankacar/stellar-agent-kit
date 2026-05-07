import { z } from "zod";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";

const BRAVE_API_BASE = "https://api.search.brave.com/res/v1";

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
  language?: string;
}

interface BraveResponse {
  web?: { results?: BraveWebResult[] };
}

function getBraveKey(agent: StellarAgentKit): string {
  const key = agent.config.apiKeys?.brave;
  if (!key) {
    const err = new Error(
      "Brave Search API key missing. Set config.apiKeys.brave (free tier: https://api.search.brave.com/app/keys).",
    );
    (err as Error & { code: string }).code = "API_KEY_MISSING";
    throw err;
  }
  return key;
}

export const webSearch: Action = {
  name: "WEB_SEARCH",
  similes: ["search the web", "google", "look up", "fetch from internet"],
  description:
    "Search the open web via Brave Search. Returns up to N relevant results with title, URL, snippet. Use this for fetching docs, news, contract addresses, current events — anything the agent can't get from on-chain data.",
  examples: [
    [
      {
        input: { query: "Soroswap aggregator API contract address mainnet", count: 5 },
        output: { results: [{ title: "...", url: "...", description: "..." }] },
        explanation: "Find Soroswap contract addresses",
      },
    ],
  ],
  schema: z.object({
    query: z.string().describe("The search query."),
    count: z.number().int().min(1).max(20).default(5),
    freshness: z
      .enum(["pd", "pw", "pm", "py"])
      .optional()
      .describe("Recency filter: pd=24h, pw=7d, pm=30d, py=1y. Omit for any age."),
    country: z.string().length(2).optional().describe("ISO country code, e.g. 'US', 'MX', 'TR'."),
  }),
  handler: async (agent, input) => {
    const key = getBraveKey(agent);
    const params = new URLSearchParams({ q: input.query, count: String(input.count) });
    if (input.freshness) params.set("freshness", input.freshness);
    if (input.country) params.set("country", input.country.toLowerCase());
    const resp = await fetch(`${BRAVE_API_BASE}/web/search?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": key,
      },
    });
    if (!resp.ok) {
      const text = await resp.text();
      const err = new Error(`Brave Search failed: ${resp.status} ${text}`);
      (err as Error & { code: string }).code = "BRAVE_API_ERROR";
      throw err;
    }
    const data = (await resp.json()) as BraveResponse;
    const results = (data.web?.results ?? []).slice(0, input.count).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description,
      age: r.age,
    }));
    return { query: input.query, count: results.length, results };
  },
};

export const webFetch: Action = {
  name: "WEB_FETCH",
  similes: ["read url", "fetch page", "get web content"],
  description:
    "Fetch the contents of a URL. Returns up to ~16KB of text-extracted content. Use after WEB_SEARCH when you need the full page text.",
  examples: [
    [
      {
        input: { url: "https://docs.stellar.org" },
        output: { status: 200, length: 12345, content: "..." },
        explanation: "Read Stellar docs",
      },
    ],
  ],
  schema: z.object({
    url: z.string().url(),
    maxBytes: z.number().int().positive().max(65536).default(16384),
  }),
  handler: async (_agent, input) => {
    const resp = await fetch(input.url, {
      headers: { "User-Agent": "stellar-agent-kit/0.1.0 (+https://github.com/stellar/stellar-agent-kit)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      return {
        status: resp.status,
        ok: false,
        error: `HTTP ${resp.status} ${resp.statusText}`,
      };
    }
    const contentType = resp.headers.get("content-type") ?? "";
    const buf = await resp.arrayBuffer();
    const text = new TextDecoder().decode(buf.slice(0, input.maxBytes));
    // Strip basic HTML tags for readability when content is HTML.
    const stripped = contentType.includes("text/html")
      ? text
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : text;
    return {
      status: resp.status,
      ok: true,
      contentType,
      length: stripped.length,
      truncated: buf.byteLength > input.maxBytes,
      content: stripped,
    };
  },
};
