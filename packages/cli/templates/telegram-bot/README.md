# {{projectName}}

Your personal Stellar agent on Telegram. Same agent, same memory, same soul as the `personal-agent` template — just reachable from your phone instead of your terminal.

## What you get

- **Telegram chat interface** — DM the bot anything; the agent reasons and replies
- **Strict user allowlist** — bot ignores everyone except `TELEGRAM_USER_ID`
- **In-process heartbeat** — standing goals fire every minute and get DM'd to you when results matter
- **Canonical-asset registry** — agent uses verified issuer addresses (USDC, EURC, AQUA, etc.) instead of guessing
- **Slash commands**: `/soul`, `/memory`, `/goals`, `/balance`

## Setup

1. **Create your bot** with [@BotFather](https://t.me/BotFather) on Telegram. Save the token.
2. **Get your user ID** — DM [@userinfobot](https://t.me/userinfobot) on Telegram. It replies with your numeric ID.
3. Fill `.env`:

```
STELLAR_SECRET_KEY=S...
STELLAR_NETWORK=testnet  # or mainnet (with hardening below)
OPENROUTER_API_KEY=sk-or-v1-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_USER_ID=...
BRAVE_API_KEY=...        # optional, for web search
```

```bash
npm install
npm start
```

Open Telegram, find your bot, send `/start`. The agent replies.

## Conversation patterns

| You say | Agent does |
| --- | --- |
| "what's my balance?" | reads via Horizon, replies |
| "send 5 XLM to G..." | describes intent, asks for confirm if mainnet, executes |
| "watch Reflector — sell my XLM if it drops below $0.10" | adds a standing goal; heartbeat re-evaluates every minute |
| "I sent you 200 XLM, swap half to USDC" | reads new balance, splits, swaps via Soroswap |
| "search for Soroswap aggregator docs" | uses Brave Search (if `BRAVE_API_KEY` set) |
| "remember I prefer USDC for amounts above $100" | writes to working memory |

## Operational notes

**Always-on hosting.** A Telegram bot needs to be reachable. Options:

- **Local laptop**: works while open; stops when sleeping. Fine for testing.
- **Personal VPS** ($5/mo): set up with `systemd` for auto-restart. Most reliable.
- **Railway / Fly.io / Render**: good free tiers; deploy with one click.
- **Cloudflare Workers**: NOT supported — telegraf needs Node, not the Workers runtime.

**Long-poll vs webhook.** Default is long-poll mode (telegraf's `bot.launch()`). Works behind NAT. For higher throughput, switch to webhook mode + a public HTTPS endpoint.

## Mainnet posture

The bot has the same safety layers as `personal-agent`:
- Network sandbox (refuses to start on mainnet without `STELLAR_AGENT_I_UNDERSTAND_THE_RISK=1`)
- Spend caps default to ~10 USDC/day on mainnet
- `requireHumanFor` on actions above 0.1 USDC
- Use a session-key wallet, not your primary

⚠️ **Human-in-loop heads-up.** The default `confirm` callback prompts via stdin/readline on the host process — that's fine for `personal-agent` (you're at the terminal) but on a Telegram bot it just blocks waiting for input you can't easily provide. For Telegram-side confirmation, override `safety.confirm` in `lib/agent.ts` to DM the user via the bot and await a yes/no reply (the `bundle` already has a Telegraf instance available — wire it through). Until you do, treat `requireHumanFor` as effectively a hard-block on mainnet.

Edit `lib/agent.ts` to tune the safety config.

## State persistence

Everything important lives in `./state/`:
- `soul.md` — your personality file. Edit directly.
- `memory.json` — agent's working memory.
- `goals.json` — standing goals.
- `kv.json` — runner state (spend cap windows, conversation messages).

Back this directory up if you care about continuity.

## Related templates

- `personal-agent` — same agent, terminal REPL instead of Telegram
- `autonomous-runner` — cron-driven loop, no chat
