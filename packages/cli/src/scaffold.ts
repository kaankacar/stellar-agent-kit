import { promises as fs } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the templates root. In dev (`tsx src/index.ts`) HERE points at src/;
 * in built form (`dist/index.js`) it points at dist/. Templates live at
 * `<package-root>/templates/` either way, one level above.
 */
export function templatesRoot(): string {
  return join(HERE, "..", "templates");
}

export const TEMPLATES = [
  "personal-agent",
  "telegram-bot",
  "autonomous-runner",
  "mcp-server",
  "remittance-mx",
  "agentic-defi",
] as const;
export type TemplateName = (typeof TEMPLATES)[number];

export interface ScaffoldOptions {
  templateName: TemplateName;
  targetDir: string;
  projectName: string;
  agentKitVersion?: string;
}

interface ScaffoldResult {
  filesWritten: string[];
}

export async function scaffold(opts: ScaffoldOptions): Promise<ScaffoldResult> {
  const src = join(templatesRoot(), opts.templateName);
  const exists = await pathExists(src);
  if (!exists) {
    throw new Error(
      `Template '${opts.templateName}' not found at ${src}. Available: ${TEMPLATES.join(", ")}.`,
    );
  }
  await fs.mkdir(opts.targetDir, { recursive: true });
  const written: string[] = [];
  await copyDir(src, opts.targetDir, opts, written);
  return { filesWritten: written };
}

async function copyDir(
  srcDir: string,
  destDir: string,
  opts: ScaffoldOptions,
  written: string[],
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    // Files prefixed `_` are renamed at scaffold time so npm pack doesn't strip
    // them as dotfiles. e.g. `_gitignore` → `.gitignore`.
    const destName = entry.name.startsWith("_") ? `.${entry.name.slice(1)}` : entry.name;
    const destPath = join(destDir, destName);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, opts, written);
    } else {
      const raw = await fs.readFile(srcPath, "utf-8");
      const replaced = applyPlaceholders(raw, opts);
      await fs.writeFile(destPath, replaced, "utf-8");
      written.push(relative(opts.targetDir, destPath));
    }
  }
}

function applyPlaceholders(content: string, opts: ScaffoldOptions): string {
  return content
    .replaceAll("{{projectName}}", opts.projectName)
    .replaceAll("{{stellarAgentKitVersion}}", opts.agentKitVersion ?? "^0.1.0-alpha.1");
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
