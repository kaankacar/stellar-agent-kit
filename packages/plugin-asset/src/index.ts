import type { Plugin } from "@stellar-agent-kit/core";
import { transfer } from "./actions/transfer";
import { pathPaymentStrictSend } from "./actions/pathPayment";
import { pathPaymentStrictReceive } from "./actions/pathPaymentReceive";
import { trustlineAdd, trustlineRemove } from "./actions/trustline";
import { balance } from "./actions/balance";
import { issue } from "./actions/issue";
import { setOptions } from "./actions/setOptions";
import { claimableBalanceCreate, claimableBalanceClaim } from "./actions/claimableBalance";
import { manageSellOffer, manageBuyOffer, cancelOffer } from "./actions/dexOffers";
import { getOrderbook } from "./actions/orderbook";
import { friendbotFund } from "./actions/friendbot";

export const StellarAssetPlugin: Plugin = {
  name: "stellar-asset",
  methods: {},
  actions: [
    transfer,
    pathPaymentStrictSend,
    trustlineAdd,
    trustlineRemove,
    balance,
    issue,
    setOptions,
    claimableBalanceCreate,
    claimableBalanceClaim,
    pathPaymentStrictReceive,
    manageSellOffer,
    manageBuyOffer,
    cancelOffer,
    getOrderbook,
    friendbotFund,
  ],
  initialize() {},
};

export default StellarAssetPlugin;
export {
  transfer,
  pathPaymentStrictSend,
  pathPaymentStrictReceive,
  trustlineAdd,
  trustlineRemove,
  balance,
  issue,
  setOptions,
  claimableBalanceCreate,
  claimableBalanceClaim,
  manageSellOffer,
  manageBuyOffer,
  cancelOffer,
  getOrderbook,
  friendbotFund,
};
