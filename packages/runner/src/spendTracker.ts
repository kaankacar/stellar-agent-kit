import type { KVStore } from "@stellar-agent-kit/core";
import type { SpendCap } from "./types";

interface SpendEntry {
  amount: string;
  timestampMs: number;
}

interface AssetSpendLog {
  entries: SpendEntry[];
}

const KV_PREFIX = "runner:spend:";

/**
 * Tracks per-asset cumulative spend within a rolling window. Persists in the
 * agent's KVStore so cap state survives across cron-style `runOnce` invocations.
 *
 * Amounts are decimal strings — supports arbitrary precision via the `Decimal`
 * helper below (no JS number overflow on i128 atomic amounts).
 */
export class SpendTracker {
  constructor(
    private readonly store: KVStore,
    private readonly caps: SpendCap[],
  ) {}

  async wouldExceed(asset: string, amount: string): Promise<{ exceeded: boolean; cap?: SpendCap; current?: string }> {
    const matching = this.caps.filter((c) => c.asset === asset);
    if (matching.length === 0) return { exceeded: false };

    const now = Date.now();
    for (const cap of matching) {
      const log = (await this.store.get<AssetSpendLog>(this.key(cap))) ?? { entries: [] };
      const fresh = log.entries.filter((e) => now - e.timestampMs <= cap.windowMs);
      const current = fresh.reduce((sum, e) => addDecimal(sum, e.amount), "0");
      const projected = addDecimal(current, amount);
      if (compareDecimal(projected, cap.limit) > 0) {
        return { exceeded: true, cap, current };
      }
    }
    return { exceeded: false };
  }

  async record(asset: string, amount: string): Promise<void> {
    const matching = this.caps.filter((c) => c.asset === asset);
    if (matching.length === 0) return;

    const now = Date.now();
    for (const cap of matching) {
      const log = (await this.store.get<AssetSpendLog>(this.key(cap))) ?? { entries: [] };
      const fresh = log.entries.filter((e) => now - e.timestampMs <= cap.windowMs);
      fresh.push({ amount, timestampMs: now });
      await this.store.set(this.key(cap), { entries: fresh });
    }
  }

  private key(cap: SpendCap): string {
    return `${KV_PREFIX}${cap.asset}:${cap.windowMs}`;
  }
}

// --- Decimal-string arithmetic, sufficient for Stellar atomic units (i128) ---

function addDecimal(a: string, b: string): string {
  // Both inputs are integer decimal strings (no fractional part for atomic units).
  // Use BigInt to avoid float drift.
  return (BigInt(a) + BigInt(b)).toString();
}

function compareDecimal(a: string, b: string): number {
  const ba = BigInt(a);
  const bb = BigInt(b);
  if (ba < bb) return -1;
  if (ba > bb) return 1;
  return 0;
}
