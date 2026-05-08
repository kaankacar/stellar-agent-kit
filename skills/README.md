# Stellar Agent Kit Skills

Curated [Agent Skills](https://agentskills.io) for building on Stellar with this kit. Each skill is an agent-readable playbook (markdown) that Claude Code, OpenAI Codex, Cursor, GitHub Copilot Agent, Cline, Windsurf, Hermes, OpenClaw, and any other agentskills.io-compatible assistant can read.

## Skills

| Skill | What it covers | When the agent invokes it |
| --- | --- | --- |
| [`stellar-agent-kit`](./stellar-agent-kit/SKILL.md) | Kit overview — action surface, MCP vs SDK install, the seven critical Stellar gotchas | Any Stellar / Soroban request: send XLM, trustlines, swaps, contracts |
| [`stellar-autonomous-agent`](./stellar-autonomous-agent/SKILL.md) | Build a SAFE autonomous Stellar agent with `@stellar-agent-kit/runner`. Layered defence, OpenRouter setup. | "build me an autonomous agent", "scheduled treasury bot" |
| [`stellar-remittance-mx`](./stellar-remittance-mx/SKILL.md) | Mexican-peso ↔ USDC remittance via Etherfuse SPEI rails. KYC flow, customer-id permanence gotcha. | "remittance to Mexico", "MXN off-ramp", "Etherfuse" |
| [`stellar-x402-monetize`](./stellar-x402-monetize/SKILL.md) | Turn an HTTP API into an x402-paid endpoint that AI agents can buy from, and write agents that pay. | "x402", "paid API for agents", "agent-to-agent payments" |

Start with `stellar-agent-kit` — it's the foundation. The other three are workflow-specific playbooks that build on it.

## Install

If you've cloned this repo, the easiest path is to symlink the whole `skills/` directory:

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
cp -r skills/stellar-agent-kit ~/.claude/skills/
cp -r skills/stellar-autonomous-agent ~/.claude/skills/
```

For users who don't have the repo locally, `git clone` the kit and symlink as above.

## What's a "skill"?

A skill is a directory containing a `SKILL.md` (with YAML frontmatter — `name` + `description`) and optional supporting markdown files. The agent reads the `description` to decide when to invoke the skill, then loads `SKILL.md` and any referenced files into context. See [agentskills.io](https://agentskills.io) for the spec.

## License

Apache-2.0 — same as the kit.
