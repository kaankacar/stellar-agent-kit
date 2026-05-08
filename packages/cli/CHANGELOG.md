# create-stellar-agent

## 0.1.8

### Patch Changes

- Two real fixes the user hit on first 0.1.7 run:
  1. **Banner missing in personal-agent + telegram-bot**: `printBanner` was
     defined in `lib/agent.ts` (shipped in 0.1.7) but the entry scripts
     (`index.ts`) were never updated to actually call it. So `npm start`
     showed the old single-line greeting instead of the full guardrails
     summary. Now the entry scripts import + call `printBanner(bundle)`
     immediately after `buildAgent()`.
  2. **"Recursive reference detected" log spam on every tool call**:
     `plugin-soroban/src/actions/invoke.ts` defined `argSchema` as
     `z.lazy(() => z.union([..., z.array(argSchema)]))`. Every LLM tool-call
     that converts the schema to JSON Schema (i.e. all of them) printed
     two `"Recursive reference detected at #/properties/args/items/anyOf/5/items! Defaulting to any"`
     warnings from zod-to-json-schema. The deeper nesting flexibility was
     rarely useful and JSON Schema can't express it anyway. Replaced with
     a flat one-level union: primitives + `z.array(<primitive>)`. Truly
     nested args can be passed as JSON-encoded strings.

## 0.1.7

### Patch Changes

- Every template now prints a clear startup banner showing:
  - Network (with one-line instructions on switching to mainnet safely)
  - Wallet pubkey (truncated for skimming)
  - Active LLM provider + model
  - Active safety guardrails (allowlist size, spend caps, human-in-loop, dry-run)
  - Capabilities (Soroswap / Brave / CoinGecko / Etherfuse — ✓/✗)
  - Per-template quick guide ("how do I use this thing?")
  - Pointer to the file/section you'd edit to change each setting

  `personal-agent` and `telegram-bot` get the full banner; `autonomous-runner`,
  `mcp-server`, `agentic-defi`, and `remittance-mx` get template-specific
  condensed versions.

  `mcp-server`'s banner is on stderr (stdout is reserved for the JSON-RPC
  protocol).

## 0.1.6

### Patch Changes

- Wire the Soroswap API key into the wizard and templates. Soroswap's public API
  (`https://api.soroswap.finance`) is gated on **both testnet and mainnet** with
  HTTP 401 / 403 — without a key, every `SOROSWAP_QUOTE` and `SOROSWAP_SWAP`
  action returns "Forbidden resource". The kit's plugin-defi already supports
  the key (via `apiKeys.soroswap`); the wizard and templates didn't surface it.

  Changes:
  - Wizard adds a Soroswap API key prompt (alongside Brave / CoinGecko) for the
    `personal-agent`, `telegram-bot`, and `agentic-defi` templates. Prompt
    message points at https://docs.soroswap.finance for signup.
  - `personal-agent`, `telegram-bot`, `autonomous-runner` (×2 files), and
    `agentic-defi` templates now read `SOROSWAP_API_KEY` from `.env` and pass
    it to `apiKeys.soroswap`.
  - `.env.example` files updated with the `SOROSWAP_API_KEY=` line and a
    comment noting it's required for any swap/quote.
  - Wizard now writes `SOROSWAP_API_KEY=` to the generated `.env` when the user
    provides a value.

  Skipping the key still works — actions that don't touch Soroswap continue to
  function. Only swap/quote calls fail until the key is set.

## 0.1.5

### Patch Changes

- Lifecycle + correctness fixes in the personal-agent and telegram-bot templates:
  1. **Anthropic model id**: switched default from `claude-haiku-4-5-20251001` (dated) to `claude-haiku-4-5` (auto-tracks latest revision). Both are valid per `@ai-sdk/anthropic` d.ts; the dateless form is more durable. Same change applied to the wizard's model picker shortlist.
  2. **Telegram heartbeat overlap**: replaced `setInterval` with a recursive `setTimeout` pattern that awaits the inner work before scheduling the next tick. Long-running standing goals can no longer overlap with themselves. Adds a `heartbeatStopped` flag the SIGINT handler flips.
  3. **Telegram graceful shutdown**: `process.once("SIGINT" | "SIGTERM", ...)` calls `bot.stop(signal)` so Telegram's long-poll connection closes cleanly. Without this, Ctrl+C orphans the connection and the next start gets rejected with 409 Conflict for ~30 seconds.
  4. **Personal-agent heartbeat shutdown**: same SIGINT/SIGTERM pattern; sleep loop now polls every 500ms during the wait so Ctrl+C interrupts within half a second instead of waiting up to a full minute.
  5. **Personal-agent REPL Ctrl+C**: AbortError from readline is now caught and turned into a clean exit (`bye 👋`) instead of a crash with `[error] AbortError`.

## 0.1.4

### Patch Changes

- Pre-flight bug sweep before user testing:
  - **runner: conversation-state-bleed**: subsequent `autonomousRun` / `runOnce`
    calls were silently dropping the new `opts.goal` because the seed-only
    branch in `loadMessages` was never taken when prior messages were stored.
    The fix: always replace the leading system message with the current run's
    systemPrompt, append the new user goal, and continue. `runOnce` with
    `resumeFromState: false` now also skips saving back to KV (was polluting
    the REPL's conversation when the heartbeat fired).
  - **core: createLangchainTools / createVercelAITools return types**: switched
    from `unknown[]` / `Record<string, unknown>` to the precise
    `DynamicStructuredTool[]` / `Record<string, Tool>` types using
    `import type` at the top (stripped at build, no runtime peer-dep cost).
    Lets templates pass results directly to LangChain `createToolCallingAgent`
    without lossy casts.
  - **adapter tests**: cast the Vercel `tool.execute` ourselves rather than
    relying on the SDK's stricter typing, since we deliberately accept any
    zod schema shape.

## 0.1.3

### Patch Changes

- Fix: templates didn't load `.env` automatically — `npm start` would crash with `STELLAR_SECRET_KEY is required` even when the file was correctly written by the wizard. Adds `dotenv` as a dep to every template and `import "dotenv/config";` as the first line of every entry script.

## 0.1.2

### Patch Changes

- Bump to 0.1.2 + publish to `latest` tag (no more alpha-only). The CLI's default version pin is now `^0.1.1` instead of `^0.1.0-alpha.1` so npm resolves to the bug-fix version. Includes the fix for the static `@langchain/core` import that crashed personal-agent at startup.

  Also: removes explicit `version: 10` from `pnpm/action-setup` in CI (was conflicting with `packageManager: pnpm@10.33.4` in package.json).

## 0.1.1

### Patch Changes

- Fix: lazy-load `@langchain/core` and `ai` inside the adapter functions so consumers that don't use those frameworks don't need them installed. `createVercelAITools` and `createLangchainTools` are now async (return Promise). Templates updated to `await` them.

  Resolves: `Cannot find package '@langchain/core' imported from .../core/dist/index.js` when running personal-agent template (which doesn't depend on LangChain).

## 0.1.0

### Patch Changes

- 2c190bb: v0.3.1-alpha: personal-agent layer (`@stellar-agent-kit/personal` with soul.md / memory / standing goals), web-search plugin (Brave Search), umbrella `@stellar-agent-kit/all` meta-package, autonomous-runner `scheduledRun`, mainnet-hardened CLI wizard, two new templates (`personal-agent`, `telegram-bot`), Hermes integration docs.
