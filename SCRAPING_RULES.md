# SCRAPING_RULES.md — Scraping Rules & Anti-Bot Strategy

## Core Principles

1. **Never instantiate Playwright outside `browser-pool.ts`** — stealth is applied once there
2. **Always rate-limit via `bottleneck`** — use `getDomainLimiter(domain)` before every request
3. **Never attempt login automation** on any platform (LinkedIn, Meta, TikTok, etc.)
4. **Graceful degradation** — if a scraper is blocked, return partial data with `blocked: true`, do not retry indefinitely
5. **30-second timeout** on every scraper function

---

## Rate Limits by Domain

| Domain | Min Delay | Max Concurrent | Notes |
|---|---|---|---|
| Target business site | 2s | 1 | Single visit, no crawl loops |
| google.com | 10s | 1 | High block risk — use Bing fallback |
| bing.com | 5s | 1 | URL resolver fallback |
| facebook.com/ads | 3s | 1 | Use scroll + wait between loads |
| library.tiktok.com | 5s | 1 | Very aggressive fingerprinting |
| adstransparency.google.com | 4s | 1 | |
| instagram.com | 3s | 1 | Try JSON endpoint first |
| linkedin.com | 5s | 1 | Public pages only |
| twitter.com / x.com | 3s | 1 | |
| youtube.com | 2s | 2 | Low block risk |
| builtwith.com | 5s | 1 | Free tier, be conservative |
| Any other domain | 2s | 3 | Default |

---

## Anti-Bot Configuration (browser-pool.ts)

All Playwright instances must be configured with:

```typescript
// Required packages
import { chromium } from 'rebrowser-playwright';       // patches CDP Runtime.enable
import { chromium as chromiumExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
chromiumExtra.use(StealthPlugin());

// Browser launch options
const browser = await chromium.launch({
  headless: true,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
});

// Context options (per-context)
const context = await browser.newContext({
  userAgent: getRandomUA(),            // rotate from list below
  viewport: { width: 1280, height: 800 },
  locale: 'en-US',
  timezoneId: 'America/New_York',
  extraHTTPHeaders: {
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
});
```

User-Agent rotation pool (update these periodically):
```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36
Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0
Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0
Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0
```

Human behavior simulation (apply on pages with anti-bot protection):
```typescript
// Random delay before interactions
await page.waitForTimeout(Math.random() * 2000 + 1000);  // 1-3s

// Simulate mouse movement before clicks
await page.mouse.move(
  Math.random() * 1000 + 100,
  Math.random() * 600 + 100
);
```

---

## Per-Platform Scraping Rules

### Target Business Website
- Use `rebrowser-playwright` for full page render (captures JS-rendered content)
- Single page visit per URL (no aggressive crawling of homepage)
- Funnel detection: BFS crawl of up to 10 internal pages, prioritize booking/offer URLs
- Wait for `networkidle` before extracting
- **Blocked signals:** If status 403/429 or CAPTCHA detected, return `{ blocked: true }` immediately

### Google Search (URL Resolver + SEO)
- Use `axios` + `cheerio` (no browser) — Google blocks bots less aggressively on basic requests
- Fallback: `Bing.com/search` if Google returns 429 or shows CAPTCHA
- Extract result URLs, not full page renders
- Max 2 searches per research job
- Query patterns:
  - URL resolver: `"{business name}" "{location}" official website`
  - Indexed pages: `site:{domain}`
  - Blog: `site:{domain} inurl:blog`

### Meta Ad Library
- URL: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q={name}`
- Use `rebrowser-playwright` — this is a Next.js SPA
- **Primary strategy:** Extract `document.getElementById('__NEXT_DATA__').textContent` — Meta's Ad Library stores structured ad data here. This is more stable than DOM scraping.
- If `__NEXT_DATA__` doesn't contain ads, fall back to DOM scraping with text-content matching
- Scroll down to load up to 20 ads before extracting
- For ad metrics: click each ad's "See ad details" link to get impressions range label
- **Breaking change warning:** Meta's Ad Library DOM changes frequently. Add a `// Last verified: [date]` comment and check every 2 months.

### TikTok Ads Library
- URL: `https://library.tiktok.com/ads`
- Use `rebrowser-playwright` + stealth plugin (TikTok uses fingerprinting heavily)
- Search by advertiser name
- Public metrics available: impressions range, reach range, video views category
- 5s minimum between page interactions

