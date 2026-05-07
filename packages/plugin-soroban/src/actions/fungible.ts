import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { invokeContract, simulateContract } from "../utils";

/**
 * Helpers for OpenZeppelin Stellar Fungible token contracts.
 *
 * Reference: https://github.com/OpenZeppelin/stellar-contracts/tree/main/packages/tokens/src/fungible
 *
 * The OZ `FungibleToken` trait exposes (among others):
 *   - name() -> String
 *   - symbol() -> String
 *   - decimals() -> u32
 *   - total_supply() -> i128
 *   - balance(account: Address) -> i128
 *   - transfer(from: Address, to: MuxedAddress, amount: i128)
 *
 * These actions assume a contract someone has deployed themselves from the OZ
 * examples (e.g. `examples/fungible-pausable`); we don't ship the WASM.
 */

const contractSchema = z.object({
  contractId: z.string().describe("C... contract id of an OZ Fungible token contract"),
});

function asString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  // `name()` / `symbol()` return Soroban String which scValToNative decodes to a
  // JS string already, but guard against weird shapes (e.g. Buffer for bytes).
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  return String(value);
}

function asBigIntString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return value.toString();
  if (typeof value === "string") return value;
  return String(value);
}

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export const fungibleTokenInfo: Action = {
  name: "SOROBAN_FUNGIBLE_TOKEN_INFO",
  similes: ["fungible token metadata", "token info", "erc20 info"],
  description:
    "Read name / symbol / decimals / total_supply from a deployed OpenZeppelin Stellar Fungible token contract. Read-only — uses simulation, no transaction is submitted.",
  examples: [
    [
      {
        input: { contractId: "C..." },
        output: { name: "MyToken", symbol: "MYT", decimals: 18, totalSupply: "1000000000000000000000000" },
        explanation: "Read fungible token metadata",
      },
    ],
  ],
  schema: contractSchema,
  handler: async (agent, input) => {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      simulateContract(agent, { contractId: input.contractId, method: "name", args: [] }),
      simulateContract(agent, { contractId: input.contractId, method: "symbol", args: [] }),
      simulateContract(agent, { contractId: input.contractId, method: "decimals", args: [] }),
      simulateContract(agent, { contractId: input.contractId, method: "total_supply", args: [] }),
    ]);
    return {
      name: asString(name.result),
      symbol: asString(symbol.result),
      decimals: asNumber(decimals.result),
      totalSupply: asBigIntString(totalSupply.result),
      errors: {
        name: name.error,
        symbol: symbol.error,
        decimals: decimals.error,
        totalSupply: totalSupply.error,
      },
    };
  },
};

export const fungibleTokenBalance: Action = {
  name: "SOROBAN_FUNGIBLE_TOKEN_BALANCE",
  similes: ["fungible balance", "token balance", "erc20 balance"],
  description:
    "Read the balance(account) of an address on a deployed OpenZeppelin Stellar Fungible token contract. Defaults the account to the agent's wallet. Read-only — uses simulation.",
  examples: [
    [
      {
        input: { contractId: "C..." },
        output: { balance: "1000000" },
        explanation: "Read agent's own fungible-token balance",
      },
    ],
  ],
  schema: contractSchema.extend({
    account: z
      .string()
      .optional()
      .describe("Address whose balance to query (defaults to agent's wallet)"),
  }),
  handler: async (agent, input) => {
    const account = input.account ?? agent.wallet.publicKey;
    const sim = await simulateContract(agent, {
      contractId: input.contractId,
      method: "balance",
      args: [account],
    });
    return {
      balance: asBigIntString(sim.result),
      account,
      error: sim.error,
    };
  },
};

export const fungibleTokenTransfer: Action = {
  name: "SOROBAN_FUNGIBLE_TOKEN_TRANSFER",
  similes: ["transfer fungible", "send token", "erc20 transfer"],
  description:
    "Invoke transfer(from, to, amount) on a deployed OpenZeppelin Stellar Fungible token contract. The `from` defaults to the agent's wallet (which must authorize the transfer). `amount` is an i128 in atomic units, passed as a string.",
  examples: [
    [
      {
        input: { contractId: "C...", to: "G...", amount: "1000000" },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "Send 1.0 (assuming 6 decimals) to recipient",
      },
    ],
  ],
  schema: contractSchema.extend({
    from: z
      .string()
      .optional()
      .describe("Sender address (defaults to agent's wallet)"),
    to: z.string().describe("Recipient address"),
    amount: z
      .string()
      .describe("Amount in atomic units (i128 string, e.g. '1000000' for 1 token at 6 decimals)"),
  }),
  handler: async (agent, input) => {
    const from = input.from ?? agent.wallet.publicKey;
    // Pass amount as bigint so nativeToScVal encodes it as i128 (string would
    // become an ScVal string, which the contract would reject).
    return invokeContract(agent, {
      contractId: input.contractId,
      method: "transfer",
      args: [from, input.to, BigInt(input.amount)],
    });
  },
};
