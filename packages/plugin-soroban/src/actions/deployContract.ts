import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { simulateAssembleSignAndSend } from "@stellar-agent-kit/core";
import { Operation, TransactionBuilder, BASE_FEE, Address } from "@stellar/stellar-sdk";
import { loadSourceAccount, toScVals } from "../utils";

export const deployContract: Action = {
  name: "SOROBAN_DEPLOY_CONTRACT",
  similes: ["create contract", "instantiate contract", "deploy soroban contract"],
  description:
    "Deploy a Soroban contract instance from a previously installed WASM hash. Optionally invokes the contract's constructor with the provided args.",
  examples: [
    [
      {
        input: { wasmHash: "def...", salt: "0x00", constructorArgs: [] },
        output: { hash: "...", contractId: "C..." },
        explanation: "Deploy a fresh instance",
      },
    ],
  ],
  schema: z.object({
    wasmHash: z.string().describe("Hex-encoded WASM hash from SOROBAN_INSTALL_WASM"),
    salt: z
      .string()
      .optional()
      .describe("Optional 32-byte hex salt; default is a deterministic per-account value"),
    constructorArgs: z.array(z.any()).default([]),
  }),
  handler: async (agent, input) => {
    const account = await loadSourceAccount(agent);
    const wasmHashBuf = Buffer.from(input.wasmHash, "hex");
    const saltBuf = input.salt ? Buffer.from(input.salt.replace(/^0x/, ""), "hex") : undefined;

    const op = Operation.createCustomContract({
      address: Address.fromString(agent.wallet.publicKey),
      wasmHash: wasmHashBuf,
      ...(saltBuf ? { salt: saltBuf } : {}),
      constructorArgs: toScVals(input.constructorArgs),
    });

    const builder = new TransactionBuilder(account, {
      fee: agent.config.defaultFeeStroops ?? BASE_FEE,
      networkPassphrase: agent.config.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(180);

    return simulateAssembleSignAndSend(agent, builder);
  },
};
