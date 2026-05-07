import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { Operation } from "@stellar/stellar-sdk";
import { buildSubmitClassic } from "../utils";

// Account flag bit values per CAP-0018 / Stellar protocol.
const AUTH_REQUIRED = 1;
const AUTH_REVOCABLE = 2;
const AUTH_IMMUTABLE = 4;
const AUTH_CLAWBACK_ENABLED = 8;

export const setOptions: Action = {
  name: "ASSET_SET_OPTIONS",
  similes: ["set issuer options", "set home domain", "set auth flags"],
  description:
    "Update issuer/account options on the agent's wallet: home_domain, auth flags (required, revocable, immutable, clawback), inflation destination.",
  examples: [
    [
      {
        input: { homeDomain: "example.com", authRequired: true, authRevocable: true },
        output: { hash: "...", ledger: 1 },
        explanation: "Make the agent a regulated issuer",
      },
    ],
  ],
  schema: z.object({
    homeDomain: z.string().optional(),
    inflationDest: z.string().optional(),
    authRequired: z.boolean().optional(),
    authRevocable: z.boolean().optional(),
    authImmutable: z.boolean().optional(),
    authClawbackEnabled: z.boolean().optional(),
  }),
  handler: async (agent, input) => {
    let setFlags = 0;
    if (input.authRequired) setFlags |= AUTH_REQUIRED;
    if (input.authRevocable) setFlags |= AUTH_REVOCABLE;
    if (input.authImmutable) setFlags |= AUTH_IMMUTABLE;
    if (input.authClawbackEnabled) setFlags |= AUTH_CLAWBACK_ENABLED;

    const { hash, ledger } = await buildSubmitClassic(agent, (b) =>
      b.addOperation(
        Operation.setOptions({
          homeDomain: input.homeDomain,
          inflationDest: input.inflationDest,
          // Cast: setOptions accepts an `AuthFlag` enum but the underlying value is the same uint8 bitmask.
          setFlags: setFlags ? (setFlags as 1 | 2 | 4 | 8) : undefined,
        }),
      ),
    );
    return { hash, ledger };
  },
};
