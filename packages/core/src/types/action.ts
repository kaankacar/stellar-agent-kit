import type { z } from "zod";
import type { StellarAgentKit } from "../agent";

export interface ActionExample {
  input: Record<string, any>;
  output: Record<string, any>;
  explanation: string;
}

export type Handler = (
  agent: StellarAgentKit,
  input: Record<string, any>,
) => Promise<Record<string, any>>;

export interface Action {
  name: string;
  similes: string[];
  description: string;
  examples: ActionExample[][];
  schema: z.ZodType<any>;
  handler: Handler;
}
