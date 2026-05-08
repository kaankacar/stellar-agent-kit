# create-stellar-agent

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
