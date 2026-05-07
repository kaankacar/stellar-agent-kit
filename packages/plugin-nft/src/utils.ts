import {
  Address,
  Account,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  type StellarAgentKit,
  simulateAssembleSignAndSend,
  type SendTxResult,
} from "@stellar-agent-kit/core";

export async function loadAccount(agent: StellarAgentKit): Promise<Account> {
  return agent.horizonServer
    ? ((await agent.horizonServer.loadAccount(agent.wallet.publicKey)) as unknown as Account)
    : ((await agent.rpcServer.getAccount(agent.wallet.publicKey)) as unknown as Account);
}

export async function readNftMethod(
  agent: StellarAgentKit,
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<{ value?: unknown; error?: string }> {
  const { rpc } = await import("@stellar/stellar-sdk");
  const account = await loadAccount(agent);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: agent.config.defaultFeeStroops ?? BASE_FEE,
    networkPassphrase: agent.config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(180)
    .build();
  const sim = await agent.rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    return { error: sim.error };
  }
  if (rpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
    return { value: scValToNative(sim.result.retval) };
  }
  return { value: null };
}

export async function writeNftMethod(
  agent: StellarAgentKit,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<SendTxResult> {
  const account = await loadAccount(agent);
  const contract = new Contract(contractId);
  const builder = new TransactionBuilder(account, {
    fee: agent.config.defaultFeeStroops ?? BASE_FEE,
    networkPassphrase: agent.config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(180);
  return simulateAssembleSignAndSend(agent, builder);
}

export function addressArg(address: string): xdr.ScVal {
  return Address.fromString(address).toScVal();
}

export function u32Arg(n: number): xdr.ScVal {
  return nativeToScVal(n, { type: "u32" });
}
