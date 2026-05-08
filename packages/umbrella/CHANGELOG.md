# @stellar-agent-kit/all

## 0.1.3

### Patch Changes

- @stellar-agent-kit/adapter-mcp@0.1.3
- @stellar-agent-kit/core@0.1.3
- @stellar-agent-kit/plugin-anchor@0.1.3
- @stellar-agent-kit/plugin-asset@0.1.3
- @stellar-agent-kit/plugin-bridge@0.1.3
- @stellar-agent-kit/plugin-data@0.1.3
- @stellar-agent-kit/plugin-defi@0.1.3
- @stellar-agent-kit/plugin-defindex@0.1.3
- @stellar-agent-kit/plugin-domain@0.1.3
- @stellar-agent-kit/plugin-nft@0.1.3
- @stellar-agent-kit/plugin-payments@0.1.3
- @stellar-agent-kit/plugin-smart-wallet@0.1.3
- @stellar-agent-kit/plugin-soroban@0.1.3
- @stellar-agent-kit/plugin-trustless-work@0.1.3
- @stellar-agent-kit/runner@0.1.3

## 0.1.2

### Patch Changes

- Bump to 0.1.2 + publish to `latest` tag (no more alpha-only). The CLI's default version pin is now `^0.1.1` instead of `^0.1.0-alpha.1` so npm resolves to the bug-fix version. Includes the fix for the static `@langchain/core` import that crashed personal-agent at startup.

  Also: removes explicit `version: 10` from `pnpm/action-setup` in CI (was conflicting with `packageManager: pnpm@10.33.4` in package.json).

- Updated dependencies
  - @stellar-agent-kit/core@0.1.2
  - @stellar-agent-kit/adapter-mcp@0.1.2
  - @stellar-agent-kit/plugin-anchor@0.1.2
  - @stellar-agent-kit/plugin-asset@0.1.2
  - @stellar-agent-kit/plugin-bridge@0.1.2
  - @stellar-agent-kit/plugin-data@0.1.2
  - @stellar-agent-kit/plugin-defi@0.1.2
  - @stellar-agent-kit/plugin-defindex@0.1.2
  - @stellar-agent-kit/plugin-domain@0.1.2
  - @stellar-agent-kit/plugin-nft@0.1.2
  - @stellar-agent-kit/plugin-payments@0.1.2
  - @stellar-agent-kit/plugin-smart-wallet@0.1.2
  - @stellar-agent-kit/plugin-soroban@0.1.2
  - @stellar-agent-kit/plugin-trustless-work@0.1.2
  - @stellar-agent-kit/runner@0.1.2

## 0.1.1

### Patch Changes

- Fix: lazy-load `@langchain/core` and `ai` inside the adapter functions so consumers that don't use those frameworks don't need them installed. `createVercelAITools` and `createLangchainTools` are now async (return Promise). Templates updated to `await` them.

  Resolves: `Cannot find package '@langchain/core' imported from .../core/dist/index.js` when running personal-agent template (which doesn't depend on LangChain).

- Updated dependencies
  - @stellar-agent-kit/core@0.1.1
  - @stellar-agent-kit/adapter-mcp@0.1.1
  - @stellar-agent-kit/plugin-anchor@0.1.1
  - @stellar-agent-kit/plugin-asset@0.1.1
  - @stellar-agent-kit/plugin-bridge@0.1.1
  - @stellar-agent-kit/plugin-data@0.1.1
  - @stellar-agent-kit/plugin-defi@0.1.1
  - @stellar-agent-kit/plugin-defindex@0.1.1
  - @stellar-agent-kit/plugin-domain@0.1.1
  - @stellar-agent-kit/plugin-nft@0.1.1
  - @stellar-agent-kit/plugin-payments@0.1.1
  - @stellar-agent-kit/plugin-smart-wallet@0.1.1
  - @stellar-agent-kit/plugin-soroban@0.1.1
  - @stellar-agent-kit/plugin-trustless-work@0.1.1
  - @stellar-agent-kit/runner@0.1.1

## 0.1.0

### Patch Changes

- 2c190bb: v0.3.1-alpha: personal-agent layer (`@stellar-agent-kit/personal` with soul.md / memory / standing goals), web-search plugin (Brave Search), umbrella `@stellar-agent-kit/all` meta-package, autonomous-runner `scheduledRun`, mainnet-hardened CLI wizard, two new templates (`personal-agent`, `telegram-bot`), Hermes integration docs.
- Updated dependencies [2c190bb]
  - @stellar-agent-kit/core@0.1.0
  - @stellar-agent-kit/adapter-mcp@0.1.0
  - @stellar-agent-kit/plugin-anchor@0.1.0
  - @stellar-agent-kit/plugin-asset@0.1.0
  - @stellar-agent-kit/plugin-bridge@0.1.0
  - @stellar-agent-kit/plugin-data@0.1.0
  - @stellar-agent-kit/plugin-defi@0.1.0
  - @stellar-agent-kit/plugin-defindex@0.1.0
  - @stellar-agent-kit/plugin-domain@0.1.0
  - @stellar-agent-kit/plugin-nft@0.1.0
  - @stellar-agent-kit/plugin-payments@0.1.0
  - @stellar-agent-kit/plugin-smart-wallet@0.1.0
  - @stellar-agent-kit/plugin-soroban@0.1.0
  - @stellar-agent-kit/plugin-trustless-work@0.1.0
  - @stellar-agent-kit/runner@0.1.0
