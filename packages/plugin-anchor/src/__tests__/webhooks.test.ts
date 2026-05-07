import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createAnchorWebhookHandler, type AnchorEvent } from "../webhooks";

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("Anchor webhook handler", () => {
  it("Etherfuse: parses kyc_status_changed → kyc.approved", async () => {
    const captured: AnchorEvent[] = [];
    const handler = createAnchorWebhookHandler({
      provider: "etherfuse",
      onEvent: (e) => {
        captured.push(e);
      },
    });
    const body = JSON.stringify({
      event_type: "kyc_status_changed",
      kyc_status: "approved",
      customer_id: "cust-123",
    });
    const result = await handler(body, {});
    expect(result.ok).toBe(true);
    expect(captured[0]!.type).toBe("kyc.approved");
    if (captured[0]!.type === "kyc.approved") {
      expect(captured[0]!.customerId).toBe("cust-123");
    }
  });

  it("Etherfuse: order_completed → onramp.completed with tx hash", async () => {
    const captured: AnchorEvent[] = [];
    const handler = createAnchorWebhookHandler({
      provider: "etherfuse",
      onEvent: (e) => {
        captured.push(e);
      },
    });
    const body = JSON.stringify({
      event_type: "order_completed",
      order_id: "order-7",
      tx_hash: "0xabc",
    });
    await handler(body, {});
    expect(captured[0]!.type).toBe("onramp.completed");
    if (captured[0]!.type === "onramp.completed") {
      expect(captured[0]!.orderId).toBe("order-7");
      expect(captured[0]!.stellarTxHash).toBe("0xabc");
    }
  });

  it("BlindPay: payout_completed → offramp.completed", async () => {
    const captured: AnchorEvent[] = [];
    const handler = createAnchorWebhookHandler({
      provider: "blindpay",
      onEvent: (e) => {
        captured.push(e);
      },
    });
    const body = JSON.stringify({ event: "payout_completed", id: "po-1" });
    await handler(body, {});
    expect(captured[0]!.type).toBe("offramp.completed");
    if (captured[0]!.type === "offramp.completed") {
      expect(captured[0]!.orderId).toBe("po-1");
    }
  });

  it("Unknown event types degrade to type:unknown without losing the payload", async () => {
    const captured: AnchorEvent[] = [];
    const handler = createAnchorWebhookHandler({
      provider: "etherfuse",
      onEvent: (e) => {
        captured.push(e);
      },
    });
    const body = JSON.stringify({ event_type: "nonsense_thing", whatever: 42 });
    await handler(body, {});
    expect(captured[0]!.type).toBe("unknown");
    expect((captured[0]! as { raw: { whatever: number } }).raw.whatever).toBe(42);
  });

  it("HMAC signature verification: rejects bad signature with 401", async () => {
    const handler = createAnchorWebhookHandler({
      provider: "etherfuse",
      verify: { secret: "secret-key" },
      onEvent: () => undefined,
    });
    const body = JSON.stringify({ event_type: "order_completed", order_id: "o" });
    const result = await handler(body, { "x-etherfuse-signature": "wrongsig" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it("HMAC signature verification: accepts valid signature", async () => {
    const onEvent = vi.fn();
    const handler = createAnchorWebhookHandler({
      provider: "etherfuse",
      verify: { secret: "secret-key" },
      onEvent,
    });
    const body = JSON.stringify({ event_type: "order_completed", order_id: "o" });
    const result = await handler(body, { "x-etherfuse-signature": sign(body, "secret-key") });
    expect(result.ok).toBe(true);
    expect(onEvent).toHaveBeenCalledOnce();
  });

  it("HMAC: also accepts sha256= prefix some providers use", async () => {
    const handler = createAnchorWebhookHandler({
      provider: "etherfuse",
      verify: { secret: "secret-key" },
      onEvent: () => undefined,
    });
    const body = JSON.stringify({ event_type: "order_completed", order_id: "o" });
    const result = await handler(body, {
      "x-etherfuse-signature": `sha256=${sign(body, "secret-key")}`,
    });
    expect(result.ok).toBe(true);
  });
});
