# @stellar-agent-kit/plugin-soroban

## 0.1.10

### Patch Changes

- Updated dependencies
  - @stellar-agent-kit/core@0.1.10

## 0.1.9

### Patch Changes

- @stellar-agent-kit/core@0.1.9

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
  - @stellar-agent-kit/core@0.1.8

## 0.1.7

### Patch Changes

- @stellar-agent-kit/core@0.1.7

## 0.1.6

### Patch Changes

- @stellar-agent-kit/core@0.1.6

## 0.1.5

### Patch Changes

- @stellar-agent-kit/core@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies
  - @stellar-agent-kit/core@0.1.4

## 0.1.3

### Patch Changes

- @stellar-agent-kit/core@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies
  - @stellar-agent-kit/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies
  - @stellar-agent-kit/core@0.1.1

## 0.1.0

### Patch Changes

- Updated dependencies [2c190bb]
  - @stellar-agent-kit/core@0.1.0
