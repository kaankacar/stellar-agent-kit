import { z } from "zod";
import type { Action, StellarAgentKit } from "@stellar-agent-kit/core";

/**
 * Lazy-load the Allbridge SDK so this plugin can be installed without it.
 */
async function loadAllbridge() {
  const mod = (await import("@allbridge/bridge-core-sdk" as string).catch(() => {
    const err = new Error(
      "@allbridge/bridge-core-sdk is not installed. Install it: npm install @allbridge/bridge-core-sdk",
    );
    (err as Error & { code: string }).code = "BRIDGE_DEPS_MISSING";
    throw err;
  })) as {
    AllbridgeCoreSdk: new (rpcUrls: Record<string, string>) => unknown;
    nodeRpcUrlsDefault: Record<string, string>;
    Messenger: Record<string, string>;
  };
  return mod;
}

function getStellarRpcOverride(agent: StellarAgentKit): Record<string, string> {
  // Allbridge expects "STLR" / "SRB" keys for Stellar (classic) and Soroban.
  // We pass the agent's configured RPC for Soroban, and reuse Horizon for Stellar.
  const overrides: Record<string, string> = { SRB: agent.config.rpcUrl };
  if (agent.config.horizonUrl) overrides.STLR = agent.config.horizonUrl;
  return overrides;
}

export const bridgeListTokens: Action = {
  name: "BRIDGE_LIST_TOKENS",
  similes: ["list bridge tokens", "supported chains", "bridgeable assets"],
  description:
    "List all tokens bridgeable via Allbridge Core, grouped by chain. Returns tokens that can move to or from Stellar / Soroban.",
  examples: [[{ input: {}, output: { chains: {} }, explanation: "" }]],
  schema: z.object({
    chainSymbol: z
      .string()
      .optional()
      .describe("Filter to one chain (e.g. 'ETH', 'STLR', 'SRB'). Omit for all."),
  }),
  handler: async (agent, input) => {
    const { AllbridgeCoreSdk, nodeRpcUrlsDefault } = await loadAllbridge();
    const sdk = new AllbridgeCoreSdk({
      ...nodeRpcUrlsDefault,
      ...getStellarRpcOverride(agent),
    }) as { chainDetailsMap(): Promise<Record<string, unknown>> };
    const chains = await sdk.chainDetailsMap();
    if (input.chainSymbol) {
      return { chains: { [input.chainSymbol]: chains[input.chainSymbol] ?? null } };
    }
    return { chains };
  },
};

export const bridgeQuote: Action = {
  name: "BRIDGE_QUOTE",
  similes: ["bridge quote", "cross-chain quote", "estimate bridge"],
  description:
    "Estimate how much of `destinationToken` will be received when bridging `sourceAmount` of `sourceToken`. Pass tokens by symbol on each chain (e.g. USDC on ETH → USDC on STLR).",
  examples: [
    [
      {
        input: {
          sourceChain: "ETH",
          sourceTokenSymbol: "USDC",
          destinationChain: "STLR",
          destinationTokenSymbol: "USDC",
          amount: "100",
        },
        output: { amountToReceive: "99.4" },
        explanation: "Bridge $100 USDC ETH→Stellar",
      },
    ],
  ],
  schema: z.object({
    sourceChain: z.string(),
    sourceTokenSymbol: z.string(),
    destinationChain: z.string(),
    destinationTokenSymbol: z.string(),
    amount: z.string(),
  }),
  handler: async (agent, input) => {
    const { AllbridgeCoreSdk, nodeRpcUrlsDefault } = await loadAllbridge();
    const sdk = new AllbridgeCoreSdk({
      ...nodeRpcUrlsDefault,
      ...getStellarRpcOverride(agent),
    }) as {
      chainDetailsMap(): Promise<Record<string, { tokens?: Array<{ symbol: string }> }>>;
      getAmountToBeReceived(
        amount: string,
        sourceToken: unknown,
        destinationToken: unknown,
      ): Promise<string>;
    };
    const chains = await sdk.chainDetailsMap();
    const src = chains[input.sourceChain]?.tokens?.find(
      (t) => t.symbol === input.sourceTokenSymbol,
    );
    const dst = chains[input.destinationChain]?.tokens?.find(
      (t) => t.symbol === input.destinationTokenSymbol,
    );
    if (!src || !dst) {
      return {
        error: "TOKEN_NOT_FOUND",
        sourceFound: !!src,
        destinationFound: !!dst,
      };
    }
    const amountToReceive = await sdk.getAmountToBeReceived(input.amount, src, dst);
    return { amountToReceive, sourceToken: src, destinationToken: dst };
  },
};

export const bridgeBuildTx: Action = {
  name: "BRIDGE_BUILD_TX",
  similes: ["build bridge tx", "bridge raw tx"],
  description:
    "Build a raw bridge transaction for the consumer to sign and submit. Returns the raw tx — does NOT broadcast. Caller signs with their chain-native wallet (Stellar XDR for STLR/SRB sources, EVM tx for EVM sources).",
  examples: [
    [
      {
        input: {
          sourceChain: "STLR",
          sourceTokenSymbol: "USDC",
          destinationChain: "ETH",
          destinationTokenSymbol: "USDC",
          amount: "100",
          fromAccount: "G...",
          toAccount: "0x...",
        },
        output: { rawTx: "..." },
        explanation: "Stellar -> ETH USDC bridge",
      },
    ],
  ],
  schema: z.object({
    sourceChain: z.string(),
    sourceTokenSymbol: z.string(),
    destinationChain: z.string(),
    destinationTokenSymbol: z.string(),
    amount: z.string(),
    fromAccount: z.string().optional(),
    toAccount: z.string(),
    messenger: z.enum(["ALLBRIDGE", "WORMHOLE"]).default("ALLBRIDGE"),
  }),
  handler: async (agent, input) => {
    const { AllbridgeCoreSdk, nodeRpcUrlsDefault, Messenger } = await loadAllbridge();
    const sdk = new AllbridgeCoreSdk({
      ...nodeRpcUrlsDefault,
      ...getStellarRpcOverride(agent),
    }) as {
      chainDetailsMap(): Promise<Record<string, { tokens?: Array<{ symbol: string }> }>>;
      bridge: {
        rawTxBuilder: {
          send(params: Record<string, unknown>): Promise<unknown>;
        };
      };
    };
    const chains = await sdk.chainDetailsMap();
    const src = chains[input.sourceChain]?.tokens?.find(
      (t) => t.symbol === input.sourceTokenSymbol,
    );
    const dst = chains[input.destinationChain]?.tokens?.find(
      (t) => t.symbol === input.destinationTokenSymbol,
    );
    if (!src || !dst) {
      return { error: "TOKEN_NOT_FOUND", sourceFound: !!src, destinationFound: !!dst };
    }
    const rawTx = await sdk.bridge.rawTxBuilder.send({
      amount: input.amount,
      fromAccountAddress: input.fromAccount ?? agent.wallet.publicKey,
      toAccountAddress: input.toAccount,
      sourceToken: src,
      destinationToken: dst,
      messenger: Messenger[input.messenger],
    });
    return { rawTx };
  },
};
