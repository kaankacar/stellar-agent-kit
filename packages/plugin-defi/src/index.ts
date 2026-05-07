import type { Plugin } from "@stellar-agent-kit/core";
import {
  soroswapQuote,
  soroswapSwap,
  soroswapLiquidityAdd,
  soroswapLiquidityRemove,
} from "./soroswap/actions";
import { reflectorPrice, reflectorTwap, reflectorListFeeds } from "./reflector/actions";
import {
  blendSupply,
  blendBorrow,
  blendWithdraw,
  blendRepay,
  blendGetPosition,
} from "./blend/actions";

export const DefiPlugin: Plugin = {
  name: "stellar-defi",
  methods: {},
  actions: [
    soroswapQuote,
    soroswapSwap,
    soroswapLiquidityAdd,
    soroswapLiquidityRemove,
    reflectorPrice,
    reflectorTwap,
    reflectorListFeeds,
    blendSupply,
    blendBorrow,
    blendWithdraw,
    blendRepay,
    blendGetPosition,
  ],
  initialize() {},
};

export default DefiPlugin;
export { MAINNET_CONTRACTS, SOROSWAP_API_BASE } from "./constants";
export {
  soroswapQuote,
  soroswapSwap,
  soroswapLiquidityAdd,
  soroswapLiquidityRemove,
  reflectorPrice,
  reflectorTwap,
  reflectorListFeeds,
  blendSupply,
  blendBorrow,
  blendWithdraw,
  blendRepay,
  blendGetPosition,
};
export {
  getQuote,
  buildSwapXdr,
  buildAddLiquidityXdr,
  buildRemoveLiquidityXdr,
} from "./soroswap/api";
