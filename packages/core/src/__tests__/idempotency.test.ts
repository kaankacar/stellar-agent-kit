import { describe, it, expect, vi } from "vitest";
import { InMemoryKVStore } from "../utils/kvStore";
import { withIdempotency } from "../utils/idempotency";

describe("withIdempotency", () => {
  it("runs the handler once per key and returns cached result on subsequent calls", async () => {
    const store = new InMemoryKVStore();
    const handler = vi.fn(async () => ({ value: "result" }));
    const r1 = await withIdempotency(store, "TEST", "key-1", 60_000, handler);
    const r2 = await withIdempotency(store, "TEST", "key-1", 60_000, handler);
    expect(r1).toEqual(r2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("re-runs the handler for a different key", async () => {
    const store = new InMemoryKVStore();
    const handler = vi.fn(async (n: number) => ({ value: n }));
    await withIdempotency(store, "TEST", "k1", 60_000, () => handler(1));
    await withIdempotency(store, "TEST", "k2", 60_000, () => handler(2));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("passthrough when key is undefined — runs every time", async () => {
    const store = new InMemoryKVStore();
    const handler = vi.fn(async () => ({ value: "result" }));
    await withIdempotency(store, "TEST", undefined, 60_000, handler);
    await withIdempotency(store, "TEST", undefined, 60_000, handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("expires after ttl: handler runs again after expiration", async () => {
    const store = new InMemoryKVStore();
    const handler = vi.fn(async () => ({ ts: Date.now() }));
    await withIdempotency(store, "TEST", "k1", 1, handler); // 1ms ttl
    await new Promise((r) => setTimeout(r, 5));
    await withIdempotency(store, "TEST", "k1", 1, handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
