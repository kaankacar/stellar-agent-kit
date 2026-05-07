import { z } from "zod";
import {
  Address,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";
import { simulateAssembleSignAndSend } from "@stellar-agent-kit/core";
import { MAINNET_CONTRACTS } from "../constants";

/**
 * Blend pool `submit()` request types (per Blend protocol spec):
 *   1 = Supply (collateral or supply-only)
 *   2 = Withdraw
 *   3 = SupplyCollateral (collateral only)
 *   4 = WithdrawCollateral
 *   5 = Borrow
 *   6 = Repay
 *
 * The pool's `submit(from, spender, to, requests)` takes a vec of Request structs:
 *   { request_type: u32, address: Address (asset), amount: i128 }
 */
const REQ = { SUPPLY: 1, WITHDRAW: 2, SUPPLY_COLLATERAL: 3, WITHDRAW_COLLATERAL: 4, BORROW: 5, REPAY: 6 } as const;

async function loadAccount(agent: StellarAgentKit) {
  return agent.horizonServer
    ? ((await agent.horizonServer.loadAccount(agent.wallet.publicKey)) as never)
    : ((await agent.rpcServer.getAccount(agent.wallet.publicKey)) as never);
}

function requestVec(reqType: number, asset: string, amount: string) {
  const requestStruct = nativeToScVal(
    {
      request_type: reqType,
      address: Address.fromString(asset),
      amount: BigInt(amount),
    },
    {
      type: {
        request_type: ["symbol", "u32"],
        address: ["symbol", "address"],
        amount: ["symbol", "i128"],
      },
    },
  );
  return nativeToScVal([requestStruct], { type: "vec" });
}

async function submitToPool(
  agent: StellarAgentKit,
  poolId: string,
  reqType: number,
  asset: string,
  amount: string,
) {
  const account = await loadAccount(agent);
  const pool = new Contract(poolId);
  const userAddr = Address.fromString(agent.wallet.publicKey).toScVal();

  const op = pool.call(
    "submit",
    userAddr,
    userAddr,
    userAddr,
    requestVec(reqType, asset, amount),
  );
  const builder = new TransactionBuilder(account, {
    fee: agent.config.defaultFeeStroops ?? BASE_FEE,
    networkPassphrase: agent.config.networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(180);
  return simulateAssembleSignAndSend(agent, builder);
}

const baseSchema = z.object({
  poolId: z.string().default(MAINNET_CONTRACTS.blendV1Pool),
  asset: z.string().describe("Asset contract address (SAC) being supplied/borrowed/etc."),
  amount: z.string().describe("Amount in atomic units (i128 string)"),
});

export const blendSupply: Action = {
  name: "BLEND_SUPPLY",
  similes: ["lend", "deposit to blend", "supply to blend"],
  description:
    "Supply an asset to a Blend lending pool to earn yield. The agent must have a trustline / SAC balance for the asset.",
  examples: [
    [
      {
        input: { asset: "CCW67...", amount: "1000000" },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "Supply 1 USDC (1e6 atomic) to default Blend pool",
      },
    ],
  ],
  schema: baseSchema,
  handler: async (agent, input) => submitToPool(agent, input.poolId, REQ.SUPPLY, input.asset, input.amount),
};

export const blendBorrow: Action = {
  name: "BLEND_BORROW",
  similes: ["borrow from blend", "take loan"],
  description: "Borrow an asset from a Blend pool against previously-supplied collateral.",
  examples: [
    [
      {
        input: { asset: "CCW67...", amount: "500000" },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "Borrow 0.5 USDC",
      },
    ],
  ],
  schema: baseSchema,
  handler: async (agent, input) => submitToPool(agent, input.poolId, REQ.BORROW, input.asset, input.amount),
};

export const blendWithdraw: Action = {
  name: "BLEND_WITHDRAW",
  similes: ["withdraw from blend", "redeem from blend"],
  description: "Withdraw a previously-supplied asset from a Blend pool.",
  examples: [
    [
      {
        input: { asset: "CCW67...", amount: "500000" },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "Withdraw 0.5 USDC",
      },
    ],
  ],
  schema: baseSchema,
  handler: async (agent, input) =>
    submitToPool(agent, input.poolId, REQ.WITHDRAW, input.asset, input.amount),
};

export const blendRepay: Action = {
  name: "BLEND_REPAY",
  similes: ["repay loan", "pay back"],
  description: "Repay a borrowed asset to a Blend pool.",
  examples: [
    [
      {
        input: { asset: "CCW67...", amount: "500000" },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "Repay 0.5 USDC",
      },
    ],
  ],
  schema: baseSchema,
  handler: async (agent, input) =>
    submitToPool(agent, input.poolId, REQ.REPAY, input.asset, input.amount),
};

export const blendGetPosition: Action = {
  name: "BLEND_GET_POSITION",
  similes: ["my blend position", "check blend position"],
  description:
    "Read the agent's positions (supplied / borrowed / collateral) in a Blend pool via simulation. No transaction is submitted.",
  examples: [
    [
      {
        input: {},
        output: { positions: { supply: {}, liabilities: {}, collateral: {} } },
        explanation: "Position dump",
      },
    ],
  ],
  schema: z.object({
    poolId: z.string().default(MAINNET_CONTRACTS.blendV1Pool),
  }),
  handler: async (agent, input) => {
    const { rpc } = await import("@stellar/stellar-sdk");
    const account = await loadAccount(agent);
    const pool = new Contract(input.poolId);
    const tx = new TransactionBuilder(account, {
      fee: agent.config.defaultFeeStroops ?? BASE_FEE,
      networkPassphrase: agent.config.networkPassphrase,
    })
      .addOperation(pool.call("get_positions", Address.fromString(agent.wallet.publicKey).toScVal()))
      .setTimeout(180)
      .build();

    const sim = await agent.rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      return { error: "SIMULATION_FAILED", message: sim.error };
    }
    if (rpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
      return { positions: scValToNative(sim.result.retval) };
    }
    return { positions: null };
  },
};
