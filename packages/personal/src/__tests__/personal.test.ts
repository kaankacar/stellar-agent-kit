import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keypair, Networks } from "@stellar/stellar-sdk";
import { StellarAgentKit, KeypairWallet } from "@stellar-agent-kit/core";
import { SoulFile, DEFAULT_SOUL_TEMPLATE } from "../soulFile";
import { MemoryStore } from "../memoryStore";
import { StandingGoals } from "../standingGoals";
import { PersonalPlugin, attachPersonal } from "../index";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "personal-test-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("SoulFile", () => {
  it("read returns empty string when file doesn't exist", async () => {
    const soul = new SoulFile(join(workDir, "soul.md"));
    expect(await soul.read()).toBe("");
  });

  it("write + read roundtrip", async () => {
    const soul = new SoulFile(join(workDir, "soul.md"));
    await soul.write(DEFAULT_SOUL_TEMPLATE);
    expect(await soul.read()).toBe(DEFAULT_SOUL_TEMPLATE);
  });

  it("applyEdit refuses without explicit confirmation", async () => {
    const soul = new SoulFile(join(workDir, "soul.md"));
    await expect(
      soul.applyEdit("# new", { confirmed: false }),
    ).rejects.toThrowError(/SOUL_EDIT_NOT_CONFIRMED|require explicit confirmation/);
  });

  it("applyEdit succeeds when confirmed", async () => {
    const soul = new SoulFile(join(workDir, "soul.md"));
    await soul.applyEdit("# new", { confirmed: true });
    expect(await soul.read()).toBe("# new");
  });
});

describe("MemoryStore", () => {
  it("remember + recall by tags", async () => {
    const memory = new MemoryStore(join(workDir, "memory.json"));
    await memory.remember({ kind: "observation", content: "user likes XLM", tags: ["preference"] });
    await memory.remember({ kind: "outcome", content: "swap succeeded", tags: ["trade"] });
    const prefs = await memory.recall({ tags: ["preference"] });
    expect(prefs).toHaveLength(1);
    expect(prefs[0]!.content).toBe("user likes XLM");
  });

  it("recall by query substring", async () => {
    const memory = new MemoryStore(join(workDir, "memory.json"));
    await memory.remember({ kind: "summary", content: "Reflector said XLM is at $0.12" });
    await memory.remember({ kind: "summary", content: "Reflector said BTC is at $50000" });
    const xlmHits = await memory.recall({ query: "xlm" });
    expect(xlmHits).toHaveLength(1);
    expect(xlmHits[0]!.content).toContain("XLM");
  });

  it("forget removes the entry", async () => {
    const memory = new MemoryStore(join(workDir, "memory.json"));
    const entry = await memory.remember({ kind: "observation", content: "test" });
    expect(await memory.size()).toBe(1);
    expect(await memory.forget(entry.id)).toBe(true);
    expect(await memory.size()).toBe(0);
  });
});

describe("StandingGoals", () => {
  it("add + list", async () => {
    const goals = new StandingGoals(join(workDir, "goals.json"));
    const sg = await goals.add({ goal: "watch", intervalMs: 60_000 });
    const list = await goals.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(sg.id);
  });

  it("due() returns only goals whose next run time has come up", async () => {
    const goals = new StandingGoals(join(workDir, "goals.json"));
    await goals.add({ goal: "every-min", intervalMs: 60_000 });
    const due = await goals.due(Date.now() + 70_000); // 70s in the future
    expect(due).toHaveLength(1);
  });

  it("activeOnly filter excludes expired", async () => {
    const goals = new StandingGoals(join(workDir, "goals.json"));
    await goals.add({
      goal: "expired",
      intervalMs: 60_000,
      expiresAt: Date.now() - 10_000,
    });
    await goals.add({ goal: "live", intervalMs: 60_000 });
    const active = await goals.list({ activeOnly: true });
    expect(active).toHaveLength(1);
    expect(active[0]!.goal).toBe("live");
  });
});

describe("PersonalPlugin actions", () => {
  function makeAgent() {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(PersonalPlugin);
    attachPersonal(agent, {
      soul: new SoulFile(join(workDir, "soul.md")),
      memory: new MemoryStore(join(workDir, "memory.json")),
      goals: new StandingGoals(join(workDir, "goals.json")),
    });
    return agent;
  }

  it("registers seven personal actions", () => {
    const agent = makeAgent();
    expect(agent.actions.map((a) => a.name).sort()).toEqual(
      [
        "AGENT_ADD_STANDING_GOAL",
        "AGENT_LIST_STANDING_GOALS",
        "AGENT_PROPOSE_SOUL_EDIT",
        "AGENT_READ_SOUL",
        "AGENT_RECALL",
        "AGENT_REMEMBER",
        "AGENT_REMOVE_STANDING_GOAL",
      ].sort(),
    );
  });

  it("AGENT_REMEMBER + AGENT_RECALL roundtrip", async () => {
    const agent = makeAgent();
    const remember = agent.actions.find((a) => a.name === "AGENT_REMEMBER")!;
    const recall = agent.actions.find((a) => a.name === "AGENT_RECALL")!;
    await remember.handler(agent, {
      kind: "observation",
      content: "user prefers small txs over batched ones",
      tags: ["style"],
    });
    const result = await recall.handler(agent, { tags: ["style"], limit: 10 });
    expect(result.entries).toHaveLength(1);
  });

  it("AGENT_PROPOSE_SOUL_EDIT does NOT actually write to soul.md", async () => {
    const agent = makeAgent();
    const propose = agent.actions.find((a) => a.name === "AGENT_PROPOSE_SOUL_EDIT")!;
    const result = await propose.handler(agent, {
      reason: "test",
      newContent: "# brand new soul",
    });
    expect(result.proposed).toBe(true);
    expect(result.requiresConfirmation).toBe(true);

    // soul.md should still be empty
    const readSoul = agent.actions.find((a) => a.name === "AGENT_READ_SOUL")!;
    const soulContent = await readSoul.handler(agent, {});
    expect(soulContent.content).toBe("");
  });

  it("PERSONAL_NOT_ATTACHED when context is missing", async () => {
    const wallet = new KeypairWallet(Keypair.random().secret());
    const agent = new StellarAgentKit(wallet, {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
    }).use(PersonalPlugin);
    const remember = agent.actions.find((a) => a.name === "AGENT_REMEMBER")!;
    await expect(
      remember.handler(agent, { kind: "observation", content: "x" }),
    ).rejects.toThrowError(/PERSONAL_NOT_ATTACHED|not attached/);
  });
});
