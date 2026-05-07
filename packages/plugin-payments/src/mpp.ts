import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";

async function loadMpp() {
  const [{ Mppx }, stellarMod] = await Promise.all([
    import("mppx" as string).catch(() => {
      throw missing("mppx");
    }),
    import("@stellar/mpp/charge/client" as string).catch(() => {
      throw missing("@stellar/mpp");
    }),
  ]);
  return { Mppx, stellar: stellarMod as { charge: (opts: unknown) => unknown } };
}

function missing(pkg: string) {
  const err = new Error(`${pkg} is not installed. Install: npm install mppx @stellar/mpp`);
  (err as Error & { code: string }).code = "MPP_DEPS_MISSING";
  return err;
}

export const mppChargeFetch: Action = {
  name: "MPP_CHARGE_FETCH",
  similes: ["mpp request", "machine payment", "pay per request"],
  description:
    "Make an HTTP request to an MPP-charge-protected endpoint. Each request triggers a Soroban SAC USDC transfer settled directly on-chain (no facilitator). Server may sponsor network fees via feePayer.",
  examples: [
    [
      {
        input: { url: "https://api.example.com/data" },
        output: { status: 200, body: {} },
        explanation: "Settle a USDC transfer + fetch the resource",
      },
    ],
  ],
  schema: z.object({
    url: z.string().url(),
    method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
    body: z.string().optional(),
    headers: z.record(z.string()).optional(),
    secretKey: z
      .string()
      .optional()
      .describe(
        "S... secret for signing the charge transaction. Falls back to config.apiKeys.mppSecretKey.",
      ),
    mode: z.enum(["pull", "push"]).default("pull"),
  }),
  handler: async (agent, input) => {
    const { Keypair } = (await import("@stellar/stellar-sdk")) as {
      Keypair: { fromSecret(s: string): unknown };
    };
    const secret = input.secretKey ?? agent.config.apiKeys?.mppSecretKey;
    if (!secret) {
      const err = new Error("MPP_CHARGE_FETCH requires input.secretKey or config.apiKeys.mppSecretKey.");
      (err as Error & { code: string }).code = "MPP_SECRET_REQUIRED";
      throw err;
    }
    const { Mppx, stellar } = await loadMpp();
    const keypair = Keypair.fromSecret(secret);
    const mppx = (Mppx as { create(opts: unknown): { fetch(u: string, i?: RequestInit): Promise<Response> } }).create({
      methods: [stellar.charge({ keypair, mode: input.mode })],
    });
    const resp = await mppx.fetch(input.url, {
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
