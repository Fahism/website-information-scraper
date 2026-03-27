import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
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

export async function scrapeMetaAdLibrary(
  businessName: string,
  options?: ScraperOptions,
  countries?: string[]
): Promise<AdCreative[]> {
  const country = countries?.[0] ?? 'US';
  const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${country}&q=${encodeURIComponent(businessName)}&search_type=keyword_unordered`;

  const { page, close } = await getPage({ timeout: options?.timeout ?? 35000 });

  try {
    await rateLimitedRequest('facebook.com', () =>
      page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
    );

    // Dismiss GDPR/cookie consent if present
    try {
      await page.click('[data-cookiebanner="accept_button"]', { timeout: 2000 });
      await page.waitForTimeout(800);
    } catch {}

    // Wait for ad cards to render
    await page.waitForTimeout(5000);

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
