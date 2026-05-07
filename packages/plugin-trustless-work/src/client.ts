/**
 * Thin Trustless Work REST client.
 *
 * Auth header per official API reference: `Authorization: Bearer <api-key>`.
 * (Note: an older hackathon FAQ mentioned `x-api-key:` — that variant is
 * supported by setting `authStyle: 'header'`, but Bearer is the documented default.)
 *
 * Gotchas baked into this client (sourced from briwylde08/stellar-hackathon-faq
 * and the trustless-work-skill examples):
 *  - Every role address must establish a USDC trustline BEFORE escrow init.
 *  - Once the escrow has a balance, only milestone additions are allowed; other
 *    properties are immutable. (Caller-side rule; we don't enforce it.)
 *  - The trustline.address must be the issuer G... address, NOT a contract id.
 *  - The disputeResolver address must be unique vs other roles.
 */

const TESTNET_BASE_URL = "https://dev.api.trustlesswork.com";
const MAINNET_BASE_URL = "https://api.trustlesswork.com";

export interface TrustlessWorkConfig {
  apiKey: string;
  network?: "testnet" | "mainnet";
  baseUrl?: string;
  authStyle?: "bearer" | "x-api-key";
}

export interface EscrowRoles {
  approver: string;
  serviceProvider: string;
  releaseSigner: string;
  platformAddress: string;
  disputeResolver: string;
  receiver?: string;
}

export interface SingleReleaseMilestone {
  description: string;
  status?: string;
  approved?: boolean;
}

export interface MultiReleaseMilestone {
  description: string;
  amount: number;
  status?: string;
  receiver: string;
  flags?: { approved?: boolean; released?: boolean; disputed?: boolean; resolved?: boolean };
}

export interface Trustline {
  address: string;
  code: string;
}

export class TrustlessWorkClient {
  private apiKey: string;
  private baseUrl: string;
  private authStyle: "bearer" | "x-api-key";

  constructor(config: TrustlessWorkConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl =
      config.baseUrl ?? (config.network === "mainnet" ? MAINNET_BASE_URL : TESTNET_BASE_URL);
    this.authStyle = config.authStyle ?? "bearer";
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (this.authStyle === "bearer") {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    } else {
      headers["x-api-key"] = this.apiKey;
    }
    const resp = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const text = await resp.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = text;
    }
    if (!resp.ok) {
      const err = new Error(
        `Trustless Work ${path} failed: ${resp.status} ${typeof body === "string" ? body : JSON.stringify(body)}`,
      );
      (err as Error & { code: string; status: number }).code = "TRUSTLESS_WORK_API_ERROR";
      (err as Error & { code: string; status: number }).status = resp.status;
      throw err;
    }
    return body as T;
  }

  createSingleRelease(input: {
    engagementId: string;
    title: string;
    description?: string;
    roles: EscrowRoles;
    amount: number;
    platformFee?: number;
    milestones: SingleReleaseMilestone[];
    trustline: Trustline;
  }): Promise<{ success: boolean; contractId: string; escrow: Record<string, unknown> }> {
    return this.request("/escrow/single-release", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  createMultiRelease(input: {
    engagementId: string;
    title: string;
    description?: string;
    roles: EscrowRoles;
    platformFee?: number;
    milestones: MultiReleaseMilestone[];
    trustline: Trustline;
  }): Promise<{ success: boolean; contractId: string; totalAmount: number }> {
    return this.request("/escrow/multi-release", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getEscrow(escrowId: string): Promise<Record<string, unknown>> {
    return this.request(`/escrow/${escrowId}`);
  }

  fundEscrow(escrowId: string, amount: number, depositorAddress: string) {
    return this.request<{ success: boolean; transactionHash: string; newBalance: number }>(
      `/escrow/${escrowId}/fund`,
      {
        method: "POST",
        body: JSON.stringify({ amount, depositorAddress }),
      },
    );
  }

  updateMilestoneStatus(
    escrowId: string,
    milestoneId: number,
    status: string,
    evidence?: { url?: string; description?: string; timestamp?: string },
  ) {
    return this.request<{ success: boolean; milestone: Record<string, unknown> }>(
      `/escrow/${escrowId}/milestone/${milestoneId}/update`,
      {
        method: "POST",
        body: JSON.stringify({ status, evidence }),
      },
    );
  }

  approveMilestones(
    escrowId: string,
    body: { milestones: number[] } | { milestoneId: number },
  ) {
    return this.request<{ success: boolean; approvedMilestones?: number[] }>(
      `/escrow/${escrowId}/approve`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  release(
    escrowId: string,
    body: { releaseAll: true } | { milestoneId: number },
  ) {
    return this.request<{
      success: boolean;
      transactionHash: string;
      amountReleased: number;
      receiver: string;
    }>(`/escrow/${escrowId}/release`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  raiseDispute(
    escrowId: string,
    body: { reason: string; evidence?: string; requestedAction?: string },
  ) {
    return this.request<{ success: boolean; disputeId: string; status: string }>(
      `/escrow/${escrowId}/dispute`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }
}
