import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { invokeContract, simulateContract } from "../utils";

/**
 * Soroban contract args. Supports primitives plus one level of array nesting.
 *
 * The previous version used a recursive `z.lazy(() => z.array(argSchema))`
 * which is technically more flexible but couldn't be expressed in JSON Schema,
 * so zod-to-json-schema spammed every LLM tool-call with
 *   "Recursive reference detected at #/properties/args/items/anyOf/5/items! Defaulting to any"
 * Two warnings per call. We give up the (rare) deeper nesting in exchange for
 * a clean log surface and a precise tool schema. Truly nested args can be
 * passed as JSON-encoded strings.
 */
const argSchema = z.union([
  z.string(),
  z.number(),
  z.bigint(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.bigint(), z.boolean(), z.null()])),
]);

export const invokeContractAction: Action = {
  name: "SOROBAN_INVOKE_CONTRACT",
  similes: ["call contract", "invoke contract method"],
  description:
    "Invoke a method on a deployed Soroban contract with the given args. Always simulates before submitting; surfaces simulation errors as SIMULATION_FAILED.",
  examples: [
    [
      {
        input: { contractId: "C...", method: "transfer", args: ["G...", "G...", "100"] },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "Call transfer(from, to, amount)",
      },
    ],
  ],
  schema: z.object({
    contractId: z.string(),
    method: z.string(),
    args: z.array(argSchema).default([]),
  }),
  handler: async (agent, input) => {
    return invokeContract(agent, {
      contractId: input.contractId,
      method: input.method,
      args: input.args as never[],
    });
  },
};

export const simulateContractAction: Action = {
  name: "SOROBAN_SIMULATE",
  similes: ["dry run", "preview contract call"],
  description:
    "Simulate a contract call without submitting it on chain. Returns the predicted return value or a structured simulation error.",
  examples: [
    [
      {
        input: { contractId: "C...", method: "balance", args: ["G..."] },
        output: { result: "1000000" },
        explanation: "Read balance without paying for an on-chain tx",
      },
    ],
  ],
  schema: z.object({
    contractId: z.string(),
    method: z.string(),
    args: z.array(argSchema).default([]),
  }),
  handler: async (agent, input) => {
    return simulateContract(agent, {
      contractId: input.contractId,
      method: input.method,
      args: input.args as never[],
    });
  },
};
