import axios from 'axios';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import type { AdCreative, ScraperOptions } from '@/scrapers/types';

interface RawMetaAd {
  adId: string;
  text: string | null;
  imageUrl: string | null;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
}

function parseDateStr(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch {}
  return null;
}

function unixToDateStr(ts: number | null | undefined): string | null {
  if (!ts || typeof ts !== 'number') return null;
  try {
    return new Date(ts * 1000).toISOString().split('T')[0];
  } catch {
    return null;
  }
}

// ─── Primary: Apify Facebook Ads Scraper ─────────────────────────────────────
// Works from any IP including Render's datacenter — Apify uses residential proxies.
// Uses the user's existing APIFY_API_TOKEN (free $5/month covers ~33 research jobs).

async function scrapeMetaAdsViaApify(
  businessName: string,
  country: string
): Promise<AdCreative[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];

  const searchUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${encodeURIComponent(businessName)}&search_type=keyword_unordered`;

  let runId: string | null = null;

  try {
    // Start the Apify run (async, not sync — actor needs 60-90s to run)
    const startResp = await axios.post(
      `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/runs?token=${token}&memory=1024`,
      { startUrls: [{ url: searchUrl }], maxItems: 25 },
      { timeout: 15000 }
    );
    runId = startResp.data?.data?.id ?? null;
    if (!runId) return [];

    // Poll for run completion every 8s, up to 70s total
    let status = 'RUNNING';
    const deadline = Date.now() + 70000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 8000));
      const statusResp = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`,
        { timeout: 10000 }
      );
      status = statusResp.data?.data?.status ?? 'UNKNOWN';
      if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') {
        break;
      }
    }

    // Fetch dataset items whether run succeeded or is still running (partial data is fine)
    const dataResp = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}&limit=25`,
      { timeout: 15000 }
    );

    // Abort run if still running — to save Apify credits
    if (status === 'RUNNING') {
      axios.post(
        `https://api.apify.com/v2/actor-runs/${runId}/abort?token=${token}`,
        {},
        { timeout: 5000 }
      ).catch(() => {});
    }

    const items: unknown[] = dataResp.data ?? [];
    if (!Array.isArray(items) || items.length === 0) return [];

    return items
      .map((item: unknown): AdCreative | null => {
        const ad = item as Record<string, unknown>;
        const snapshot = ad.snapshot as Record<string, unknown> | undefined;
        const body = snapshot?.body as Record<string, unknown> | undefined;
        const images = snapshot?.images as Array<Record<string, unknown>> | undefined;
        const videos = snapshot?.videos as Array<Record<string, unknown>> | undefined;

        const rawId = String(ad.adArchiveID ?? ad.adArchiveId ?? '');
        if (!rawId) return null;

        const adText = (body?.text as string | null)?.slice(0, 500) ?? null;
        const imageUrl =
          (images?.[0]?.originalImageUrl as string | null) ??
          (videos?.[0]?.videoPreviewImageUrl as string | null) ??
          null;
        const isActive = Boolean(ad.isActive);
        const startDate = unixToDateStr(ad.startDate as number | null);
        const endDate = unixToDateStr(ad.endDate as number | null);
        const platforms = (ad.publisherPlatform as string[] | null)?.map(p => p.toLowerCase()) ?? ['facebook'];
        const ctaText = (snapshot?.ctaText as string | null) ?? null;
        const landingUrl = (snapshot?.linkUrl as string | null)
          ?? `https://www.facebook.com/ads/library/?id=${rawId}`;
        const displayFormat = (snapshot?.displayFormat as string | null) ?? null;
        const format = displayFormat === 'VIDEO' ? 'video' : imageUrl ? 'image' : 'text';

        return {
          adId: `meta_${rawId}`,
          platform: 'meta',
          adText,
          imageUrl,
          ctaText,
          landingUrl,
          startDate,
          endDate,
          isActive,
          format,
          impressionsRange: null,
          spendRange: null,
          reachRange: null,
          platforms,
          ageGenderDistribution: null,
          regionDistribution: null,
        };
      })
      .filter((ad): ad is AdCreative => ad !== null);
  } catch {
    // If run was started but we hit an error fetching results, abort it
    if (runId) {
      axios.post(
        `https://api.apify.com/v2/actor-runs/${runId}/abort?token=${process.env.APIFY_API_TOKEN}`,
        {},
        { timeout: 5000 }
      ).catch(() => {});
    }
    return [];
  }
}

