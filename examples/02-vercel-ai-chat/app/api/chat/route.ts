import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createVercelAITools } from "@stellar-agent-kit/core";
import { getAgent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: Parameters<typeof streamText>[0]["messages"] };
  const agent = getAgent();
  const tools = createVercelAITools(agent, agent.actions);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: [
      "You are a Stellar/Soroban operator agent.",
      `The agent's wallet is ${agent.wallet.publicKey}.`,
      "Use the provided tools to query and act on Stellar. Always describe what you're about to do before doing it.",
      "When showing transaction hashes or addresses, include both full and abbreviated forms.",
    ].join(" "),
    messages,
    tools,
    maxSteps: 6,
  });
  return result.toDataStreamResponse();
}
