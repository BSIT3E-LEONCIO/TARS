# TARS Web Console

Interstellar-inspired TARS interface built with React + Vite + TypeScript + Tailwind CSS.

## Features

- Cinematic cockpit UI inspired by Endurance ship consoles.
- Live AI chat via OpenAI-compatible Chat Completions API.
- Humor and Honesty controls that affect TARS behavior.
- Typewriter-like terminal feel with mission status indicators.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create your env file from template:

```bash
copy .env.example .env
```

3. Add your API key in .env.

4. Run the app:

```bash
npm run dev
```

## Environment Variables

Use these in your .env file:

- VITE_OPENROUTER_API_KEY=your_api_key_here
- VITE_LLM_API_BASE_URL=https://api.groq.com/openai/v1
- VITE_LLM_MODEL=llama-3.1-8b-instant

## Free API Options

Good free-start options (subject to provider quota/availability changes):

1. OpenRouter free models
2. Groq developer free tier
3. Together AI trial/free credits

This project defaults to an OpenAI-compatible endpoint so it is easy to switch providers:

- If your provider supports OpenAI chat format, set VITE_LLM_API_BASE_URL and VITE_LLM_MODEL accordingly.
- Keep the key in VITE_OPENROUTER_API_KEY (or rename in code if you prefer a generic variable).

## Notes

- Never commit your real .env file.
- If you hit quota limits, swap to another free model in VITE_LLM_MODEL.
