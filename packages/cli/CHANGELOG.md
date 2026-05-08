# create-stellar-agent

## 0.1.1

### Patch Changes

- Fix: lazy-load `@langchain/core` and `ai` inside the adapter functions so consumers that don't use those frameworks don't need them installed. `createVercelAITools` and `createLangchainTools` are now async (return Promise). Templates updated to `await` them.

  Resolves: `Cannot find package '@langchain/core' imported from .../core/dist/index.js` when running personal-agent template (which doesn't depend on LangChain).

## 0.1.0

### Patch Changes

- 2c190bb: v0.3.1-alpha: personal-agent layer (`@stellar-agent-kit/personal` with soul.md / memory / standing goals), web-search plugin (Brave Search), umbrella `@stellar-agent-kit/all` meta-package, autonomous-runner `scheduledRun`, mainnet-hardened CLI wizard, two new templates (`personal-agent`, `telegram-bot`), Hermes integration docs.
