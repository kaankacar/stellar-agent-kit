import { promises as fs } from "node:fs";
import { dirname } from "node:path";

export interface MemoryEntry {
  id: string;
  timestamp: number;
  kind: "observation" | "summary" | "user_note" | "outcome";
  content: string;
  tags?: string[];
}

interface MemoryFile {
  entries: MemoryEntry[];
  version: 1;
}

/**
 * MemoryStore — agent-authored working memory (memory.json).
 *
 * Unlike SoulFile (user-owned), MemoryStore is the agent's space. The agent
 * writes observations, summaries, and outcome notes here; reads them back to
 * stay coherent across sessions.
 *
 * Simple flat structure for v0.3.1. No FTS5 or vector search — just append +
 * tag-based filter. Add embedding-based recall later if needed.
 */
export class MemoryStore {
  constructor(public readonly path: string) {}

  private async load(): Promise<MemoryFile> {
    try {
      const raw = await fs.readFile(this.path, "utf-8");
      return JSON.parse(raw) as MemoryFile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { entries: [], version: 1 };
      }
      throw err;
    }
  }

  private async save(file: MemoryFile): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify(file, null, 2), "utf-8");
  }

  async remember(entry: Omit<MemoryEntry, "id" | "timestamp">): Promise<MemoryEntry> {
    const file = await this.load();
    const fullEntry: MemoryEntry = {
      ...entry,
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };
    file.entries.push(fullEntry);
    await this.save(file);
    return fullEntry;
  }

  /**
   * Recall entries matching tags or a substring query (case-insensitive). If
   * neither is provided, returns the most-recent `limit` entries.
   */
  async recall(opts: {
    tags?: string[];
    query?: string;
    limit?: number;
    kinds?: MemoryEntry["kind"][];
  } = {}): Promise<MemoryEntry[]> {
    const file = await this.load();
    let results = file.entries;
    if (opts.tags && opts.tags.length > 0) {
      results = results.filter((e) => e.tags?.some((t) => opts.tags!.includes(t)));
    }
    if (opts.kinds && opts.kinds.length > 0) {
      results = results.filter((e) => opts.kinds!.includes(e.kind));
    }
    if (opts.query) {
      const q = opts.query.toLowerCase();
      results = results.filter((e) => e.content.toLowerCase().includes(q));
    }
    // Most recent first
    results.sort((a, b) => b.timestamp - a.timestamp);
    return results.slice(0, opts.limit ?? 20);
  }

  async forget(id: string): Promise<boolean> {
    const file = await this.load();
    const before = file.entries.length;
    file.entries = file.entries.filter((e) => e.id !== id);
    await this.save(file);
    return file.entries.length < before;
  }

  async size(): Promise<number> {
    const file = await this.load();
    return file.entries.length;
  }
}
