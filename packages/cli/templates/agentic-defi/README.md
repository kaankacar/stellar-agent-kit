# {{projectName}}

LangChain ReAct-style agent driving Soroswap + Blend + Reflector via the Stellar Agent Kit. Free OpenRouter models supported by default.

## Setup

```bash
cp .env.example .env
# Set STELLAR_SECRET_KEY + ONE of OPENAI_API_KEY / OPENROUTER_API_KEY
npm install
npm start
```

Or pass a goal:

```bash
npx tsx index.ts "Quote 10 XLM to USDC and tell me the rate"
```

## Free-tier mode

Set only `OPENROUTER_API_KEY`. The script auto-uses `nvidia/nemotron-3-super-120b-a12b:free`. No charges.
