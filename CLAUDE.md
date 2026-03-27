# CLAUDE.md — Business Intelligence Research Tool

## Project Overview

A full-stack web app for a marketing/AI automation agency. Given a business URL or name+location, it scrapes their website, social media, ads, tech stack, and marketing funnel — then uses an LLM to generate a marketing opportunity analysis and a personalized Loom outreach script.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Database + Auth | Supabase (Postgres + Supabase Auth) |
| Headless Browser | `rebrowser-playwright` (CDP-patch stealth) |
| Browser Stealth | `playwright-extra` + `puppeteer-extra-plugin-stealth` |
| HTTP/Parsing | `axios` + `axios-retry` + `cheerio` |
| Rate Limiting | `bottleneck` (per-domain token buckets) |
| Job Queue | `p-queue` (concurrency=3) |
| AI/LLM | OpenRouter API → `google/gemini-flash-1.5` via `openai` SDK |
| UI | Tailwind CSS + shadcn/ui |
| CLI | `commander` + `chalk` + `ora` |
| Deployment | Vercel (Fluid Compute + `waitUntil` for long jobs) |

## Key Commands

```bash
# Development
npm run dev              # Start Next.js dev server

# CLI testing (test scrapers without the web UI)
npx ts-node src/cli/index.ts --url https://example.com
npx ts-node src/cli/index.ts --name "Joe's Roofing" --location "Dallas TX"
npx ts-node src/cli/index.ts --url https://example.com --output report.md

# Type checking
npm run type-check

# Build
npm run build
```

## Folder Structure

```
src/
├── app/                  # Next.js App Router (pages + API routes)
├── components/           # React UI components
├── lib/                  # Shared utilities (supabase, openrouter, browser-pool, rate-limiter)
├── scrapers/             # Modular scraper system
│   ├── types.ts          # ALL shared TypeScript interfaces — source of truth
│   ├── index.ts          # Orchestrator that runs all scrapers in parallel
│   ├── business-info/
│   ├── social-media/
│   ├── tech-detection/
│   ├── ads-intelligence/
│   ├── funnel-detection/
│   ├── seo-traffic/
│   └── ad-metrics/
├── ai/                   # OpenRouter prompts + AI modules
├── report/               # Report builder + markdown/JSON exporters
└── cli/                  # CLI entry point
supabase/migrations/      # SQL migration files
```

## Coding Conventions

- All TypeScript — no plain JS files
- Each scraper module has a single `index.ts` entry point that exports one main async function
- Every scraper function signature: `async function scrape*(url: string, options?: ScraperOptions): Promise<*Result>`
- Scraper functions must never throw — always return partial data with error fields populated
- Rate limiting is applied in `lib/rate-limiter.ts`, not inside individual scrapers
- All Playwright usage goes through `lib/browser-pool.ts` — never instantiate a browser directly in a scraper

## Environment Variables

```
OPENROUTER_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # Server-only, never expose to client
NEXT_PUBLIC_APP_URL=             # e.g. https://your-app.vercel.app
FACEBOOK_APP_ID=                 # Optional — enables Graph API for Facebook email/phone
FACEBOOK_APP_SECRET=             # Optional — paired with APP_ID for Graph API access
APIFY_API_TOKEN=                 # Optional — enables Apify Facebook Pages Scraper (no identity verification needed)
```

## Do's

- Always use `browser-pool.ts` to get Playwright browser instances (stealth is applied there)
- Always apply `bottleneck` rate limiting before any outbound request
- Save partial scraper results to Supabase as they complete (don't wait for all scrapers)
- Use `rebrowser-playwright` import, not plain `playwright`
- Truncate LLM input to <10,000 chars to control OpenRouter cost
- Handle scraper timeouts gracefully — 30s max per scraper, return partial data

## Don'ts

- Never instantiate Playwright `chromium.launch()` outside of `browser-pool.ts`
- Never skip rate limiting for any external site
- Never automate LinkedIn login — only scrape public pages
- Never commit `.env.local` or any API keys
- Never call OpenRouter with raw untruncated scraper output (token cost risk)
- Never use `any` type in TypeScript — use the interfaces in `scrapers/types.ts`
- Never add `console.log` in production code — use structured logging or remove

## Anti-Bot Rules

See `SCRAPING_RULES.md` for full per-platform anti-bot strategy.

Short version: every Playwright page gets stealth applied via `browser-pool.ts`, random 1-3s delays, realistic UA headers, and per-domain rate limits via `bottleneck`.

## Supabase Notes

- Browser client: `lib/supabase.ts`
- Server/API routes client: `lib/supabase-server.ts`
- RLS is enabled on all tables — always use the service role key for server-side writes
- Schema: `profiles`, `research_jobs`, `reports` — see `supabase/migrations/`

## OpenRouter Notes

- Model: `google/gemini-flash-1.5` — cheapest capable model (~$0.0002/report)
- Two calls per report: opportunity analysis + Loom script generation
- Client setup: `openai` SDK with `baseURL: 'https://openrouter.ai/api/v1'`
- Always set `HTTP-Referer` header in requests
