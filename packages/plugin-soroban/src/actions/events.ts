import { z } from "zod";
import type { Action } from "@stellar-agent-kit/core";
import { fromScVal } from "../utils";

export const getEvents: Action = {
  name: "SOROBAN_GET_EVENTS",
  similes: ["fetch events", "contract events", "logs"],
  description:
    "Fetch Soroban contract events for a contract id over a ledger range. Topics are decoded into native JS values.",
  examples: [
    [
      {
        input: { contractIds: ["C..."], startLedger: 1000 },
        output: { events: [] },
        explanation: "Fetch all events for one contract",
      },
    ],
  ],
  schema: z.object({
    contractIds: z.array(z.string()).default([]),
    startLedger: z.number().int().positive(),
    limit: z.number().int().positive().max(10000).default(100),
  }),
  handler: async (agent, input) => {
    const resp = await agent.rpcServer.getEvents({
      startLedger: input.startLedger,
      filters: [
        {
          type: "contract",
          contractIds: input.contractIds,
          topics: [],
        },
      ],
      limit: input.limit,
    });
    return {
      events: (resp.events ?? []).map((ev) => ({
        ledger: ev.ledger,
        contractId: ev.contractId?.toString(),
        topics: ev.topic.map(fromScVal),
        value: fromScVal(ev.value),
        type: ev.type,
      })),
      latestLedger: resp.latestLedger,
    };
  },
};
