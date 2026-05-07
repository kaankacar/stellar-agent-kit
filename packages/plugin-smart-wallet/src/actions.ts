import { z } from "zod";
import { Contract, scValToNative, TransactionBuilder, BASE_FEE } from "@stellar/stellar-sdk";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";

/**
 * Read-side actions for OpenZeppelin smart accounts. Write-side flows
 * (signer addition, policy changes) require the active passkey signer
 * and are best invoked from a UI context with smart-account-kit directly.
 */

async function loadAccount(agent: StellarAgentKit) {
  return agent.horizonServer
    ? ((await agent.horizonServer.loadAccount(agent.wallet.publicKey)) as never)
    : ((await agent.rpcServer.getAccount(agent.wallet.publicKey)) as never);
}

async function readMethod(agent: StellarAgentKit, contractId: string, method: string) {
  const { rpc } = await import("@stellar/stellar-sdk");
  const account = await loadAccount(agent);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: agent.config.defaultFeeStroops ?? BASE_FEE,
    networkPassphrase: agent.config.networkPassphrase,
  })
    .addOperation(contract.call(method))
    .setTimeout(180)
    .build();
  const sim = await agent.rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    return { error: "SIMULATION_FAILED", message: sim.error };
  }
  if (rpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
    return { value: scValToNative(sim.result.retval) };
  }
  return { value: null };
}

export const smartWalletInfo: Action = {
  name: "SMART_WALLET_INFO",
  similes: ["smart account info", "wallet contract info"],
  description:
    "Read top-level info about an OpenZeppelin smart-account contract — its threshold and admin signer count. Pass the contract id (C...) of the account.",
  examples: [
    [
      {
        input: { contractId: "C..." },
        output: { threshold: 1, signerCount: 1 },
        explanation: "Inspect a smart account",
      },
    ],
  ],
  schema: z.object({
    contractId: z.string().optional().describe("Defaults to the agent's wallet (when it's a smart account)"),
  }),
  handler: async (agent, input) => {
    const cid = input.contractId ?? agent.wallet.publicKey;
    if (!cid.startsWith("C")) {
      return { error: "NOT_SMART_ACCOUNT", message: "Wallet is not a smart-account contract." };
    }
    const [threshold, signers] = await Promise.all([
      readMethod(agent, cid, "get_threshold"),
      readMethod(agent, cid, "get_signers"),
    ]);
    return { contractId: cid, threshold, signers };
  },
};

export const smartWalletGetSigners: Action = {
  name: "SMART_WALLET_GET_SIGNERS",
  similes: ["list signers", "get authorized signers"],
  description: "Return the list of authorized signers on a smart-account contract.",
  examples: [
    [
      {
        input: { contractId: "C..." },
        output: { signers: [] },
        explanation: "Read signer set",
      },
    ],
  ],
  schema: z.object({
    contractId: z.string().optional(),
  }),
  handler: async (agent, input) => {
    const cid = input.contractId ?? agent.wallet.publicKey;
    return readMethod(agent, cid, "get_signers");
  },
};
