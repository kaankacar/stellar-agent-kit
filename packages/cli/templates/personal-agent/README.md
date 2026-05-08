# {{projectName}}

Your personal Stellar agent. Conversational, with memory and a soul.

## What you get

- **Terminal REPL with in-process heartbeat** — type freely; standing goals fire on a 60s heartbeat alongside the REPL and print results above your prompt without interrupting your typing
- **~80 Stellar actions** plus web search at the agent's disposal
- **Canonical-asset registry** — the agent uses verified issuer addresses (USDC, EURC, AQUA, etc.) and won't hallucinate G-addresses for trustlines
- **`soul.md`** — your personality file (in `./state/soul.md`); the agent reads it on every turn but only suggests edits
- **`memory.json`** — agent's working memory; tag-searchable, persists across sessions
- **Standing goals** — "watch X, do Y" instructions the agent re-evaluates on the heartbeat
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
npm start         # interactive REPL with in-process heartbeat (default)
```

Standing goals fire automatically on a 60s heartbeat while you use the REPL. To run the heartbeat as a separate process instead (cron / systemd / dedicated pane), set `STELLAR_AGENT_HEARTBEAT=off` in `.env` and:

```bash
npm run heartbeat # dedicated standing-goal evaluator
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
