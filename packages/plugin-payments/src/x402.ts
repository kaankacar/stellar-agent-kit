import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";

/**
 * Helper: dynamically load the optional @x402/* deps so this package can
 * be installed even if the consumer doesn't use x402.
 */
async function loadX402() {
  const [{ x402HTTPClient }, stellar, schemeMod] = await Promise.all([
    import("@x402/fetch" as string).catch(() => {
      throw missing("@x402/fetch");
    }),
    import("@x402/stellar" as string).catch(() => {
      throw missing("@x402/stellar");
    }),
    import("@x402/stellar/exact/client" as string).catch(() => {
      throw missing("@x402/stellar");
    }),
  ]);
  const { createEd25519Signer, getNetworkPassphrase } = stellar as {
    createEd25519Signer: (keypair: unknown, networkPassphrase: string) => unknown;
    getNetworkPassphrase: (id: string) => string;
  };
  const { ExactStellarScheme } = schemeMod as { ExactStellarScheme: unknown };
  return { x402HTTPClient, createEd25519Signer, getNetworkPassphrase, ExactStellarScheme };
}

function missing(pkg: string) {
  const err = new Error(
    `${pkg} is not installed. Install x402 deps: npm install @x402/fetch @x402/stellar`,
  );
  (err as Error & { code: string }).code = "X402_DEPS_MISSING";
  return err;
}

export const x402Fetch: Action = {
  name: "X402_FETCH",
  similes: ["pay api", "fetch paid endpoint", "x402 request"],
  description:
    "Make an HTTP request to a paid endpoint that responds with HTTP 402 Payment Required. Automatically signs Soroban auth entries and retries via the OZ Channels facilitator. Works only with KeypairWallet for now (the underlying x402 lib needs the secret to sign auth entries).",
  examples: [
    [
      {
        input: { url: "https://api.example.com/weather", network: "stellar:testnet" },
        output: { status: 200, body: { city: "SF", temp: 18 } },
        explanation: "Pay $0.001 USDC for the weather API",
      },
    ],
  ],
  schema: z.object({
    url: z.string().url(),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
    body: z.string().optional().describe("Optional request body (already serialized)"),
    headers: z.record(z.string()).optional(),
    network: z.enum(["stellar:testnet", "stellar:pubnet"]).default("stellar:testnet"),
    secretKey: z
      .string()
      .optional()
      .describe(
        "S... secret key for auth-entry signing. If omitted, requires that the agent's wallet expose its secret via config.apiKeys.x402SecretKey.",
      ),
  }),
  handler: async (agent, input) => {
    const { Keypair } = (await import("@stellar/stellar-sdk")) as {
      Keypair: { fromSecret(s: string): unknown };
    };
    const secret = input.secretKey ?? agent.config.apiKeys?.x402SecretKey;
    if (!secret) {
      const err = new Error(
        "X402_FETCH requires either input.secretKey or config.apiKeys.x402SecretKey.",
      );
      (err as Error & { code: string }).code = "X402_SECRET_REQUIRED";
      throw err;
    }
    const { x402HTTPClient, createEd25519Signer, getNetworkPassphrase, ExactStellarScheme } =
      await loadX402();
    const keypair = Keypair.fromSecret(secret);
    const passphrase = getNetworkPassphrase(input.network);
    const signer = createEd25519Signer(keypair, passphrase);
    const client = (
      x402HTTPClient as (opts: {
        signer: unknown;
        schemes: unknown[];
      }) => { fetch(url: string, init?: RequestInit): Promise<Response> }
    )({
      signer,
      schemes: [ExactStellarScheme],
    });
    const resp = await client.fetch(input.url, {
      method: input.method,
      body: input.body,
      headers: input.headers,
    });
    const text = await resp.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    return { status: resp.status, ok: resp.ok, body };
  },
};
