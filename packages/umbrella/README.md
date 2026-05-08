# stellar-agent-kit

The all-in-one entry point. Re-exports everything from the granular `@stellar-agent-kit/*` packages.

```bash
npm i @stellar-agent-kit/all
```

```ts
import {
  StellarAgentKit,
  KeypairWallet,
  StellarAssetPlugin,
  DefiPlugin,
  autonomousRun,
  TestnetSandbox,
  SpendCap,
} from "@stellar-agent-kit/all";
```

For tree-shaking, use the granular sub-paths:

```ts
import { StellarAgentKit } from "@stellar-agent-kit/all/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/all/plugins";
import { autonomousRun } from "@stellar-agent-kit/all/runner";
```

Or use the granular scoped packages directly — they install independently:

```bash
npm i @stellar-agent-kit/core @stellar-agent-kit/plugin-asset
```

See the main repo for full docs: https://github.com/stellar/stellar-agent-kit
