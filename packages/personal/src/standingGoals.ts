import { promises as fs } from "node:fs";
import { dirname } from "node:path";

export interface StandingGoal {
  id: string;
  goal: string;
  /** When the agent first added this goal. */
  createdAt: number;
  /** Cadence — how often the heartbeat should re-evaluate this goal. */
  intervalMs: number;
  /** Last time the goal was evaluated. */
  lastRunAt?: number;
  /** Optional last-result snippet — useful for the next iteration's context. */
  lastResult?: string;
  /** Optional expiration — goal stops firing after this timestamp. */
  expiresAt?: number;
  /** Optional tags for grouping ("trading", "treasury", etc.) */
  tags?: string[];
}

interface StandingGoalsFile {
  goals: StandingGoal[];
  version: 1;
}

/**
 * StandingGoals — durable list of "watch X and do Y" instructions the agent
 * keeps coming back to on a heartbeat. Persisted to disk so they survive
 * process restarts / cron firings.
 *
 * Example: "watch Reflector XLM/USD; if price < $0.10, swap my XLM to USDC."
 */
export class StandingGoals {
  constructor(public readonly path: string) {}

  private async load(): Promise<StandingGoalsFile> {
    try {
      const raw = await fs.readFile(this.path, "utf-8");
      return JSON.parse(raw) as StandingGoalsFile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { goals: [], version: 1 };
      }
      throw err;
    }
  }

  private async save(file: StandingGoalsFile): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify(file, null, 2), "utf-8");
  }

  async add(goal: Omit<StandingGoal, "id" | "createdAt">): Promise<StandingGoal> {
    const file = await this.load();
    const full: StandingGoal = {
      ...goal,
      id: `sg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
    file.goals.push(full);
    await this.save(file);
    return full;
  }

  async list(opts: { tags?: string[]; activeOnly?: boolean } = {}): Promise<StandingGoal[]> {
    const file = await this.load();
    const now = Date.now();
    let goals = file.goals;
    if (opts.activeOnly) {
      goals = goals.filter((g) => !g.expiresAt || g.expiresAt > now);
    }
    if (opts.tags && opts.tags.length > 0) {
      goals = goals.filter((g) => g.tags?.some((t) => opts.tags!.includes(t)));
    }
    return goals;
  }

  async remove(id: string): Promise<boolean> {
    const file = await this.load();
    const before = file.goals.length;
    file.goals = file.goals.filter((g) => g.id !== id);
    await this.save(file);
    return file.goals.length < before;
  }

  /**
   * Return goals whose next-run time has come up (lastRunAt + intervalMs <= now)
   * AND that haven't expired. The heartbeat loop runs `runOnce` for each.
   */
  async due(now: number = Date.now()): Promise<StandingGoal[]> {
    const file = await this.load();
    return file.goals.filter((g) => {
      if (g.expiresAt && g.expiresAt <= now) return false;
      const lastRun = g.lastRunAt ?? 0;
      return now - lastRun >= g.intervalMs;
    });
  }

  async markRun(id: string, result: string): Promise<void> {
    const file = await this.load();
    const goal = file.goals.find((g) => g.id === id);
    if (!goal) return;
    goal.lastRunAt = Date.now();
    goal.lastResult = result.slice(0, 1000); // bound size
    await this.save(file);
  }
}
