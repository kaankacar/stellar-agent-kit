import {
  Account,
  Contract,
  nativeToScVal,
  scValToNative,
  TransactionBuilder,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk";
import {
  type StellarAgentKit,
  simulateAssembleSignAndSend,
  type SendTxResult,
} from "@stellar-agent-kit/core";

export type ScArgValue = string | number | bigint | boolean | null | ScArgValue[];

export interface ContractCall {
  contractId: string;
  method: string;
  args: ScArgValue[];
}

export function toScVals(args: ScArgValue[]): xdr.ScVal[] {
  return args.map((a) => nativeToScVal(a));
}

export function fromScVal(value: xdr.ScVal): unknown {
  return scValToNative(value);
}

/**
 * Load the agent's source account in a form usable by TransactionBuilder.
 * Prefers Horizon's AccountResponse (more metadata) and falls back to the
 * Soroban RPC's Account when Horizon isn't configured. Both shapes satisfy
 * the SDK's `Account` interface.
 */
export async function loadSourceAccount(agent: StellarAgentKit): Promise<Account> {
  const horizon = agent.horizonServer;
  if (horizon) return (await horizon.loadAccount(agent.wallet.publicKey)) as unknown as Account;
  return (await agent.rpcServer.getAccount(agent.wallet.publicKey)) as unknown as Account;
}

export async function invokeContract(
  agent: StellarAgentKit,
  call: ContractCall,
): Promise<SendTxResult & { result?: unknown }> {
  const account = await loadSourceAccount(agent);
  const contract = new Contract(call.contractId);
  const op = contract.call(call.method, ...toScVals(call.args));

  const builder = new TransactionBuilder(account, {
    fee: agent.config.defaultFeeStroops ?? BASE_FEE,
    networkPassphrase: agent.config.networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(180);

  return simulateAssembleSignAndSend(agent, builder);
}

export async function simulateContract(
  agent: StellarAgentKit,
  call: ContractCall,
): Promise<{ result?: unknown; error?: string }> {
  const { rpc } = await import("@stellar/stellar-sdk");
  const account = await loadSourceAccount(agent);
  const contract = new Contract(call.contractId);
  const op = contract.call(call.method, ...toScVals(call.args));
  const tx = new TransactionBuilder(account, {
    fee: agent.config.defaultFeeStroops ?? BASE_FEE,
    networkPassphrase: agent.config.networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(180)
    .build();

  const sim = await agent.rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    return { error: sim.error };
  }
  if (rpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
    return { result: fromScVal(sim.result.retval) };
  }
  return { result: undefined };
}

