# ARCHITECTURE.md — System Design

## System Overview

```
User Input (URL or Name+Location)
         │
         ▼
┌─────────────────────────────────────────┐
│         Next.js Web UI (Vercel)         │
│  ResearchForm → JobStatusBar → Report   │
└──────────────┬──────────────────────────┘
               │ POST /api/research/start
               ▼
┌─────────────────────────────────────────┐
│      API Route + Orchestrator           │
│  Creates job row → returns jobId        │
│  Calls waitUntil(runOrchestrator())     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│                  Scraper Orchestrator                    │
│              (src/scrapers/index.ts)                     │
│                                                          │
│  p-queue (concurrency=3) runs all scrapers in parallel:  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ business-info│  │ social-media │  │tech-detection │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ads-intellig. │  │funnel-detect │  │  seo-traffic  │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│  ┌──────────────┐                                        │
│  │  ad-metrics  │  (runs after ads-intelligence)         │
│  └──────────────┘                                        │
│                                                          │
│  Each scraper saves partial result to Supabase           │
│  as it completes (enables live partial display)          │
└──────────────┬──────────────────────────────────────────┘
               │ All scrapers done
               ▼
┌─────────────────────────────────────────┐
│           AI Analysis Layer             │
│                                         │
│  1. opportunity-analyzer (OpenRouter)   │
│     Input: all scraper JSON             │
│     Output: OpportunityAnalysis JSON    │
│                                         │
│  2. loom-script-generator (OpenRouter)  │
│     Input: top opportunities + summary  │
│     Output: 150-225 word script text    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         Report Builder + Storage        │
│                                         │
│  report/builder.ts → final ReportData   │
│  Saved to Supabase reports table        │
│  Job status → completed                 │
└─────────────────────────────────────────┘
               │
               ▼
        Frontend polls GET /api/research/[jobId]
        every 3 seconds → on complete, navigates
        to /dashboard/[reportId]
```

## Data Flow

### Input Resolution
```
URL input         → Skip resolution, use directly
Name+Location     → url-resolver.ts
                    → Google search scrape → first organic result
                    → Filter out Yelp/BBB/directories
                    → Fallback: Bing search
                    → Output: resolved website URL
```

### Scraper Data Flow
```
Each scraper:
  Input:  resolved URL (string)
  Output: typed result object (see scrapers/types.ts)

  On success: saves result to reports table JSONB column
  On error:   returns { error: string, partial: true } — never throws
  On timeout: 30s max, returns whatever was collected
```

### Job Status Flow
```
queued → running → completed
                 → failed
```

Progress checkpoints:
- 5%: URL resolved
- 10-20%: business-info done
- 20-35%: social-media done
- 35-45%: tech-detection done
- 45-65%: ads-intelligence + ad-metrics done
- 65-75%: funnel-detection done
- 75-82%: seo-traffic done
- 82-92%: AI opportunity analysis done
- 92-98%: Loom script generated
- 100%: complete

## Component Relationships

```
src/lib/browser-pool.ts
  └─ used by: all playwright-based scrapers
              (business-info, social-media, ads-intelligence,
               funnel-detection, builtwith-scraper)

src/lib/rate-limiter.ts
  └─ used by: all scrapers (both axios and playwright)

src/scrapers/types.ts
  └─ used by: every scraper, AI modules, report builder,
              API routes, frontend components

src/scrapers/index.ts (orchestrator)
  └─ imports: all 7 scraper modules
  └─ used by: API route (start/route.ts) and CLI (cli/index.ts)

src/lib/openrouter.ts
  └─ used by: ai/opportunity-analyzer.ts, ai/loom-script-generator.ts

src/report/builder.ts
  └─ imports: all scraper result types + AI result types
  └─ used by: orchestrator (final assembly step)
```

## Key Architectural Decisions

### Why `rebrowser-playwright` over plain `playwright`?
Standard Playwright leaks bot signals through the CDP `Runtime.enable` method — the primary detection vector used by Cloudflare, Distil, and DataDome. `rebrowser-playwright` patches this at the package level. Combined with `playwright-extra` stealth plugin (which removes `navigator.webdriver` and 30+ other fingerprint signals), this gives near-human browser fingerprints.

### Why JSONB columns per scraper module?
Scraper output schemas evolve as target sites change. Using one JSONB column per module means field additions/changes don't require database migrations. The TypeScript interfaces in `scrapers/types.ts` serve as the schema contract. Only query-critical fields (business_name, website_url, user_id) are typed columns.

### Why polling instead of WebSockets for job status?
The job takes 2-5 minutes. Polling every 3 seconds is simpler (no persistent connection) and works identically on Vercel serverless and local development. The tradeoff (slight status delay) is acceptable for this use case.

### Why Vercel `waitUntil` instead of a separate worker?
Keeps the architecture to a single service. Vercel Fluid Compute's `waitUntil` allows background processing up to 5 minutes after a response is returned — enough for the full scraping pipeline. A separate worker would add operational complexity and cost.

### Why OpenRouter instead of direct Anthropic/OpenAI?
OpenRouter provides model routing (can swap to cheaper/better models easily), unified billing, and access to `google/gemini-flash-1.5` which is 20x cheaper than GPT-4o mini with comparable quality for structured analysis tasks.

## Database Design

Three tables:
- `profiles` — extends Supabase auth.users with agency metadata
- `research_jobs` — tracks job lifecycle (queued/running/completed/failed) + progress
- `reports` — stores all scraper outputs as JSONB + AI-generated content

RLS (Row Level Security) is enabled on all tables. Users can only access their own data. API routes use the service role key to bypass RLS for server-side writes during orchestration.

## Vercel Deployment Notes

- Long-running scraper jobs use `waitUntil` from `@vercel/functions`
- Max execution: ~5 minutes on Fluid Compute (Vercel Pro required)
- API routes in `src/app/api/` are serverless functions
- Static assets and UI components are edge-cached
- Environment variables set in Vercel dashboard, not committed
