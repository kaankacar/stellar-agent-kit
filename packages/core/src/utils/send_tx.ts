import { rpc, TransactionBuilder, Transaction, FeeBumpTransaction } from "@stellar/stellar-sdk";
import type { StellarAgentKit } from "../agent";

export interface SendTxResult {
  hash: string;
  status: "SUCCESS" | "FAILED" | "TIMEOUT";
  resultMetaXdr?: string;
  errorResultXdr?: string;
}

/**
 * For Soroban (smart-contract) transactions:
 * 1. simulate
 * 2. assemble
 * 3. wallet signs
 * 4. send
 * 5. poll until SUCCESS / FAILED / TIMEOUT
 *
 * Encoded gotcha: never assume sendTransaction returns the final status.
 * It returns PENDING. We must poll getTransaction(hash) until terminal.
 */
export async function simulateAssembleSignAndSend(
  agent: StellarAgentKit,
  txBuilder: TransactionBuilder,
): Promise<SendTxResult> {
  const builtTx = txBuilder.build();
  const simResp = await agent.rpcServer.simulateTransaction(builtTx);

  if (rpc.Api.isSimulationError(simResp)) {
    const err = new Error(`Simulation failed: ${simResp.error}`);
    (err as Error & { code: string }).code = "SIMULATION_FAILED";
    throw err;
  }

  const assembled = rpc.assembleTransaction(builtTx, simResp).build();

  if (agent.config.signOnly) {
    const signedXdr = await agent.wallet.signTransaction(assembled.toXDR(), {
      networkPassphrase: agent.config.networkPassphrase,
      accountToSign: agent.wallet.publicKey,
    });
    return { hash: "", status: "SUCCESS", resultMetaXdr: signedXdr };
  }

  const signedXdr = await agent.wallet.signTransaction(assembled.toXDR(), {
    networkPassphrase: agent.config.networkPassphrase,
    accountToSign: agent.wallet.publicKey,
  });

  const signedTx = TransactionBuilder.fromXDR(signedXdr, agent.config.networkPassphrase) as
    | Transaction
    | FeeBumpTransaction;

  const sendResp = await agent.rpcServer.sendTransaction(signedTx);

  if (sendResp.status === "ERROR") {
    const err = new Error(`sendTransaction error: ${sendResp.errorResult?.toString()}`);
    (err as Error & { code: string }).code = "SEND_FAILED";
    throw err;
  }

  return await pollTransaction(agent, sendResp.hash);
}

export async function pollTransaction(
  agent: StellarAgentKit,
  hash: string,
): Promise<SendTxResult> {
  const interval = agent.config.pollIntervalMs ?? 1000;
  const maxAttempts = agent.config.maxPollAttempts ?? 30;

  for (let i = 0; i < maxAttempts; i++) {
    const resp = await agent.rpcServer.getTransaction(hash);
    if (resp.status === "SUCCESS") {
      return {
        hash,
        status: "SUCCESS",
        resultMetaXdr: resp.resultMetaXdr?.toXDR("base64"),
      };
    }
    if (resp.status === "FAILED") {
      return {
        hash,
        status: "FAILED",
        errorResultXdr: resp.resultXdr?.toXDR("base64"),
      };
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return { hash, status: "TIMEOUT" };
}
