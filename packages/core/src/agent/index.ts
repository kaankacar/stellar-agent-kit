import { rpc, Horizon } from "@stellar/stellar-sdk";
import type { Action, Plugin } from "../types";
import type { BaseWallet } from "../types/wallet";
import type { StellarAgentConfig, KVStore } from "../types/config";
import { InMemoryKVStore } from "../utils/kvStore";

type PluginMethods<T> = T extends Plugin ? T["methods"] : Record<string, never>;

/**
 * Main entry point. Wraps a Stellar wallet + RPC + Horizon connections,
 * lets plugins register actions and methods, and exposes them to AI framework adapters.
 *
 * @example
 * const wallet = new KeypairWallet("S...");
 * const agent = new StellarAgentKit(wallet, {
 *   rpcUrl: "https://soroban-testnet.stellar.org",
 *   horizonUrl: "https://horizon-testnet.stellar.org",
 *   networkPassphrase: Networks.TESTNET,
 * }).use(StellarAssetPlugin);
 *
 * const tools = createVercelAITools(agent, agent.actions);
 */
export class StellarAgentKit<TPlugins = Record<string, never>> {
  public readonly wallet: BaseWallet;
  public readonly config: StellarAgentConfig;
  public readonly rpcServer: rpc.Server;
  public readonly horizonServer?: Horizon.Server;
  public readonly kvStore: KVStore;

  public methods: TPlugins = {} as TPlugins;
  public actions: Action[] = [];

  private plugins: Map<string, Plugin> = new Map();

  constructor(wallet: BaseWallet, config: StellarAgentConfig) {
    this.wallet = wallet;
    this.config = config;
    this.rpcServer = new rpc.Server(config.rpcUrl, {
      allowHttp: config.rpcUrl.startsWith("http://"),
    });
    if (config.horizonUrl) {
      this.horizonServer = new Horizon.Server(config.horizonUrl, {
        allowHttp: config.horizonUrl.startsWith("http://"),
      });
    }
    this.kvStore = config.kvStore ?? new InMemoryKVStore();
  }

  use<P extends Plugin>(plugin: P): StellarAgentKit<TPlugins & PluginMethods<P>> {
    if (this.plugins.has(plugin.name)) {
      return this as StellarAgentKit<TPlugins & PluginMethods<P>>;
    }
    plugin.initialize(this as StellarAgentKit);

    for (const [methodName, method] of Object.entries(plugin.methods)) {
      if ((this.methods as Record<string, unknown>)[methodName]) {
        throw new Error(`Method ${methodName} already exists in methods`);
      }
      (this.methods as Record<string, unknown>)[methodName] = (
        method as (...args: unknown[]) => unknown
      ).bind(plugin);
    }

    for (const action of plugin.actions) {
      this.actions.push(action);
    }

    this.plugins.set(plugin.name, plugin);
    return this as StellarAgentKit<TPlugins & PluginMethods<P>>;
  }
}
