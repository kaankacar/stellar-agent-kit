import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";

const DEFAULT_QUERY_API = "https://sorobandomains-query.lightsail.network/api/v2/query";

interface QueryRecord {
  domain?: string;
  address?: string;
  expiration?: number;
  records?: Record<string, unknown>;
}

interface QueryResponse {
  legacy?: { status?: string; record?: QueryRecord };
  modern?: { status?: string; record?: QueryRecord };
  error?: string;
}

async function queryApi(
  endpoint: string,
  q: string,
  type: "domain" | "address",
): Promise<QueryResponse> {
  const url = `${endpoint}?q=${encodeURIComponent(q)}&type=${type}`;
  const resp = await fetch(url);
  const text = await resp.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }
  if (!resp.ok && resp.status !== 404) {
    const err = new Error(
      `Soroban Domains query failed: ${resp.status} ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
    (err as Error & { code: string }).code = "DOMAIN_QUERY_FAILED";
    throw err;
  }
  return body as QueryResponse;
}

function pickRecord(resp: QueryResponse): QueryRecord | undefined {
  // Prefer modern (post-migration registry); fall back to legacy.
  if (resp.modern?.status === "found" && resp.modern.record) return resp.modern.record;
  if (resp.legacy?.status === "found" && resp.legacy.record) return resp.legacy.record;
  return undefined;
}

export const domainResolve: Action = {
  name: "DOMAIN_RESOLVE",
  similes: ["lookup name", "resolve domain", "find address for name"],
  description:
    "Resolve a Soroban Domains name (e.g. 'overcat.xlm', 'payments.alice.xlm') to a Stellar G... address. Returns { found: false } if the name is unregistered or expired.",
  examples: [
    [
      {
        input: { domain: "overcat.xlm" },
        output: { found: true, address: "G..." },
        explanation: "Forward lookup",
      },
    ],
  ],
  schema: z.object({
    domain: z.string().describe("The domain name, including .xlm suffix"),
  }),
  handler: async (agent, input) => {
    const endpoint = agent.config.apiKeys?.sorobanDomainsQueryUrl ?? DEFAULT_QUERY_API;
    const result = await queryApi(endpoint, input.domain, "domain");
    const record = pickRecord(result);
    if (!record?.address) return { found: false, raw: result };
    return {
      found: true,
      domain: input.domain,
      address: record.address,
      expiration: record.expiration,
      records: record.records,
    };
  },
};

export const domainReverse: Action = {
  name: "DOMAIN_REVERSE",
  similes: ["reverse lookup", "name for address", "find domain for address"],
  description:
    "Reverse-lookup a Stellar G... address to its primary registered Soroban Domains name. Returns { found: false } if the address has no reverse-domain set.",
  examples: [
    [
      {
        input: { address: "GDMTVHLWJTHSUDMZVVMXXH6VJHA2ZV3HNG5LYNAZ6RTWB7GISM6PGTUV" },
        output: { found: true, domain: "alice.xlm" },
        explanation: "Reverse lookup",
      },
    ],
  ],
  schema: z.object({
    address: z.string().describe("Stellar G... address"),
  }),
  handler: async (agent, input) => {
    const endpoint = agent.config.apiKeys?.sorobanDomainsQueryUrl ?? DEFAULT_QUERY_API;
    const result = await queryApi(endpoint, input.address, "address");
    const record = pickRecord(result);
    if (!record?.domain) return { found: false, raw: result };
    return { found: true, address: input.address, domain: record.domain };
  },
};
