# Using Stellar Agent Kit with OpenClaw

[OpenClaw](https://github.com/openclaw/openclaw) is a local-first personal AI assistant with a Gateway architecture, multi-channel inbox (WhatsApp, Telegram, Discord, Slack, iMessage, Signal, …), and first-class MCP and skill support. The Stellar Agent Kit slots into OpenClaw cleanly — its skills directory layout and MCP server registry are already what we ship.

This doc gets you Stellar-in-OpenClaw in ~5 minutes. It assumes you've completed `openclaw onboard --install-daemon` and have a running Gateway. If not, see [OpenClaw — Getting Started](https://docs.openclaw.ai/start/getting-started) first.

For [Hermes](https://github.com/NousResearch/hermes-agent) (a separate, also-active personal AI assistant), see [`HERMES_INTEGRATION.md`](./HERMES_INTEGRATION.md) — same kit, different host.

## Two parts

1. **MCP server** — exposes ~80 Stellar actions to OpenClaw's runtime adapters as MCP tools, registered via `openclaw mcp set`.
2. **Agent Skills** — drops `skills/stellar-{agent-kit,autonomous-agent,remittance-mx,x402-monetize}` into OpenClaw's workspace skills directory so the agent gets workflow-aware playbooks.

Install one or both. Tools without skills work but the agent has less context. Skills without tools work for guidance but can't execute. Use both.

## 1. Install the MCP server

The kit ships an MCP adapter as `@stellar-agent-kit/adapter-mcp`. Bootstrap a server via the `mcp-server` template:

```bash
npx create-stellar-agent stellar-mcp --template=mcp-server
cd stellar-mcp
# Edit .env: set STELLAR_SECRET_KEY (testnet recommended for first run)
npm install
```

Generate a wallet if you don't have one:

```bash
node -e "console.log(require('@stellar/stellar-sdk').Keypair.random().secret())"
# put the output in .env as STELLAR_SECRET_KEY
```

Register the server with OpenClaw's MCP client registry (this writes to `~/.openclaw/openclaw.json` under `mcp.servers`):

```bash
openclaw mcp set stellar-agent '{
  "command": "npx",
  "args": ["tsx", "/absolute/path/to/stellar-mcp/index.ts"],
  "env": {
    "STELLAR_SECRET_KEY": "S...",
    "STELLAR_NETWORK": "testnet"
  }
}'
```

Verify it landed:

```bash
openclaw mcp list
openclaw mcp show stellar-agent --json
```

The runtime adapters (e.g. embedded Pi) will pick up the registry entry on next launch and expose Stellar tools alongside whatever else OpenClaw is doing in `coding` and `messaging` profiles. (If you've configured `tools.deny: ["bundle-mcp"]` or are using the `minimal` profile, MCP tools are hidden — flip those off to surface Stellar.)

### Env safety note

OpenClaw rejects interpreter-startup env keys (`NODE_OPTIONS`, `PYTHONPATH`, `RUBYOPT`, etc.) under stdio MCP `env` blocks as a hardening measure. Ordinary credential / API-key vars like `STELLAR_SECRET_KEY`, `SOROSWAP_API_KEY`, `BRAVE_API_KEY` are unaffected — pass them as shown above.

### Mainnet posture

For mainnet, add the explicit risk-acknowledgement env var:

```bash
openclaw mcp set stellar-agent '{
  "command": "npx",
  "args": ["tsx", "/absolute/path/to/stellar-mcp/index.ts"],
  "env": {
    "STELLAR_SECRET_KEY": "S...",
    "STELLAR_NETWORK": "mainnet",
    "STELLAR_AGENT_I_UNDERSTAND_THE_RISK": "1",
    "STELLAR_RPC_URL": "https://mainnet.sorobanrpc.com"
  }
}'
```

The MCP server template's safety boundaries are the kit's, not OpenClaw's. The `mcp-server` template is read-mostly + simple writes by default. For full runner safety (allowlist + spend caps + human-in-loop), use the `personal-agent` or `telegram-bot` template alongside OpenClaw — see *Combining* below.

## 2. Install the Agent Skills

OpenClaw loads skills from `~/.openclaw/workspace/skills/<skill>/SKILL.md`. The kit's `skills/` layout matches exactly, so a single symlink wires up all four:

```bash
ln -s "$(pwd)/skills" ~/.openclaw/workspace/skills/stellar-agent-kit-skills
```

If you only want a subset, copy individual skill folders:

```bash
cp -r skills/stellar-agent-kit ~/.openclaw/workspace/skills/
cp -r skills/stellar-autonomous-agent ~/.openclaw/workspace/skills/
```

Restart OpenClaw (or just the agent session). Now when you mention any of the trigger phrases below in any channel, OpenClaw loads the relevant skill into context.

| Skill | Triggers when you mention… |
| --- | --- |
| `skills/stellar-agent-kit` | sending XLM, USDC, trustlines, swaps, Blend, Soroban contracts, anchors |
| `skills/stellar-autonomous-agent` | autonomous, scheduled agent, safety, OpenRouter, treasury bot |
| `skills/stellar-remittance-mx` | remittance, Mexico, MXN, SPEI, Etherfuse, off-ramp |
| `skills/stellar-x402-monetize` | x402, paid API, monetize, agent-to-agent payments |

OpenClaw also has [ClawHub](https://clawhub.ai) — its skill registry. We ship out-of-band here for now; if/when this kit's skills land in ClawHub, this doc will point there too.

## 3. Channel-specific setup

OpenClaw routes inbound messages from many channels (WhatsApp / Telegram / Discord / Slack / iMessage / Signal / …) into the same agent. The Stellar tools work identically across all of them — once the MCP server is registered, asking *"what's my XLM balance"* in WhatsApp does the same thing as asking it in Discord.

A few channel-aware suggestions:

- **DM allowlist:** keep `dmPolicy="pairing"` (default) so unknown senders can't trigger Stellar actions. Pair with `openclaw pairing approve <channel> <code>` only for senders you intend to give wallet access.
- **Group channels:** flip `agents.defaults.sandbox.mode: "non-main"` so Stellar tools don't run with full host access in shared rooms. The default sandbox keeps `read`, `write`, `bash`, etc. available to the kit while denying `browser`, `discord`, etc. — review [Sandboxing docs](https://docs.openclaw.ai/gateway/sandboxing) for the per-tool list.
- **Voice / Talk Mode:** the kit's actions are LLM-callable so they Just Work over Voice Wake. *"send 5 lumens to G..."* spoken into your Mac will route through the same MCP tools.

## 4. Combining: OpenClaw for chat, our standalone for autonomous

The pattern that scales:

- **OpenClaw**: your daily AI assistant. Multi-channel, voice, Canvas, the works. Talks to you on whatever channel you're already on. Calls Stellar tools via MCP for *user-initiated* asks.
- **`personal-agent` or `telegram-bot`** (this kit's templates): a separate process you run for *autonomous* Stellar work — standing goals, scheduled rebalancing, treasury monitoring. Has the runner's full safety stack (action allowlist + spend caps + network sandbox + human-in-loop). Doesn't need OpenClaw to run.

They share state if you point them at the same wallet, but otherwise are independent. The runner's safety enforcement is per-process, so an autonomous agent doing background work doesn't pollute the safety posture of OpenClaw's user-facing tool calls.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `openclaw mcp list` doesn't show stellar-agent | Wrote to wrong config file | Confirm `~/.openclaw/openclaw.json` was written; some installs use a different path — check with `openclaw doctor` |
| Tools never surface in chat | Profile is `minimal` or `tools.deny: ["bundle-mcp"]` is set | Switch profile or remove the deny |
| `STELLAR_SECRET_KEY` env var rejected | Shouldn't happen — only interpreter-startup keys are blocked. Confirm exact var name | If in doubt, set on the host instead of in the MCP `env` block |
| Mainnet refuses to start | Missing `STELLAR_AGENT_I_UNDERSTAND_THE_RISK=1` | Add it explicitly (deliberate footgun guard) |
| `npx tsx ...` slow on first call | npm cold-cache | Pre-warm with `cd stellar-mcp && npx tsx --version` once |

## What we don't ship

- A native Stellar plugin baked into OpenClaw — we wire in via MCP + skills, both of which OpenClaw already supports as first-class extension points. No fork or plugin install required.
- Channel adapters — OpenClaw owns the channel layer; the kit speaks pure Stellar.
- Approval UI — OpenClaw has its own approval flow (`permissions_list_open` / `permissions_respond`). The kit's `requireHumanFor` config still works in `personal-agent`/`telegram-bot` standalone mode, but for OpenClaw-driven calls you'd lean on OpenClaw's approval system.

We focus on the Stellar layer; OpenClaw focuses on the assistant + channel layer. They compose.
