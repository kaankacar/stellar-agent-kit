import type { Plugin } from "@stellar-agent-kit/core";
import { domainResolve, domainReverse } from "./actions";

export const DomainPlugin: Plugin = {
  name: "stellar-domain",
  methods: {},
  actions: [domainResolve, domainReverse],
  initialize() {},
};

export default DomainPlugin;
export { domainResolve, domainReverse };
