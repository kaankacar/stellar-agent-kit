import type { Plugin } from "@stellar-agent-kit/core";
import {
  escrowCreateSingleRelease,
  escrowCreateMultiRelease,
  escrowGet,
  escrowFund,
  escrowUpdateMilestone,
  escrowApprove,
  escrowRelease,
  escrowDispute,
} from "./actions";

export const TrustlessWorkPlugin: Plugin = {
  name: "trustless-work",
  methods: {},
  actions: [
    escrowCreateSingleRelease,
    escrowCreateMultiRelease,
    escrowGet,
    escrowFund,
    escrowUpdateMilestone,
    escrowApprove,
    escrowRelease,
    escrowDispute,
  ],
  initialize() {},
};

export default TrustlessWorkPlugin;
export {
  escrowCreateSingleRelease,
  escrowCreateMultiRelease,
  escrowGet,
  escrowFund,
  escrowUpdateMilestone,
  escrowApprove,
  escrowRelease,
  escrowDispute,
};
export { TrustlessWorkClient } from "./client";
export {
  createTrustlessWorkWebhookHandler,
  expressTrustlessWorkWebhook,
  nextTrustlessWorkWebhook,
  type TrustlessWorkEvent,
  type TrustlessWorkWebhookOptions,
  type TrustlessWorkWebhookResult,
  type RawTrustlessWorkHandler,
} from "./webhooks";
