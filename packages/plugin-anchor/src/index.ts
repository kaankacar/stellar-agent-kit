import type { Plugin } from "@stellar-agent-kit/core";
import {
  anchorCreateCustomer,
  anchorGetKycUrl,
  anchorGetQuote,
  anchorCreateOnRamp,
  anchorGetOnRampTx,
  anchorCreateOffRamp,
  anchorGetOffRampTx,
  anchorSimulateFiatReceived,
} from "./actions";

export const AnchorPlugin: Plugin = {
  name: "stellar-anchor",
  methods: {},
  actions: [
    anchorCreateCustomer,
    anchorGetKycUrl,
    anchorGetQuote,
    anchorCreateOnRamp,
    anchorGetOnRampTx,
    anchorCreateOffRamp,
    anchorGetOffRampTx,
    anchorSimulateFiatReceived,
  ],
  initialize() {},
};

export default AnchorPlugin;
export {
  anchorCreateCustomer,
  anchorGetKycUrl,
  anchorGetQuote,
  anchorCreateOnRamp,
  anchorGetOnRampTx,
  anchorCreateOffRamp,
  anchorGetOffRampTx,
  anchorSimulateFiatReceived,
};
export { EtherfuseClient, type EtherfuseConfig, type AnchorNetwork } from "./etherfuse/client";
export { AlfredPayClient, type AlfredPayConfig } from "./alfredpay/client";
export { BlindPayClient, type BlindPayConfig, type BlindPayNetwork } from "./blindpay/client";
export {
  createAnchorWebhookHandler,
  expressAnchorWebhook,
  nextAnchorWebhook,
  honoAnchorWebhook,
  type AnchorEvent,
  type AnchorProvider,
  type AnchorWebhookHandlerOptions,
  type WebhookResult,
  type RawWebhookHandler,
  type VerifySignatureOptions,
} from "./webhooks";
export type * from "./types";
