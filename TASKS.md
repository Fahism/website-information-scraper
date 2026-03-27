# TASKS.md — Implementation Phases & Work Items

## Current Status: Phase 0 — MD Files ✅

---

## Phase 0 — Project MD Files ✅
- [x] CLAUDE.md
- [x] ARCHITECTURE.md
- [x] CONVENTIONS.md
- [x] TASKS.md
- [x] SCRAPING_RULES.md

---

## Phase 1 — Foundation + Scaffolding
- [ ] Initialize Next.js 14 project with TypeScript (`create-next-app`)
- [ ] Install all core packages (playwright, axios, cheerio, bottleneck, p-queue, commander, chalk, ora, openai, @supabase/supabase-js, @supabase/ssr, tailwindcss, shadcn/ui)
- [ ] Set up `tsconfig.json` with `@/` path alias
- [ ] Create `.env.example` with all required variable names
- [ ] Define `src/scrapers/types.ts` — all TypeScript interfaces (source of truth)
- [ ] Create Supabase project (via MCP)
- [ ] Run migration `001_initial_schema.sql` (via Supabase MCP)
- [ ] Run migration `002_rls_policies.sql`
- [ ] Run migration `003_indexes.sql`
- [ ] Build `src/lib/supabase.ts` (browser client)
- [ ] Build `src/lib/supabase-server.ts` (server client)
- [ ] Build `src/lib/browser-pool.ts` (rebrowser-playwright + stealth)
- [ ] Build `src/lib/rate-limiter.ts` (bottleneck per-domain)
- [ ] Set up auth pages (`/auth/login`, `/auth/callback`)

---

## Phase 2 — Core Scrapers
- [ ] Build `src/lib/url-resolver.ts` (name+location → URL via Google/Bing)
- [ ] Build `src/scrapers/business-info/index.ts` (homepage scrape, contact, booking, maps)
- [ ] Build `src/scrapers/business-info/contact-extractor.ts` (phone, email regex)
- [ ] Build `src/scrapers/tech-detection/html-scanner.ts` (20+ tool regex patterns)
- [ ] Build `src/scrapers/tech-detection/builtwith-scraper.ts` (builtwith.com free lookup)
- [ ] Build `src/scrapers/tech-detection/index.ts`
- [ ] Build `src/scrapers/index.ts` (orchestrator skeleton with p-queue)
- [ ] Build `src/cli/index.ts` (commander CLI for local testing)
- [ ] Build `src/cli/cli-reporter.ts` (terminal output formatter)
- [ ] Test: run CLI against 5 real business URLs, verify output

---

## Phase 3 — Social + Ads Scrapers
- [ ] Build `src/scrapers/social-media/index.ts` (homepage link scanner)
- [ ] Build `src/scrapers/social-media/facebook.ts`
- [ ] Build `src/scrapers/social-media/instagram.ts` (JSON endpoint + Playwright fallback)
- [ ] Build `src/scrapers/social-media/tiktok.ts` (playwright-stealth)
- [ ] Build `src/scrapers/social-media/youtube.ts` (axios + cheerio)
- [ ] Build `src/scrapers/social-media/linkedin.ts` (URL only, no login)
- [ ] Build `src/scrapers/social-media/twitter.ts`
- [ ] Build `src/scrapers/ads-intelligence/meta-ad-library.ts` (__NEXT_DATA__ extraction)
- [ ] Build `src/scrapers/ads-intelligence/tiktok-ads.ts`
- [ ] Build `src/scrapers/ads-intelligence/google-ads.ts`
- [ ] Build `src/scrapers/ads-intelligence/index.ts`
- [ ] Build `src/scrapers/ad-metrics/public-signals.ts`
- [ ] Build `src/scrapers/ad-metrics/index.ts`
- [ ] Build `src/scrapers/funnel-detection/funnel-patterns.ts`
- [ ] Build `src/scrapers/funnel-detection/page-crawler.ts` (BFS, 10 pages)
- [ ] Build `src/scrapers/funnel-detection/index.ts`
- [ ] Build `src/scrapers/seo-traffic/google-search.ts`
- [ ] Build `src/scrapers/seo-traffic/keyword-extractor.ts`
- [ ] Build `src/scrapers/seo-traffic/index.ts`
- [ ] Test: full CLI pipeline end-to-end with all scrapers

---

## Phase 4 — AI + Report Generation
- [ ] Build `src/lib/openrouter.ts` (openai SDK → OpenRouter)
- [ ] Build `src/ai/prompts.ts` (system + user prompt templates)
- [ ] Build `src/ai/opportunity-analyzer.ts`
- [ ] Build `src/ai/loom-script-generator.ts`
- [ ] Build `src/report/builder.ts` (assemble ReportData)
- [ ] Build `src/report/markdown-exporter.ts`
- [ ] Build `src/report/json-exporter.ts`
- [ ] Iterate prompts on real scraper data from 3 businesses
- [ ] Test: CLI generates complete report with AI sections

---

## Phase 5 — API Routes + Job System
- [ ] Build `POST /api/research/start` (create job, fire waitUntil orchestrator)
- [ ] Build `GET /api/research/[jobId]` (poll job status)
- [ ] Build `GET /api/reports` (list user's reports)
- [ ] Build `GET /api/reports/[reportId]` (get single report)
- [ ] Build `GET /api/export/[reportId]?format=json|markdown`
- [ ] Connect orchestrator to API route (partial saves to Supabase as scrapers complete)
- [ ] Test: POST start → poll until complete → fetch report

---

## Phase 6 — Frontend UI
- [ ] Build `src/app/page.tsx` (landing page with input form)
- [ ] Build `src/components/ResearchForm.tsx` (URL + name/location toggle)
- [ ] Build `src/components/JobStatusBar.tsx` (polling progress bar)
- [ ] Build `src/app/dashboard/page.tsx` (report history list)
- [ ] Build `src/app/dashboard/[reportId]/page.tsx` (report viewer)
- [ ] Build `src/components/ReportViewer.tsx`
- [ ] Build `src/components/SocialMediaCard.tsx`
- [ ] Build `src/components/TechStackBadges.tsx`
- [ ] Build `src/components/AdsIntelligencePanel.tsx`
- [ ] Build `src/components/OpportunityList.tsx`
- [ ] Build `src/components/LoomScriptPanel.tsx` (copy-to-clipboard)
- [ ] Add JSON + Markdown export buttons to report view

---

## Phase 7 — Hardening
- [ ] Add `axios-retry` with exponential backoff to all HTTP calls
- [ ] Add 30s timeout to every scraper (graceful partial return)
- [ ] Add UA rotation (10 realistic Chrome UAs in browser-pool.ts)
- [ ] Add React error boundaries to ReportViewer
- [ ] Load test: 5 concurrent research jobs
- [ ] Verify stealth: test rebrowser-playwright against bot detection sites
- [ ] Deploy to Vercel, test end-to-end in production

---

## Backlog (Post-Launch)
- [ ] Email notification when report is ready
- [ ] Report sharing (generate a public link)
- [ ] Bulk research (CSV upload of multiple URLs)
- [ ] Re-run research on existing report (refresh data)
- [ ] Report comparison view (side-by-side two businesses)
- [ ] Webhook integration for CRM tools
