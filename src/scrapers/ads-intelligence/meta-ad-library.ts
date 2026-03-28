import axios from 'axios';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import { getNextAvailableKey, markKeyExhausted } from '@/lib/searchapi-key-manager';
import type { AdCreative, ScraperOptions } from '@/scrapers/types';

interface RawMetaAd {
  adId: string;
  text: string | null;
  imageUrl: string | null;
  isActive: boolean;
  startDate: string | null; // raw text like "25 Sep 2023"
  endDate: string | null;
}

// Convert "25 Sep 2023" → "2023-09-25"
function parseDateStr(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch {}
  return null;
}

// DOM evaluation — injected into the page context (no imports available here)
function extractAdsFromDOM(): RawMetaAd[] {
  const results: RawMetaAd[] = [];
  const seen = new Set<string>();

  document.querySelectorAll('*').forEach(el => {
    const text = (el as HTMLElement).innerText ?? '';
    const match = text.match(/Library ID[:\s]+(\d{10,})/);
    if (!match) return;

    const adId = match[1];
    if (seen.has(adId)) return;

    // Skip huge containers — only keep leaf-level ad card elements
    if (el.querySelectorAll('*').length > 300) return;
    seen.add(adId);

    const isActive = !text.toLowerCase().includes('inactive');

    // Dates: "15 Jan 2024 - 20 Mar 2025" or "Since 15 Jan 2024"
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

    // Ad text — prefer longer text chunks that aren't metadata or player errors
    const SKIP_PHRASES = ['Library ID', 'Platforms', "Sorry, we're having trouble", 'EU transparency'];
    const paras = el.querySelectorAll('p, span[dir], div[dir]');
    let adText: string | null = null;
    paras.forEach(p => {
      const t = (p as HTMLElement).innerText?.trim() ?? '';
      const isNoise = SKIP_PHRASES.some(ph => t.includes(ph));
      if (t.length > 20 && !isNoise && !adText) {
        adText = t.slice(0, 500);
      }
    });

    const img = el.querySelector('img[src*="fbcdn"], img[src*="scontent"]') as HTMLImageElement | null;

    results.push({
      adId: `meta_${adId}`,
      text: adText,
      imageUrl: img?.src ?? null,
      isActive,
      startDate,
      endDate,
    });
  });

  return results.slice(0, 25);
}

async function scrapeMetaAdsViaSearchAPI(
  businessName: string,
  country: string
): Promise<AdCreative[]> {
  const apiKey = getNextAvailableKey();
  if (!apiKey) return [];

  try {
    const resp = await axios.get('https://www.searchapi.io/api/v1/search', {
      params: {
        engine: 'facebook_ads_library',
        q: businessName,
        country,
        api_key: apiKey,
      },
      timeout: 20000,
    });

    const ads: unknown[] = resp.data?.ads ?? [];
    if (!Array.isArray(ads) || ads.length === 0) return [];

    return ads.slice(0, 25).map((ad: unknown): AdCreative => {
      const a = ad as Record<string, unknown>;
      const snapshot = a.snapshot as Record<string, unknown> | undefined;
      const body = snapshot?.body as Record<string, unknown> | undefined;
      const images = snapshot?.images as Array<Record<string, unknown>> | undefined;
      const cards = snapshot?.cards as Array<Record<string, unknown>> | undefined;

      const adText = (body?.text as string | null) ?? null;
      const imageUrl =
        (images?.[0]?.resized_image_url as string | null) ??
        (cards?.[0]?.resized_image_url as string | null) ??
        null;
      const adId = String(a.id ?? `${Date.now()}_${Math.random()}`);
      const startDate = (a.start_date as string | null) ?? null;
      const endDate = (a.end_date as string | null) ?? null;
      const isActive = !endDate || a.status === 'ACTIVE';

      return {
        adId: `meta_${adId}`,
        platform: 'meta',
        adText: adText?.slice(0, 500) ?? null,
        imageUrl,
        ctaText: null,
        landingUrl: `https://www.facebook.com/ads/library/?id=${adId}`,
        startDate: startDate ? parseDateStr(startDate) ?? startDate : null,
        endDate: endDate ? parseDateStr(endDate) ?? endDate : null,
        isActive,
        format: imageUrl ? 'image' : 'text',
        impressionsRange: null,
        spendRange: null,
        reachRange: null,
        platforms: ['facebook'],
        ageGenderDistribution: null,
        regionDistribution: null,
      };
    });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 429 || status === 402) markKeyExhausted(apiKey);
    }
    return [];
  }
}

export async function scrapeMetaAdLibrary(
  businessName: string,
  options?: ScraperOptions,
  countries?: string[]
): Promise<AdCreative[]> {
  const country = countries?.[0] ?? 'US';

  // Primary: SearchAPI — works from any IP including Render's datacenter
  const searchApiAds = await scrapeMetaAdsViaSearchAPI(businessName, country);
  if (searchApiAds.length > 0) return searchApiAds;

  // Fallback: browser scraping (works on local dev, may be blocked on datacenter IPs)
  const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${encodeURIComponent(businessName)}&search_type=keyword_unordered`;

  const { page, close } = await getPage({ timeout: options?.timeout ?? 35000 });

  try {
    await rateLimitedRequest('facebook.com', () =>
      page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    );

    // Dismiss GDPR/cookie consent — try multiple selector variants
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

    // Wait for ad cards to render
    await page.waitForTimeout(8000);

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
