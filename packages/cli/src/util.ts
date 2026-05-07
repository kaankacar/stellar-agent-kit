import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** Versions stamped into generated package.json files. */
export const STELLAR_AGENT_KIT_VERSION = "^0.1.0-alpha.1";

export interface CopyOptions {
  /** Map of `{{placeholder}}` → replacement value, applied to every file body. */
  replacements: Record<string, string>;
  /** When true, skip writing files that already exist in the destination. */
  skipExisting?: boolean;
}

/**
 * Recursively copy a template directory into a destination, expanding
 * `{{placeholder}}` tokens in file contents and renaming files prefixed with
 * `_` (e.g. `_gitignore` → `.gitignore`). The underscore prefix is the
 * standard workaround for npm stripping dotfiles from tarballs.
 */
export function copyTemplate(
  templateDir: string,
  destDir: string,
  opts: CopyOptions,
): { written: string[] } {
  if (!existsSync(templateDir) || !statSync(templateDir).isDirectory()) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }
  mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  walk(templateDir, (absPath) => {
    const rel = relative(templateDir, absPath);
    const destPath = join(destDir, renameUnderscoreDotfile(rel));
    if (opts.skipExisting && existsSync(destPath)) return;
    mkdirSync(dirname(destPath), { recursive: true });
    const raw = readFileSync(absPath, "utf8");
    writeFileSync(destPath, applyReplacements(raw, opts.replacements));
    written.push(destPath);
  });
  return { written };
}

function walk(dir: string, onFile: (path: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

/**
 * Rename only the leaf segment if it begins with `_`. Internal underscores
 * (`my_file.ts`) are left alone.
 */
export function renameUnderscoreDotfile(relPath: string): string {
  const parts = relPath.split(/[\\/]/);
  const last = parts[parts.length - 1];
  if (last && last.startsWith("_") && !last.startsWith("__")) {
    parts[parts.length - 1] = "." + last.slice(1);
  }
  return parts.join("/");
}

export function applyReplacements(input: string, replacements: Record<string, string>): string {
  let out = input;
  for (const [key, value] of Object.entries(replacements)) {
    const token = `{{${key}}}`;
    out = out.split(token).join(value);
  }
  return out;
}

export type PackageManager = "pnpm" | "npm" | "yarn";

/**
 * Detect the package manager from `npm_config_user_agent` (set by the runner
 * that invoked us, e.g. `npx`/`pnpm dlx`). Defaults to `npm`.
 */
export function detectPackageManager(env: NodeJS.ProcessEnv = process.env): PackageManager {
  const ua = env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  return "npm";
}

export function installDeps(targetDir: string, pm: PackageManager): void {
  const cmd = pm === "yarn" ? "yarn" : `${pm} install`;
  execSync(cmd, { cwd: targetDir, stdio: "inherit" });
}

export function isValidProjectName(name: string): boolean {
  // npm package name rules, simplified: lowercase, no spaces, can include
  // dashes/underscores/dots, no leading dot or underscore.
  if (!name || name.length > 214) return false;
  if (/^[._]/.test(name)) return false;
  return /^[a-z0-9][a-z0-9._-]*$/.test(name);
}
