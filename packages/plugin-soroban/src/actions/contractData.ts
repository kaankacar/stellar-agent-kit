import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { Contract, xdr } from "@stellar/stellar-sdk";
import { fromScVal, toScVals } from "../utils";

export const getContractData: Action = {
  name: "SOROBAN_GET_CONTRACT_DATA",
  similes: ["read contract storage", "get ledger entry"],
  description:
    "Read a single ledger entry from a contract's storage. Specify the contract id, the ScVal key (as JSON), and the durability ('persistent' | 'temporary' | 'instance').",
  examples: [
    [
      {
        input: { contractId: "C...", key: "Counter", durability: "persistent" },
        output: { value: 42 },
        explanation: "Read a counter from persistent storage",
      },
    ],
  ],
  schema: z.object({
    contractId: z.string(),
    key: z.any().describe("The storage key — passed through nativeToScVal"),
    durability: z.enum(["persistent", "temporary", "instance"]).default("persistent"),
  }),
  handler: async (agent, input) => {
    const contract = new Contract(input.contractId);
    const keyVal = toScVals([input.key])[0]!;
    const durability =
      input.durability === "temporary"
        ? xdr.ContractDataDurability.temporary()
        : xdr.ContractDataDurability.persistent();
    const ledgerKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: contract.address().toScAddress(),
        key:
          input.durability === "instance"
            ? xdr.ScVal.scvLedgerKeyContractInstance()
            : keyVal,
        durability,
      }),
    );
    const resp = await agent.rpcServer.getLedgerEntries(ledgerKey);
    if (!resp.entries?.length) {
      return { found: false };
    }
    const entry = resp.entries[0]!;
    const data = entry.val.contractData();
    return { found: true, value: fromScVal(data.val()) };
  },
};
