import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEMPLATES, scaffold } from "../scaffold";

describe("scaffold", () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "create-stellar-agent-test-"));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("exposes 6 templates with personal-agent + telegram-bot first", () => {
    expect(TEMPLATES).toEqual([
      "personal-agent",
      "telegram-bot",
      "autonomous-runner",
      "mcp-server",
      "remittance-mx",
      "agentic-defi",
    ]);
  });

  it("scaffolds mcp-server template with placeholder substitution", async () => {
    const target = join(workDir, "my-mcp");
    const { filesWritten } = await scaffold({
      templateName: "mcp-server",
      targetDir: target,
      projectName: "my-mcp",
    });
    expect(filesWritten.length).toBeGreaterThan(0);

    const pkg = JSON.parse(await readFile(join(target, "package.json"), "utf-8"));
    expect(pkg.name).toBe("my-mcp");

    // _gitignore should have been renamed to .gitignore
    await expect(access(join(target, ".gitignore"))).resolves.toBeUndefined();
    // _env.example to .env.example
    await expect(access(join(target, ".env.example"))).resolves.toBeUndefined();
  });

  it("scaffolds autonomous-runner template", async () => {
    const target = join(workDir, "my-runner");
    await scaffold({ templateName: "autonomous-runner", targetDir: target, projectName: "my-runner" });
    const indexTs = await readFile(join(target, "index.ts"), "utf-8");
    expect(indexTs).toContain("autonomousRun");
    expect(indexTs).toContain("TestnetSandbox");
    const pkg = JSON.parse(await readFile(join(target, "package.json"), "utf-8"));
    expect(pkg.name).toBe("my-runner");
    expect(pkg.dependencies["@stellar-agent-kit/runner"]).toBeDefined();
  });

  it("rejects an unknown template name", async () => {
    await expect(
      scaffold({
        templateName: "doesnt-exist" as never,
        targetDir: join(workDir, "x"),
        projectName: "x",
      }),
    ).rejects.toThrow(/not found/i);
  });
});
