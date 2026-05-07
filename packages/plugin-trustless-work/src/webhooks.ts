import { createHmac, timingSafeEqual } from "node:crypto";

export type TrustlessWorkEvent =
  | { type: "escrow.created"; contractId: string; raw: unknown }
  | { type: "escrow.funded"; contractId: string; amount?: string; raw: unknown }
  | {
      type: "milestone.updated";
      contractId: string;
      milestoneId: number;
      status?: string;
      raw: unknown;
    }
  | {
      type: "milestone.approved";
      contractId: string;
      milestoneId?: number;
      raw: unknown;
    }
  | {
      type: "escrow.released";
      contractId: string;
      txHash?: string;
      amount?: string;
      raw: unknown;
    }
  | {
      type: "escrow.disputed";
      contractId: string;
      disputeId?: string;
      raw: unknown;
    }
  | {
      type: "dispute.resolved";
      contractId: string;
      disputeId?: string;
      raw: unknown;
    }
  | { type: "unknown"; raw: unknown };

export interface TrustlessWorkWebhookOptions {
  /** Shared secret for HMAC-SHA256 signature verification. Optional. */
  secret?: string;
  signatureHeaderName?: string;
  onEvent: (event: TrustlessWorkEvent) => Promise<void> | void;
  onError?: (err: Error, raw: unknown) => Promise<void> | void;
}

export interface TrustlessWorkWebhookResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export type RawTrustlessWorkHandler = (
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
) => Promise<TrustlessWorkWebhookResult>;

export function createTrustlessWorkWebhookHandler(
  opts: TrustlessWorkWebhookOptions,
): RawTrustlessWorkHandler {
  return async (rawBody, headers) => {
    try {
      if (opts.secret) {
        const headerName = (opts.signatureHeaderName ?? "x-trustlesswork-signature").toLowerCase();
        const sigHeaderRaw = headers[headerName] ?? headers[headerName.toLowerCase()];
        const sig = Array.isArray(sigHeaderRaw) ? sigHeaderRaw[0] : sigHeaderRaw;
        if (!sig) return { ok: false, status: 401, body: { error: "missing_signature" } };
        const bodyBuf = typeof rawBody === "string" ? Buffer.from(rawBody, "utf-8") : rawBody;
        const expected = createHmac("sha256", opts.secret).update(bodyBuf).digest("hex");
        const normalized = sig.replace(/^sha256=/, "");
        if (
          expected.length !== normalized.length ||
          !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(normalized, "hex"))
        ) {
          return { ok: false, status: 401, body: { error: "bad_signature" } };
        }
      }

      const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");
      const parsed = JSON.parse(bodyStr) as Record<string, unknown>;
      const event = parseEvent(parsed);
      await opts.onEvent(event);
      return { ok: true, status: 200, body: { received: true, type: event.type } };
    } catch (err) {
      if (opts.onError) await opts.onError(err as Error, rawBody);
      return { ok: false, status: 500, body: { error: (err as Error).message } };
    }
  };
}

function parseEvent(raw: Record<string, unknown>): TrustlessWorkEvent {
  const eventType = (raw.event as string | undefined) ?? (raw.type as string | undefined);
  const contractId =
    (raw.contractId as string | undefined) ??
    (raw.contract_id as string | undefined) ??
    (raw.escrowId as string | undefined) ??
    "";
  switch (eventType) {
    case "escrow.created":
      return { type: "escrow.created", contractId, raw };
    case "escrow.funded":
      return {
        type: "escrow.funded",
        contractId,
        amount: raw.amount as string | undefined,
        raw,
      };
    case "milestone.updated":
      return {
        type: "milestone.updated",
        contractId,
        milestoneId: raw.milestoneId as number,
        status: raw.status as string | undefined,
        raw,
      };
    case "milestone.approved":
      return {
        type: "milestone.approved",
        contractId,
        milestoneId: raw.milestoneId as number | undefined,
        raw,
      };
    case "escrow.released":
      return {
        type: "escrow.released",
        contractId,
        txHash: raw.transactionHash as string | undefined,
        amount: raw.amountReleased as string | undefined,
        raw,
      };
    case "escrow.disputed":
      return {
        type: "escrow.disputed",
        contractId,
        disputeId: raw.disputeId as string | undefined,
        raw,
      };
    case "dispute.resolved":
      return {
        type: "dispute.resolved",
        contractId,
        disputeId: raw.disputeId as string | undefined,
        raw,
      };
    default:
      return { type: "unknown", raw };
  }
}

export function expressTrustlessWorkWebhook(opts: TrustlessWorkWebhookOptions) {
  const handler = createTrustlessWorkWebhookHandler(opts);
  return async (
    req: { body: Buffer | string; headers: Record<string, string | string[] | undefined> },
    res: { status: (n: number) => { json: (b: unknown) => unknown } },
  ): Promise<unknown> => {
    const result = await handler(req.body, req.headers);
    return res.status(result.status).json(result.body);
  };
}

export function nextTrustlessWorkWebhook(opts: TrustlessWorkWebhookOptions) {
  const handler = createTrustlessWorkWebhookHandler(opts);
  return async (req: Request): Promise<Response> => {
    const rawBody = await req.text();
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const result = await handler(rawBody, headers);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  };
}
