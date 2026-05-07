import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { invokeContract, simulateContract } from "../utils";

const argSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.bigint(),
    z.boolean(),
    z.null(),
    z.array(argSchema),
  ]),
);

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
