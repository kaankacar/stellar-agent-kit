import type { Plugin } from "@stellar-agent-kit/core";
import { webSearch, webFetch } from "./actions";

export const WebPlugin: Plugin = {
  name: "stellar-web",
  methods: {},
  actions: [webSearch, webFetch],
  initialize() {},
};

export default WebPlugin;
export { webSearch, webFetch };
