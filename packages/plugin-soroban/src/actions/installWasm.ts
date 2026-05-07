import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { simulateAssembleSignAndSend } from "@stellar-agent-kit/core";
import { Operation, TransactionBuilder, BASE_FEE } from "@stellar/stellar-sdk";
import { loadSourceAccount } from "../utils";

export const installWasm: Action = {
  name: "SOROBAN_INSTALL_WASM",
  similes: ["upload contract code", "install wasm"],
  description:
    "Upload Soroban contract WASM bytecode to the network so it can later be deployed as one or more contract instances. Returns the WASM hash.",
  examples: [
    [
      {
        input: { wasmBase64: "AGFzbQ..." },
        output: { hash: "abc...", wasmHash: "def..." },
        explanation: "Upload contract bytes",
      },
    ],
  ],
  schema: z.object({
    wasmBase64: z.string().describe("Base64-encoded WASM contract bytecode"),
  }),
  handler: async (agent, input) => {
    const wasm = Buffer.from(input.wasmBase64, "base64");
    const account = await loadSourceAccount(agent);
    const builder = new TransactionBuilder(account, {
      fee: agent.config.defaultFeeStroops ?? BASE_FEE,
      networkPassphrase: agent.config.networkPassphrase,
    })
      .addOperation(Operation.uploadContractWasm({ wasm }))
      .setTimeout(180);

    const result = await simulateAssembleSignAndSend(agent, builder);
    return result;
  },
};
