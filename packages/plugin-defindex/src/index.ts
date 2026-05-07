import type { Plugin } from "@stellar-agent-kit/core";
import {
  defindexListVaults,
  defindexDeposit,
  defindexWithdraw,
  defindexGetPosition,
} from "./actions";

export const DefindexPlugin: Plugin = {
  name: "defindex",
  methods: {},
  actions: [defindexListVaults, defindexDeposit, defindexWithdraw, defindexGetPosition],
  initialize() {},
};

export default DefindexPlugin;
export { defindexListVaults, defindexDeposit, defindexWithdraw, defindexGetPosition };
export { DefindexClient } from "./api";
