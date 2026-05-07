import { createHmac, timingSafeEqual } from "node:crypto";

export type AnchorProvider = "etherfuse" | "alfredpay" | "blindpay";

export type AnchorEvent =
  | { type: "kyc.approved"; provider: AnchorProvider; customerId: string; raw: unknown }
  | {
      type: "kyc.rejected";
      provider: AnchorProvider;
      customerId: string;
      reason?: string;
      raw: unknown;
    }
  | {
      type: "kyc.update_required";
      provider: AnchorProvider;
      customerId: string;
      raw: unknown;
    }
  | {
      type: "onramp.completed";
      provider: AnchorProvider;
      orderId: string;
      stellarTxHash?: string;
      raw: unknown;
    }
  | {
      type: "onramp.failed";
      provider: AnchorProvider;
      orderId: string;
      reason?: string;
      raw: unknown;
    }
  | { type: "offramp.completed"; provider: AnchorProvider; orderId: string; raw: unknown }
  | {
      type: "offramp.failed";
      provider: AnchorProvider;
      orderId: string;
      reason?: string;
      raw: unknown;
    }
  | { type: "unknown"; provider: AnchorProvider; raw: unknown };

export interface VerifySignatureOptions {
  /** Shared secret for HMAC-SHA256 signature verification. */
  secret?: string;
  /** Override the header name carrying the signature. */
  headerName?: string;
}

export interface AnchorWebhookHandlerOptions {
  provider: AnchorProvider;
  verify?: VerifySignatureOptions;
  onEvent: (event: AnchorEvent) => Promise<void> | void;
  onError?: (err: Error, raw: unknown) => Promise<void> | void;
}

export interface WebhookResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export type RawWebhookHandler = (
  rawBody: string | Buffer,
  headers: Record<string, string | string[] | undefined>,
) => Promise<WebhookResult>;

/**
 * Build a framework-agnostic webhook handler. Caller wires the returned function
 * into their Express / Fastify / Next / Hono route.
 */
export function createAnchorWebhookHandler(opts: AnchorWebhookHandlerOptions): RawWebhookHandler {
  return async (rawBody, headers) => {
    try {
      // 1. Verify signature if configured
      if (opts.verify?.secret) {
        const headerName = (opts.verify.headerName ?? defaultSigHeader(opts.provider)).toLowerCase();
        const sigHeaderRaw = headers[headerName] ?? headers[headerName.toLowerCase()];
        const sig = Array.isArray(sigHeaderRaw) ? sigHeaderRaw[0] : sigHeaderRaw;
        if (!sig) {
          return { ok: false, status: 401, body: { error: "missing_signature" } };
        }
        const bodyBuf = typeof rawBody === "string" ? Buffer.from(rawBody, "utf-8") : rawBody;
        if (!verifyHmacSig(bodyBuf, sig, opts.verify.secret)) {
          return { ok: false, status: 401, body: { error: "bad_signature" } };
        }
      }

      // 2. Parse body
      const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8");
      const parsed = JSON.parse(bodyStr) as Record<string, unknown>;
      const event = parseAnchorEvent(opts.provider, parsed);

      // 3. Dispatch
      await opts.onEvent(event);
      return { ok: true, status: 200, body: { received: true, type: event.type } };
    } catch (err) {
      if (opts.onError) await opts.onError(err as Error, rawBody);
      return { ok: false, status: 500, body: { error: (err as Error).message } };
    }
  };
}

function defaultSigHeader(provider: AnchorProvider): string {
  switch (provider) {
    case "etherfuse":
      return "x-etherfuse-signature";
    case "alfredpay":
      return "x-alfredpay-signature";
    case "blindpay":
      return "x-blindpay-signature";
  }
}

function verifyHmacSig(body: Buffer, sig: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  // Strip common prefixes like "sha256=" some providers use.
  const normalized = sig.replace(/^sha256=/, "");
  if (expected.length !== normalized.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(normalized, "hex"));
}

/**
 * Provider-specific event parsers.
 *
 * Etherfuse shapes are documented; AlfredPay and BlindPay shapes are inferred
 * from the regional-starter-pack reference and may need verification against
 * each provider's docs as they evolve. Unknown shapes degrade to a `type: "unknown"`
 * event with the raw payload preserved so consumers can still react.
 */
function parseAnchorEvent(provider: AnchorProvider, raw: Record<string, unknown>): AnchorEvent {
  switch (provider) {
    case "etherfuse":
      return parseEtherfuse(raw);
    case "alfredpay":
      return parseAlfredPay(raw);
    case "blindpay":
      return parseBlindPay(raw);
  }
}

