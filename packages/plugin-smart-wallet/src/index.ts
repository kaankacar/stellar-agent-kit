import type { Plugin } from "@stellar-agent-kit/core";
import { smartWalletInfo, smartWalletGetSigners } from "./actions";

export const SmartWalletPlugin: Plugin = {
  name: "smart-wallet",
  methods: {},
  actions: [smartWalletInfo, smartWalletGetSigners],
  initialize() {},
};

export default SmartWalletPlugin;
export { smartWalletInfo, smartWalletGetSigners };
export { SmartAccountWallet, type SmartAccountSigner } from "./wallet";
