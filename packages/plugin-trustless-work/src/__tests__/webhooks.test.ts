import { describe, it, expect } from "vitest";
import { createTrustlessWorkWebhookHandler, type TrustlessWorkEvent } from "../webhooks";

describe("Trustless Work webhook handler", () => {
  it("parses escrow.released event with txHash + amount", async () => {
    const captured: TrustlessWorkEvent[] = [];
    const handler = createTrustlessWorkWebhookHandler({
      onEvent: (e) => {
        captured.push(e);
      },
    });
    const body = JSON.stringify({
      event: "escrow.released",
      contractId: "C123",
      transactionHash: "0xabc",
      amountReleased: "1000",
    });
    const result = await handler(body, {});
    expect(result.ok).toBe(true);
    expect(captured[0]!.type).toBe("escrow.released");
    if (captured[0]!.type === "escrow.released") {
      expect(captured[0]!.contractId).toBe("C123");
      expect(captured[0]!.txHash).toBe("0xabc");
      expect(captured[0]!.amount).toBe("1000");
    }
  });

  it("milestone.approved without milestoneId", async () => {
    const captured: TrustlessWorkEvent[] = [];
    const handler = createTrustlessWorkWebhookHandler({
      onEvent: (e) => {
        captured.push(e);
      },
    });
    const body = JSON.stringify({ event: "milestone.approved", contractId: "C123" });
    await handler(body, {});
    expect(captured[0]!.type).toBe("milestone.approved");
  });

  it("rejects bad HMAC signature with 401", async () => {
    const handler = createTrustlessWorkWebhookHandler({
      secret: "shh",
      onEvent: () => undefined,
    });
    const body = JSON.stringify({ event: "escrow.released", contractId: "C123" });
    const result = await handler(body, { "x-trustlesswork-signature": "bad" });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });
});
