/**
 * Thin DeFindex REST client. Endpoint conventions documented in
 * `kaankacar/stellar-defi-gotchas`:
 *  - Auth header: `Authorization: Bearer <api-key>` (DeFindex uses Bearer; Etherfuse does not)
 *  - Endpoint is `/vault/` not `/vaults/`
 *  - Successful POST returns HTTP 201
 *  - Amounts are arrays even for single-asset vaults
 *  - Classic Stellar assets must be SAC-deployed before vault deposit
 */

const DEFAULT_BASE_URL = "https://api.defindex.io";

export interface DefindexConfig {
  apiKey: string;
  baseUrl?: string;
}

export class DefindexClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: DefindexConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  private async request<T>(
    path: string,
    init: RequestInit & { expectStatus?: number } = {},
  ): Promise<T> {
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    } as Record<string, string>;
    const resp = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const text = await resp.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = text;
    }
    const expected = init.expectStatus ?? (init.method === "POST" ? 201 : 200);
    if (resp.status !== expected) {
      const err = new Error(
        `DeFindex ${path} expected ${expected}, got ${resp.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
      );
      (err as Error & { code: string; status: number }).code = "DEFINDEX_API_ERROR";
      (err as Error & { code: string; status: number }).status = resp.status;
      throw err;
    }
    return body as T;
  }

  async listVaults(network: "mainnet" | "testnet" = "mainnet"): Promise<unknown[]> {
    const data = await this.request<{ vaults?: unknown[] }>(`/vault/?network=${network}`);
    return data.vaults ?? [];
  }

  async buildDeposit(input: {
    vaultAddress: string;
    amounts: string[];
    from: string;
    network?: "mainnet" | "testnet";
  }): Promise<{ xdr: string }> {
    return this.request<{ xdr: string }>(
      `/vault/${input.vaultAddress}/deposit?network=${input.network ?? "mainnet"}`,
      {
        method: "POST",
        body: JSON.stringify({ amounts: input.amounts, from: input.from }),
      },
    );
  }

  async buildWithdraw(input: {
    vaultAddress: string;
    shares: string;
    from: string;
    network?: "mainnet" | "testnet";
  }): Promise<{ xdr: string }> {
    return this.request<{ xdr: string }>(
      `/vault/${input.vaultAddress}/withdraw?network=${input.network ?? "mainnet"}`,
      {
        method: "POST",
        body: JSON.stringify({ shares: input.shares, from: input.from }),
      },
    );
  }

  async getPosition(input: {
    vaultAddress: string;
    account: string;
    network?: "mainnet" | "testnet";
  }): Promise<unknown> {
    return this.request<unknown>(
      `/vault/${input.vaultAddress}/position/${input.account}?network=${input.network ?? "mainnet"}`,
    );
  }
}
