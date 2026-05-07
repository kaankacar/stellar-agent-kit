import type { Plugin } from "@stellar-agent-kit/core";
import { x402Fetch } from "./x402";
import { mppChargeFetch } from "./mpp";

export const PaymentsPlugin: Plugin = {
  name: "stellar-payments",
  methods: {},
  actions: [x402Fetch, mppChargeFetch],
  initialize() {},
};

export default PaymentsPlugin;
export { x402Fetch, mppChargeFetch };
