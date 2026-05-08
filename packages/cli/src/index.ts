import { resolve } from "node:path";
import { spawn } from "node:child_process";
import prompts from "prompts";
import kleur from "kleur";
import { TEMPLATES, type TemplateName, scaffold, pathExists } from "./scaffold";
import { runWizard, writeEnv, writeSoul } from "./wizard";

interface ParsedArgs {
  projectName?: string;
  template?: TemplateName;
  network?: "testnet" | "mainnet";
  noInstall: boolean;
  noWizard: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { noInstall: false, noWizard: false, help: false };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--no-install") args.noInstall = true;
    else if (arg === "--no-wizard") args.noWizard = true;
    else if (arg.startsWith("--template=")) args.template = arg.slice("--template=".length) as TemplateName;
    else if (arg.startsWith("--network=")) {
      const v = arg.slice("--network=".length);
      args.network = v === "mainnet" ? "mainnet" : "testnet";
    } else if (!arg.startsWith("-") && !args.projectName) args.projectName = arg;
  }
  return args;
}

function printHelp(): void {
  console.log(`
${kleur.bold("create-stellar-agent")}

  Scaffold a new Stellar Agent Kit project. Defaults to an interactive wizard
  unless --no-wizard or all required flags are present.

${kleur.bold("Usage")}
  npx create-stellar-agent [<project-name>] [options]

${kleur.bold("Options")}
  --template=<name>     Pick a template non-interactively
  --network=<n>         testnet | mainnet
  --no-install          Skip dependency install
  --no-wizard           Skip the interactive wizard (flag-driven mode)
  -h, --help            Show this message

${kleur.bold("Templates")}
  ${TEMPLATES.map((t) => `${kleur.cyan(t.padEnd(20))} ${describeTemplate(t)}`).join("\n  ")}
`);
}

function describeTemplate(name: TemplateName): string {
  switch (name) {
    case "mcp-server":
      return "Stdio MCP server consumable by Claude Code / Cursor.";
    case "autonomous-runner":
      return "Cron-driven autonomous agent loop.";
    case "personal-agent":
      return "Conversational personal Stellar agent in your terminal.";
    case "telegram-bot":
      return "Personal agent over Telegram (telegraf).";
  }
}

async function flagMode(args: ParsedArgs): Promise<void> {
  let projectName = args.projectName;
  if (!projectName) {
    const r = await prompts({
      type: "text",
      name: "name",
      message: "Project name",
      initial: "my-stellar-agent",
    });
    projectName = r.name as string | undefined;
  }
  if (!projectName) {
    console.error(kleur.red("Project name is required."));
    process.exit(1);
  }

  let template = args.template;
  if (!template || !TEMPLATES.includes(template)) {
    const r = await prompts({
      type: "select",
      name: "tmpl",
      message: "Template",
      choices: TEMPLATES.map((t) => ({ title: t, description: describeTemplate(t), value: t })),
      initial: 0,
    });
    template = r.tmpl as TemplateName | undefined;
  }
  if (!template) {
    console.error(kleur.red("Template is required."));
    process.exit(1);
  }

  const targetDir = resolve(process.cwd(), projectName);
  if (await pathExists(targetDir)) {
    console.error(kleur.red(`Directory '${projectName}' already exists. Aborting.`));
    process.exit(1);
  }

  console.log(kleur.gray(`\nScaffolding ${kleur.bold(template)} into ${targetDir}…`));
  const { filesWritten } = await scaffold({ templateName: template, targetDir, projectName });
  console.log(kleur.green(`✓ ${filesWritten.length} files written.`));

  console.log(kleur.gray("\nNext steps:"));
  console.log(kleur.cyan(`  cd ${projectName}`));
  console.log(kleur.cyan("  cp .env.example .env  # fill in keys"));
  console.log(kleur.cyan("  npm install"));
  console.log(kleur.cyan("  npm start"));
  console.log();
}

async function wizardMode(): Promise<void> {
  const answers = await runWizard();
  const targetDir = resolve(process.cwd(), answers.projectName);
  if (await pathExists(targetDir)) {
    console.error(kleur.red(`\nDirectory '${answers.projectName}' already exists. Aborting.`));
    process.exit(1);
  }
  console.log(kleur.gray(`\nScaffolding ${kleur.bold(answers.template)} into ${targetDir}…`));
  const { filesWritten } = await scaffold({
    templateName: answers.template,
    targetDir,
    projectName: answers.projectName,
  });
  console.log(kleur.green(`✓ ${filesWritten.length} files written.`));

  await writeEnv(targetDir, answers);
  console.log(kleur.green("✓ .env written"));

  const soulWritten = await writeSoul(targetDir, answers);
  if (soulWritten) {
    console.log(kleur.green("✓ state/soul.md seeded with your personality answers"));
  }

  if (answers.installDeps) {
    console.log(kleur.gray("\nInstalling dependencies (this can take a minute)…"));
    await new Promise<void>((resolveExec, reject) => {
      const proc = spawn("npm", ["install"], { cwd: targetDir, stdio: "inherit" });
      proc.on("exit", (code) => (code === 0 ? resolveExec() : reject(new Error(`npm install exited ${code}`))));
      proc.on("error", reject);
    }).catch((err) => {
      console.error(kleur.yellow(`⚠  Install failed: ${err.message}. Run 'npm install' manually.`));
    });
  }

  console.log(kleur.green("\n🎉 Ready!"));
  console.log(kleur.gray("Next:"));
  console.log(kleur.cyan(`  cd ${answers.projectName}`));
  console.log(kleur.cyan("  npm start"));
  if (answers.network === "mainnet") {
    console.log(
      kleur.yellow(
        "\n⚠  Mainnet mode is set. The agent will move REAL MONEY. Review your safety config and start with small spend caps.",
      ),
    );
  }
  console.log();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  // Flag-driven mode if user passed enough flags OR explicitly --no-wizard.
  const hasEnoughFlags =
    args.projectName !== undefined && args.template !== undefined;
  if (args.noWizard || hasEnoughFlags) {
    await flagMode(args);
    return;
  }

  await wizardMode();
}

main().catch((err) => {
  console.error(kleur.red("Scaffolding failed:"), err.message ?? err);
  process.exit(1);
});
