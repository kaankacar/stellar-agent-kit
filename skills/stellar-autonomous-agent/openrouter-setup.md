# Free / cheap LLM setup for autonomous Stellar agents

The runner is `LanguageModelV1`-shaped (Vercel AI SDK v4) — anything that satisfies that interface works. Below are tested combinations.

## NVIDIA Nemotron 3 Super on OpenRouter (recommended free option)

- 120B params, 262K context window, supports tool calling
- $0/token through OpenRouter's free tier
- Strong on tool-calling benchmarks

```bash
npm install @openrouter/ai-sdk-provider
```

```ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const llm = openrouter("nvidia/nemotron-3-super-120b-a12b:free");
```

Sign up at `https://openrouter.ai/keys` for a free key.

## Groq Llama 3.1 8B (fastest)

- 14,400 requests/day free
- 8B params, fast tool calling, lower quality but cheap to run
- Good for high-frequency cron agents

```bash
npm install @ai-sdk/groq
```

```ts
import { createGroq } from "@ai-sdk/groq";
const groq = createGroq({ apiKey: process.env.GROQ_API_KEY! });
const llm = groq("llama-3.1-8b-instant");
```

## OpenAI gpt-4o-mini (paid, but cheap)

- Most reliable tool calling
- ~$0.15 per 1M input tokens

```bash
npm install @ai-sdk/openai
```

```ts
import { openai } from "@ai-sdk/openai";
const llm = openai("gpt-4o-mini");
```

## Anthropic Claude Haiku 4.5 (paid)

- Strong reasoning, good tool calling

```bash
npm install @ai-sdk/anthropic
```

```ts
import { anthropic } from "@ai-sdk/anthropic";
const llm = anthropic("claude-haiku-4-5-20251001");
```

## Local models via Ollama

For fully air-gapped setups, run an open model locally:

```bash
ollama pull qwen2.5-coder:7b
```

```ts
import { createOpenAI } from "@ai-sdk/openai";
const local = createOpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
});
const llm = local("qwen2.5-coder:7b");
```

Tool-calling reliability varies by model. Llama 3.1 and Qwen2.5-Coder work; smaller / older models may not.

## Tradeoffs

| Provider | Cost | Reliability | Latency | Notes |
| --- | --- | --- | --- | --- |
| OpenRouter Nemotron free | $0 | Good | High | Best free option |
| Groq Llama 3.1 8B | $0 (capped) | Medium | Very low | Fast cron loops |
| OpenAI gpt-4o-mini | Cheap | High | Medium | Production default |
| Claude Haiku 4.5 | Cheap | High | Medium | Best reasoning per $ |
| Ollama (local) | $0 | Variable | Variable | Air-gapped only |

For a daily-runtime cron agent on testnet, Nemotron free is fine. For production on mainnet, consider gpt-4o-mini or Haiku for higher reliability — the $0.001/run is negligible compared to a wrong tool call.
