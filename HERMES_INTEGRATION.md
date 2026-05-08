# Using Stellar Agent Kit with Hermes Agent

If you already run [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research's personal AI assistant — successor to OpenClaw), you can plug Stellar capabilities into it without scaffolding a separate project. Hermes natively supports MCP servers and the [agentskills.io](https://agentskills.io) standard, both of which we ship.

This doc gets you Stellar-in-Hermes in ~5 minutes.

## Two parts

1. **MCP server** — exposes ~80 Stellar actions as Hermes tools.
2. **Agent Skills** — gives Hermes opinionated playbooks for Stellar workflows (remittance, autonomous agents, x402 monetization).

You can install one or both. Tools without skills work but the agent has less context. Skills without tools work for guidance but can't execute. Use both.

## 1. Install the MCP server

The kit ships an MCP adapter as `@stellar-agent-kit/adapter-mcp`. The simplest way to get it running is via the `mcp-server` template:

```bash
npx create-stellar-agent stellar-mcp --template=mcp-server --no-install
cd stellar-mcp
npm install

# Generate a wallet (or paste your own)
node -e "const {Keypair}=require('@stellar/stellar-sdk');const k=Keypair.random();console.log(k.secret());"
# put the result in .env as STELLAR_SECRET_KEY
```

Then register it with Hermes:

```bash
hermes mcp add stellar-agent \
  --command tsx \
  --args /absolute/path/to/stellar-mcp/index.ts \
  --env STELLAR_SECRET_KEY=$(cat /absolute/path/to/stellar-mcp/.env | grep STELLAR_SECRET_KEY | cut -d= -f2)
```

Or edit your Hermes config directly (`~/.hermes/config/mcp.json` typically):

```json
{
  "mcpServers": {
    "stellar-agent": {
      "command": "tsx",
      "args": ["/absolute/path/to/stellar-mcp/index.ts"],
      "env": {
        "STELLAR_SECRET_KEY": "S...",
        "STELLAR_NETWORK": "testnet"
      }
    }
  }
}
```

Restart Hermes. Run `hermes` and ask *"what's my Stellar balance?"* — Hermes should call `ASSET_GET_BALANCE` via the MCP server.

## 2. Install the Agent Skills

The kit ships agentskills.io-compliant skills directly under [`skills/`](./skills/) in this repo, plus the kit-wide [`SKILL.md`](./SKILL.md) at the root.

If you've cloned this repo:

```bash
mkdir -p ~/.hermes/skills
ln -s "$(pwd)/skills" ~/.hermes/skills/stellar-agent-kit-skills
ln -s "$(pwd)/SKILL.md" ~/.hermes/skills/stellar-agent-kit
```

Or copy individual skills:

```bash
cp -r skills/stellar-autonomous-agent ~/.hermes/skills/
```

Restart Hermes. Now when you ask about *"Mexican peso remittances"* or *"autonomous Stellar agent"* or *"x402 monetization"*, Hermes will load the relevant skill into context.

The included skills:

| Skill | Triggers when you mention… |
| --- | --- |
| `stellar-agent-kit` (root `SKILL.md`) | sending XLM, USDC, trustlines, swaps, Blend, Soroban contracts, anchors |
| `skills/stellar-remittance-mx` | remittance, Mexico, MXN, SPEI, Etherfuse, off-ramp |
| `skills/stellar-autonomous-agent` | autonomous, scheduled agent, safety, OpenRouter, treasury bot |
| `skills/stellar-x402-monetize` | x402, paid API, monetize, agent-to-agent payments |

## 3. Mainnet posture

The MCP server's safety boundaries are configured via env vars. For mainnet:

```json
"env": {
  "STELLAR_SECRET_KEY": "S...",
  "STELLAR_NETWORK": "mainnet",
  "STELLAR_AGENT_I_UNDERSTAND_THE_RISK": "1",
  "STELLAR_RPC_URL": "https://mainnet.sorobanrpc.com"
}
```

Hermes' own conversational policies don't enforce Stellar-specific safety — that's the kit's job. The MCP server template can be extended with `safety` config if you want allowlist + spend caps at the tool layer (see `personal-agent` template for a pattern). For now, the MCP server template is read-mostly + simple writes; treat it as a knowledgeable tool, not an autonomous executor.

For autonomous behaviour, run `personal-agent` or `telegram-bot` standalone alongside Hermes — those use the runner's full safety stack.

## 4. Combining: Hermes for chat, our standalone for autonomous

The pattern that scales:

- **Hermes**: your daily AI assistant. Talks to you, handles email, gives you Stellar reads via MCP, runs general tasks.
- **`personal-agent` or `telegram-bot`**: a separate process you run for *autonomous* Stellar work — standing goals, scheduled rebalancing, treasury monitoring. Has full runner safety (spend caps, network sandbox, human-in-loop). Doesn't need Hermes to run.

They share state if you point them at the same wallet, but otherwise are independent. The runner's safety enforcement is per-process.

## Migrating from OpenClaw

OpenClaw is the predecessor to Hermes. If you're on OpenClaw, follow the [`hermes claw migrate`](https://hermes-agent.nousresearch.com/docs/migration/openclaw) flow first, then come back here.

## What we don't ship

- Multi-channel gateway (Slack, Discord, Signal, etc.) — Hermes does this; use it.
- TUI — Hermes does this; use it.
- LLM fine-tuning / Atropos RL environments — out of scope.

We focus on the Stellar layer; Hermes focuses on the assistant layer. They compose.
