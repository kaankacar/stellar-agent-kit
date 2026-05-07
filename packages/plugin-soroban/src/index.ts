import type { Plugin } from "@stellar-agent-kit/core";
import { installWasm } from "./actions/installWasm";
import { deployContract } from "./actions/deployContract";
import { invokeContractAction, simulateContractAction } from "./actions/invoke";
import { getContractData } from "./actions/contractData";
import { getEvents } from "./actions/events";
import {
  fungibleTokenInfo,
  fungibleTokenBalance,
  fungibleTokenTransfer,
} from "./actions/fungible";

export const SorobanPlugin: Plugin = {
  name: "soroban",
  methods: {},
  actions: [
    installWasm,
    deployContract,
    invokeContractAction,
    simulateContractAction,
    getContractData,
    getEvents,
    fungibleTokenInfo,
    fungibleTokenBalance,
    fungibleTokenTransfer,
  ],
  initialize() {},
};

export default SorobanPlugin;
export {
  installWasm,
  deployContract,
  invokeContractAction,
  simulateContractAction,
  getContractData,
  getEvents,
  fungibleTokenInfo,
  fungibleTokenBalance,
  fungibleTokenTransfer,
};
export { invokeContract, simulateContract } from "./utils";
