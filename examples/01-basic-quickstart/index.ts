/**
 * Basic quickstart: create a Stellar agent on testnet, fund it via Friendbot,
 * inspect its balance, send a payment to itself (no-op transfer for demo),
 * and pull recent transactions.
 *
 * Run:
 *   pnpm --filter @stellar-agent-kit/example-basic-quickstart start
 */
import { Keypair, Networks } from "@stellar/stellar-sdk";
import {
  StellarAgentKit,
  KeypairWallet,
  executeAction,
} from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
import { DataPlugin } from "@stellar-agent-kit/plugin-data";

async function friendbotFund(publicKey: string): Promise<void> {
  const resp = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
  if (!resp.ok) throw new Error(`Friendbot funding failed: ${resp.status}`);
}

async function main(): Promise<void> {
  const keypair = Keypair.random();
  console.log(`[+] Generated keypair G... ${keypair.publicKey()}`);

  console.log("[+] Funding via Friendbot…");
  await friendbotFund(keypair.publicKey());

  const wallet = new KeypairWallet(keypair.secret());
  const agent = new StellarAgentKit(wallet, {
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
  })
    .use(StellarAssetPlugin)
    .use(DataPlugin);

  console.log(`[+] ${agent.actions.length} actions registered:`);
  for (const action of agent.actions) console.log(`    - ${action.name}`);

  const balanceAction = agent.actions.find((a) => a.name === "ASSET_GET_BALANCE")!;
  const balance = await executeAction(balanceAction, agent, {});
  console.log("[+] Balance:", JSON.stringify(balance, null, 2));

  const transferAction = agent.actions.find((a) => a.name === "ASSET_TRANSFER")!;
  console.log("[+] Self-transfer 1 XLM…");
  const transferResult = await executeAction(transferAction, agent, {
    destination: keypair.publicKey(),
    assetCode: "XLM",
    amount: "1",
  });
  console.log("[+] Transfer:", JSON.stringify(transferResult, null, 2));

  const historyAction = agent.actions.find((a) => a.name === "HORIZON_TX_HISTORY")!;
  const history = await executeAction(historyAction, agent, { limit: 3, order: "desc" });
  console.log("[+] Recent transactions:", JSON.stringify(history, null, 2));
}

main().catch((err) => {
  console.error("[x] Quickstart failed:", err);
  process.exit(1);
});