// ─── Fallback: Browser scraping ───────────────────────────────────────────────
// Works on local dev (residential IP). Blocked by Facebook on datacenter IPs.

function extractAdsFromDOM(): RawMetaAd[] {
  const results: RawMetaAd[] = [];
  const seen = new Set<string>();

  document.querySelectorAll('*').forEach(el => {
    const text = (el as HTMLElement).innerText ?? '';
    const match = text.match(/Library ID[:\s]+(\d{10,})/);
    if (!match) return;

    const adId = match[1];
    if (seen.has(adId)) return;
    if (el.querySelectorAll('*').length > 300) return;
    seen.add(adId);

    const isActive = !text.toLowerCase().includes('inactive');

    const dateRange = text.match(/(\d{1,2} \w{3} \d{4})\s*[-–]\s*(\d{1,2} \w{3} \d{4})/);
    const sinceDate = text.match(/[Ss]ince\s+(\d{1,2} \w{3} \d{4})/);
    let startDate: string | null = null;
    let endDate: string | null = null;
    if (dateRange) {
      startDate = dateRange[1];
      endDate = dateRange[2];
    } else if (sinceDate) {
      startDate = sinceDate[1];
    }

    const SKIP_PHRASES = ['Library ID', 'Platforms', "Sorry, we're having trouble", 'EU transparency'];
    const paras = el.querySelectorAll('p, span[dir], div[dir]');
    let adText: string | null = null;
    paras.forEach(p => {
      const t = (p as HTMLElement).innerText?.trim() ?? '';
      const isNoise = SKIP_PHRASES.some(ph => t.includes(ph));
      if (t.length > 20 && !isNoise && !adText) adText = t.slice(0, 500);
    });

    const img = el.querySelector('img[src*="fbcdn"], img[src*="scontent"]') as HTMLImageElement | null;

    results.push({ adId: `meta_${adId}`, text: adText, imageUrl: img?.src ?? null, isActive, startDate, endDate });
  });

  return results.slice(0, 25);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function scrapeMetaAdLibrary(
  businessName: string,
  options?: ScraperOptions,
  countries?: string[]
): Promise<AdCreative[]> {
  const country = countries?.[0] ?? 'US';

  // Primary: Apify (works on Render + local)
  const apifyAds = await scrapeMetaAdsViaApify(businessName, country);
  if (apifyAds.length > 0) return apifyAds;

  // Fallback: browser scraping (works locally, blocked on Render datacenter IPs)
  const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${encodeURIComponent(businessName)}&search_type=keyword_unordered`;
  const { page, close } = await getPage({ timeout: options?.timeout ?? 35000 });

  try {
    await rateLimitedRequest('facebook.com', () =>
      page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    );

    const cookieSelectors = [
      '[data-cookiebanner="accept_button"]',
      '[data-testid="cookie-policy-manage-dialog-accept-button"]',
      'button[title="Allow all cookies"]',
      'button[title="Accept all"]',
    ];
    for (const sel of cookieSelectors) {
      try {
        await page.click(sel, { timeout: 1500 });
        await page.waitForTimeout(500);
        break;
      } catch {}
    }

    await page.waitForTimeout(5000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    const rawAds = await page.evaluate(extractAdsFromDOM);
    if (!Array.isArray(rawAds) || rawAds.length === 0) return [];

    return rawAds.map((ad): AdCreative => ({
      adId: ad.adId,
      platform: 'meta',
      adText: ad.text,
      imageUrl: ad.imageUrl,
      ctaText: null,
      landingUrl: `https://www.facebook.com/ads/library/?id=${ad.adId.replace('meta_', '')}`,
      startDate: parseDateStr(ad.startDate),
      endDate: parseDateStr(ad.endDate),
      isActive: ad.isActive,
      format: ad.imageUrl ? 'image' : 'text',
      impressionsRange: null,
      spendRange: null,
      reachRange: null,
      platforms: ['facebook'],
      ageGenderDistribution: null,
      regionDistribution: null,
    }));
  } catch {
    return [];
  } finally {
    await close();
  }
}
