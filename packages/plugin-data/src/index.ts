import type { Plugin } from "@stellar-agent-kit/core";
import {
  stellarExpertAccount,
  stellarExpertAsset,
  rpcGetLatestLedger,
  horizonTxHistory,
} from "./actions";
import { coinGeckoTokenPrice, coinGeckoTrending, coinGeckoTokenInfo } from "./coingecko";

export const DataPlugin: Plugin = {
  name: "stellar-data",
  methods: {},
  actions: [
    stellarExpertAccount,
    stellarExpertAsset,
    rpcGetLatestLedger,
    horizonTxHistory,
    coinGeckoTokenPrice,
    coinGeckoTrending,
    coinGeckoTokenInfo,
  ],
  initialize() {},
};

export default DataPlugin;
export {
  stellarExpertAccount,
  stellarExpertAsset,
  rpcGetLatestLedger,
  horizonTxHistory,
  coinGeckoTokenPrice,
  coinGeckoTrending,
  coinGeckoTokenInfo,
};
