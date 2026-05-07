import type { Plugin } from "@stellar-agent-kit/core";
import {
  agentRemember,
  agentRecall,
  agentReadSoul,
  agentProposeSoulEdit,
  agentAddStandingGoal,
  agentListStandingGoals,
  agentRemoveStandingGoal,
  attachPersonal,
} from "./actions";

export const PersonalPlugin: Plugin = {
  name: "stellar-personal",
  methods: {},
  actions: [
    agentRemember,
    agentRecall,
    agentReadSoul,
    agentProposeSoulEdit,
    agentAddStandingGoal,
    agentListStandingGoals,
    agentRemoveStandingGoal,
  ],
  initialize() {},
};

export default PersonalPlugin;
export {
  agentRemember,
  agentRecall,
  agentReadSoul,
  agentProposeSoulEdit,
  agentAddStandingGoal,
  agentListStandingGoals,
  agentRemoveStandingGoal,
  attachPersonal,
};
export { SoulFile, DEFAULT_SOUL_TEMPLATE } from "./soulFile";
export { MemoryStore, type MemoryEntry } from "./memoryStore";
export { StandingGoals, type StandingGoal } from "./standingGoals";
