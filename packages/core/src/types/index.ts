import type { StellarAgentKit } from "../agent";
import type { Action } from "./action";

export type { Action, ActionExample, Handler } from "./action";
export type { BaseWallet, SignTransactionOpts } from "./wallet";
export type { StellarAgentConfig, KVStore } from "./config";

export interface Plugin {
  name: string;
  methods: Record<string, any>;
  actions: Action[];
  initialize(agent: StellarAgentKit): void;
}
