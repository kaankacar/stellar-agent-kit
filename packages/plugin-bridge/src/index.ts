import type { Plugin } from "@stellar-agent-kit/core";
import { bridgeListTokens, bridgeQuote, bridgeBuildTx } from "./actions";

export const BridgePlugin: Plugin = {
  name: "stellar-bridge",
  methods: {},
  actions: [bridgeListTokens, bridgeQuote, bridgeBuildTx],
  initialize() {},
};

export default BridgePlugin;
export { bridgeListTokens, bridgeQuote, bridgeBuildTx };