### Google Ads Transparency Center
- URL: `https://adstransparency.google.com/?region=anywhere`
- Use `rebrowser-playwright`
- Search by advertiser name or domain
- Shows: ad format, first/last seen dates, creative count (no impressions data)

### Instagram
- **Step 1 (fast):** Try `https://www.instagram.com/{username}/?__a=1&__d=dis`
  - Returns JSON with follower count, last post timestamp
  - If returns login redirect → proceed to Step 2
- **Step 2 (fallback):** `rebrowser-playwright` → navigate to profile page → extract follower count from rendered text
  - If blocked → return `{ found: true, followerCount: null, blocked: true }`
- Username is extracted from the social link found on the homepage

### Facebook Page
- Use `rebrowser-playwright` (FB requires JS)
- Navigate to the Facebook page URL found on business homepage
- Extract: follower count (text match "X followers" or "X likes"), last post date from feed
- Do not attempt login — public data only

### TikTok Profile
- Use `rebrowser-playwright` + `playwright-extra` stealth
- Navigate to `tiktok.com/@{username}`
- Extract: follower count from stats section, video count
- 5s minimum wait after navigation before extraction

### YouTube
- Use `axios` + `cheerio` (public channel pages don't require JS for basic data)
- Navigate to `youtube.com/@{handle}` or `youtube.com/c/{name}`
- Subscriber count in `<yt-formatted-string>` tag or meta `og:description`
- Last upload: check Videos tab URL `?view=0&sort=dd` for most recent

### LinkedIn
- **IMPORTANT: Never automate LinkedIn login**
- Google search for `site:linkedin.com/company "{business name}"` → extract URL
- Optionally navigate to the public company page to get follower count (if visible without login)
- If LinkedIn shows a login wall, return URL only with `requiresLogin: true`

### Twitter/X
- Check existence: `https://publish.twitter.com/oembed?url=https://twitter.com/{username}`
- If oembed returns data → account exists
- For follower count: `rebrowser-playwright` → navigate to `x.com/{username}` → extract from profile stats

### BuiltWith.com
- Use `axios` + `cheerio` for the free lookup: `https://builtwith.com/{domain}`
- Extract technology names from the page sections
- If content appears JS-rendered (empty results): fall back to `rebrowser-playwright`
- Rate limit: 1 req / 5s
- Free tier shows a subset of technologies — this is expected behavior

---

## Data Schemas

All result types are defined in `src/scrapers/types.ts`. Key interfaces:

### BusinessInfoResult
Phone, email, hasContactForm, hasBookingSystem, bookingSystemType, googleMapsUrl, googleRating, reviewCount, services[], location, pricing

### SocialPlatformResult
platform, profileUrl, followerCount, postingFrequency, lastPostDate, engagementSignal, found, blocked

### TechStackResult
hasMetaPixel, hasGTM, hasGoogleAnalytics, cms, crm, emailMarketing, chatWidget, bookingTool, otherTools[], rawBuiltWith[]

### AdResult
adId, platform, isActive, startedDate, adText, imageUrl, landingPageUrl, messagingTheme, durationDays, estimatedReach, platformLabel

### AdMetrics
adId, impressionsRange, reachRange, platforms[], ageGenderDistribution, longevityDays, isProvenAd (>= 60 days), engagementRate

### FunnelResult
hasLandingPages, landingPageUrls[], hasLeadMagnet, hasBookingFunnel, hasEmailCapture, hasCheckout, hasUpsell, hasChatbot, hasRetargeting, ctaStrength, funnelScore (0-10)

### SeoTrafficResult
indexedPageCount, hasBlog, blogPostCount, contentFrequency, topKeywords[], metaTitle, metaDescription, hasPaidSearchPresence, organicPresenceStrength

---

## Handling Blocks

When a scraper gets blocked (CAPTCHA, 403, login wall):

```typescript
// Return this shape — never throw
return {
  ...defaultEmptyResult,
  blocked: true,
  blockReason: 'CAPTCHA detected',
  partial: true,
};
```

The orchestrator continues with other scrapers and the final report marks the blocked section as "Could not retrieve data."

Do NOT implement automatic retry loops on blocked requests — this wastes time and increases IP ban risk. Log the block and move on.
