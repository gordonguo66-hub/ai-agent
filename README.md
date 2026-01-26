# AI Arena Trade

MVP web platform for AI-powered trading strategies with real market data.

## Quick Start

```bash
npm install
npm run dev
```

## If You See "Cannot find module" Errors

This is a webpack cache corruption issue. Run:

```bash
npm run fresh
```

Or manually:
```bash
rm -rf .next node_modules/.cache
npm run dev
```

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Auth + Postgres)
- Hyperliquid API (real market data)
- OpenAI-compatible LLM APIs

## Features

- **Virtual Trading**: Real Hyperliquid market data, simulated execution ($100k starting balance)
- **Live Trading**: Real Hyperliquid orders (requires exchange connection)
- **AI Strategies**: Connect any OpenAI-compatible provider (OpenAI, Anthropic, Google, xAI, DeepSeek, etc.)
- **Dynamic Model Selection**: Auto-loads all available models from each provider
- **Session Management**: Start/Stop/Pause trading sessions
- **Risk Controls**: Max position size, leverage limits, daily loss limits
- **Real-time Monitoring**: Decisions, orders, trades, equity curves

## Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CREDENTIALS_ENCRYPTION_KEY=your_32_byte_key_base64_or_hex
```

## Database Setup

Run these SQL files in Supabase SQL Editor (in order):

1. `supabase/schema.sql` - Base schema
2. `supabase/two_mode_trading.sql` - Trading tables
3. `supabase/ai_connections.sql` - AI provider connections

## Supported AI Providers

All base URLs are verified and working:

- **OpenAI**: `https://api.openai.com/v1`
- **Anthropic (Claude)**: `https://api.anthropic.com/v1`
- **Google (Gemini)**: `https://generativelanguage.googleapis.com/v1beta/openai`
- **xAI (Grok)**: `https://api.x.ai/v1`
- **DeepSeek**: `https://api.deepseek.com/v1`
- **OpenRouter**: `https://openrouter.ai/api/v1`
- **Together AI**: `https://api.together.xyz/v1`
- **Groq**: `https://api.groq.com/openai/v1`
- **Perplexity**: `https://api.perplexity.ai`
- **Fireworks**: `https://api.fireworks.ai/inference/v1`

## Routes

- `/` - Landing page
- `/auth` - Sign in/up
- `/dashboard` - Trading sessions
- `/settings/ai` - AI provider connections
- `/settings/exchange` - Hyperliquid exchange connection
- `/strategy/[id]` - Strategy details and session management
- `/arena` - Leaderboard (coming soon)
- `/community` - Community posts

## Known Issues

- If you see "Cannot find module" errors, run `npm run fresh` to clean cache
- AuthGuard is non-blocking - pages show immediately, auth checks in background
- Model fetching uses fallback known models if API doesn't respond

## Development

```bash
# Clean and restart
npm run fresh

# Build for production
npm run build

# Start production server
npm start
```
# Last updated: Mon 26 Jan 2026 14:58:11 GMT

