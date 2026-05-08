# Stellar Agent Kit Skills

Curated [Agent Skills](https://agentskills.io) for building on Stellar with this kit. Each skill is an agent-readable playbook (markdown) that Claude Code, OpenAI Codex, Cursor, GitHub Copilot Agent, Cline, Windsurf, Hermes, OpenClaw, and any other agentskills.io-compatible assistant can read to scaffold a Stellar project end-to-end.

These complement the kit-wide [`SKILL.md`](../SKILL.md) at the repo root. The root skill teaches an agent how to *use* the kit (action surface, gotchas, integration paths). The per-workflow skills below are *playbooks* for specific domains.

## Skills

| Skill | What it covers |
| --- | --- |
| [`stellar-remittance-mx`](./stellar-remittance-mx/SKILL.md) | Mexican-peso ↔ USDC remittance via Etherfuse SPEI rails. KYC flow, customer-id permanence gotcha, sandbox vs prod URLs. |
| [`stellar-autonomous-agent`](./stellar-autonomous-agent/SKILL.md) | Build a SAFE autonomous Stellar agent with `@stellar-agent-kit/runner`. Layered defence (smart-account policies → kit allowlist → network sandbox → human-in-loop). Free OpenRouter setup. |
| [`stellar-x402-monetize`](./stellar-x402-monetize/SKILL.md) | Turn an HTTP API into an x402-paid endpoint that AI agents can buy from, and write agents that pay. |

## Install (no clone needed)

If you already have this repo checked out, the easiest way is to symlink the directory you need into your assistant's skills location:

```bash
# Claude Code (global)
ln -s "$(pwd)/skills" ~/.claude/skills/stellar-agent-kit-skills

# Hermes
ln -s "$(pwd)/skills" ~/.hermes/skills/stellar-agent-kit-skills

# Cursor (per-project)
mkdir -p .cursor/skills && ln -s ../../skills .cursor/skills/stellar-agent-kit-skills
```

Or copy individual skill folders if you only need one:

```bash
cp -r skills/stellar-autonomous-agent ~/.claude/skills/
```

For users who don't have the repo locally, `git clone` the kit and symlink as above. (The standalone `kaankacar/stellar-agent-kit-skills` repo is being kept in sync for now but the source-of-truth lives here.)

## What's a "skill"?

A skill is a directory containing a `SKILL.md` (with YAML frontmatter — `name` + `description`) and optional supporting markdown files. The agent reads the `description` to decide when to invoke the skill, then loads `SKILL.md` and any referenced files into context. See [agentskills.io](https://agentskills.io) for the spec.

## License

Apache-2.0 — same as the kit.
