import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { Networks } from "@stellar/stellar-sdk";

export const friendbotFund: Action = {
  name: "ACCOUNT_FRIENDBOT_FUND",
  similes: ["friendbot", "fund testnet account", "airdrop testnet xlm"],
  description:
    "Fund a Stellar testnet account using the public Friendbot service. Defaults to the agent's wallet public key. Only works on the testnet — calls on mainnet will be rejected by Friendbot.",
  examples: [
    [
      {
        input: {},
        output: { hash: "...", ledger: 1, funded: true },
        explanation: "Fund the agent's own wallet on testnet",
      },
    ],
  ],
  schema: z.object({
    account: z.string().optional().describe("Stellar G... account to fund. Defaults to agent.wallet.publicKey."),
  }),
  handler: async (agent, input) => {
    const account = input.account ?? agent.wallet.publicKey;
    if (agent.config.networkPassphrase === Networks.PUBLIC) {
      // eslint-disable-next-line no-console
      console.warn(
        "[ACCOUNT_FRIENDBOT_FUND] Agent is configured for the public network; Friendbot only funds testnet accounts.",
      );
    }

    const url = `https://friendbot.stellar.org?addr=${encodeURIComponent(account)}`;
    const resp = await fetch(url, { method: "POST" });
    if (!resp.ok) {
      let detail = "";
      try {
        detail = await resp.text();
      } catch {
        // ignore
      }
      const err = new Error(
        `Friendbot funding failed for ${account}: ${resp.status} ${resp.statusText}${detail ? ` — ${detail}` : ""}`,
      );
      (err as Error & { code: string }).code = "FRIENDBOT_FAILED";
      throw err;
    }

    const body = (await resp.json().catch(() => ({}))) as { hash?: string; ledger?: number };
    return { hash: body.hash, ledger: body.ledger, funded: true };
  },
};