function parseEtherfuse(raw: Record<string, unknown>): AnchorEvent {
  const eventType =
    (raw.event_type as string | undefined) ??
    (raw.eventType as string | undefined) ??
    (raw.type as string | undefined);
  const orderId =
    (raw.order_id as string | undefined) ??
    (raw.orderId as string | undefined) ??
    (raw.id as string | undefined);
  const customerId =
    (raw.customer_id as string | undefined) ?? (raw.customerId as string | undefined);
  switch (eventType) {
    case "kyc_status_changed":
    case "kyc.approved":
      if ((raw.kyc_status ?? raw.status) === "rejected") {
        return {
          type: "kyc.rejected",
          provider: "etherfuse",
          customerId: customerId ?? "",
          reason: raw.reason as string | undefined,
          raw,
        };
      }
      return {
        type: "kyc.approved",
        provider: "etherfuse",
        customerId: customerId ?? "",
        raw,
      };
    case "order_completed":
    case "onramp.completed":
      return {
        type: "onramp.completed",
        provider: "etherfuse",
        orderId: orderId ?? "",
        stellarTxHash: (raw.tx_hash as string | undefined) ?? (raw.transaction_hash as string | undefined),
        raw,
      };
    case "order_failed":
    case "onramp.failed":
      return {
        type: "onramp.failed",
        provider: "etherfuse",
        orderId: orderId ?? "",
        reason: raw.reason as string | undefined,
        raw,
      };
    case "offramp.completed":
      return { type: "offramp.completed", provider: "etherfuse", orderId: orderId ?? "", raw };
    case "offramp.failed":
      return {
        type: "offramp.failed",
        provider: "etherfuse",
        orderId: orderId ?? "",
        reason: raw.reason as string | undefined,
        raw,
      };
    default:
      return { type: "unknown", provider: "etherfuse", raw };
  }
}

function parseAlfredPay(raw: Record<string, unknown>): AnchorEvent {
  // AlfredPay webhook payload shape is sparsely documented; treat conservatively.
  const eventType = (raw.event as string | undefined) ?? (raw.type as string | undefined);
  const txId = (raw.transactionId as string | undefined) ?? (raw.id as string | undefined);
  const customerId = (raw.customerId as string | undefined) ?? "";
  if (eventType === "ONRAMP_COMPLETED" || eventType === "onramp.completed") {
    return {
      type: "onramp.completed",
      provider: "alfredpay",
      orderId: txId ?? "",
      stellarTxHash: raw.txHash as string | undefined,
      raw,
    };
  }
  if (eventType === "OFFRAMP_COMPLETED" || eventType === "offramp.completed") {
    return { type: "offramp.completed", provider: "alfredpay", orderId: txId ?? "", raw };
  }
  if (eventType === "KYC_APPROVED") {
    return { type: "kyc.approved", provider: "alfredpay", customerId, raw };
  }
  return { type: "unknown", provider: "alfredpay", raw };
}

function parseBlindPay(raw: Record<string, unknown>): AnchorEvent {
  // BlindPay event shapes per their docs: payin_completed, payout_completed,
  // receiver_status_changed.
  const eventType = (raw.event as string | undefined) ?? (raw.type as string | undefined);
  const id = raw.id as string | undefined;
  const receiverId = raw.receiver_id as string | undefined;
  if (eventType === "payin_completed") {
    return {
      type: "onramp.completed",
      provider: "blindpay",
      orderId: id ?? "",
      stellarTxHash: raw.tx_hash as string | undefined,
      raw,
    };
  }
  if (eventType === "payout_completed") {
    return { type: "offramp.completed", provider: "blindpay", orderId: id ?? "", raw };
  }
  if (eventType === "receiver_kyc_approved") {
    return { type: "kyc.approved", provider: "blindpay", customerId: receiverId ?? "", raw };
  }
  if (eventType === "receiver_kyc_rejected") {
    return {
      type: "kyc.rejected",
      provider: "blindpay",
      customerId: receiverId ?? "",
      reason: raw.reason as string | undefined,
      raw,
    };
  }
  return { type: "unknown", provider: "blindpay", raw };
}

// =============================================================================
// Framework-specific convenience wrappers
// =============================================================================

/**
 * Express middleware. Use with `express.raw({ type: "application/json" })` to
 * preserve the raw body for HMAC verification.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { expressAnchorWebhook } from "@stellar-agent-kit/plugin-anchor";
 *
 * app.post(
 *   "/webhooks/etherfuse",
 *   express.raw({ type: "application/json" }),
 *   expressAnchorWebhook({ provider: "etherfuse", onEvent: handle }),
 * );
 * ```
 */
export function expressAnchorWebhook(opts: AnchorWebhookHandlerOptions) {
  const handler = createAnchorWebhookHandler(opts);
  return async (
    req: { body: Buffer | string; headers: Record<string, string | string[] | undefined> },
    res: { status: (n: number) => { json: (b: unknown) => unknown } },
  ): Promise<unknown> => {
    const result = await handler(req.body, req.headers);
    return res.status(result.status).json(result.body);
  };
}

/**
 * Next.js App Router POST handler. Returns a `Response` for the route's POST
 * export.
 */
export function nextAnchorWebhook(opts: AnchorWebhookHandlerOptions) {
  const handler = createAnchorWebhookHandler(opts);
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

/**
 * Hono / generic Web-standard handler.
 */
export function honoAnchorWebhook(opts: AnchorWebhookHandlerOptions) {
  return nextAnchorWebhook(opts); // Same Web-standard signature
}
