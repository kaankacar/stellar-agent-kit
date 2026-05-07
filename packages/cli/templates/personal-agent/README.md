# {{projectName}}

Your personal Stellar agent. Conversational, with memory and a soul.

## What you get

- **Terminal REPL** — type freely; the agent uses ~80 Stellar actions plus web search to answer
- **`soul.md`** — your personality file (in `./state/soul.md`); the agent reads it on every turn but only suggests edits
- **`memory.json`** — agent's working memory; tag-searchable, persists across sessions
- **Standing goals** — "watch X, do Y" instructions the agent re-evaluates on a heartbeat
- **Layered safety** — network sandbox, spend caps, human-in-loop on mainnet

## Setup

This was scaffolded by `create-stellar-agent`. If you ran the wizard, `.env` is already filled. Otherwise:

```bash
cp .env.example .env
# Set STELLAR_SECRET_KEY + ONE of OPENROUTER_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY / OLLAMA_BASE_URL
# Optional: BRAVE_API_KEY (web search), COINGECKO_API_KEY (market data), ETHERFUSE_API_KEY (MXN rails)
npm install
```

## Run

```bash
npm start         # interactive REPL
npm run heartbeat # standing-goal evaluator (run in a separate tmux pane / systemd unit / cron)
```

## REPL slash commands

| Command | What it shows |
| --- | --- |
| `/soul` | current soul.md content |
| `/memory` | last 20 memory entries |
| `/goals` | active standing goals |
| `exit` / `quit` | leave the REPL |

## Conversation patterns the agent handles

- **Direct command**: "send 5 XLM to G..."
- **Read + reason**: "what's my balance and how does that compare to last week?"
- **Standing goal**: "watch Reflector — sell my XLM if it drops below $0.10. Cancel after 24h."
- **Memory write**: "remember that I prefer USDC for amounts above $100"
- **Web research**: "search for the latest Soroswap aggregator API docs and summarize"

## Soul.md

Edit `./state/soul.md` directly whenever. The agent reads it on every turn. It can propose updates via `AGENT_PROPOSE_SOUL_EDIT`, but only YOU apply them.

## Mainnet

Default is testnet. To run on mainnet:

1. Set `STELLAR_NETWORK=mainnet` in `.env`
2. Set `STELLAR_AGENT_I_UNDERSTAND_THE_RISK=1` in `.env` (required, otherwise refuses to start)
3. Use a session-key wallet, not your primary
4. Review the safety config in `lib/agent.ts` — defaults are conservative (10 USDC/day, human confirm > 0.1 USDC)

## Heartbeat as a service

Long-running heartbeat for standing goals. Use whichever fits:

```bash
# Local development — keep it running in a tmux pane
npm run heartbeat

# systemd — see ./state/.systemd-example below

# Cron — run every minute
* * * * * cd /full/path/to/{{projectName}} && timeout 50s npm run heartbeat >> ./heartbeat.log 2>&1
```

(systemd unit example shipped in this template's lib/agent.ts comments.)
