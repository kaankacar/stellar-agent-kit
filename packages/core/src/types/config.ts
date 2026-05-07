export interface StellarAgentConfig {
  rpcUrl: string;
  horizonUrl?: string;
  networkPassphrase: string;
  signOnly?: boolean;
  defaultFeeStroops?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  apiKeys?: Record<string, string>;
  kvStore?: KVStore;
}

export interface KVStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}
