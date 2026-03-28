import axios from 'axios';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import { getNextAvailableKey, markKeyExhausted, getNextAvailableKeyExcluding } from '@/lib/searchapi-key-manager';
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

// ─── Primary: SearchAPI Meta Ad Library ───────────────────────────────────────
// Works from any IP including Render's datacenter — SearchAPI handles proxies.
// Uses the existing SEARCHAPI_API_KEY_1/2 keys (same keys used for Google search).
// No per-result pricing — flat credit cost per API call (~1 credit per search).

async function scrapeMetaAdsViaSearchApi(
  businessName: string,
  country: string,
  domain?: string
): Promise<{ ads: AdCreative[]; facebookPageUrl: string | null }> {
  const apiKey = getNextAvailableKey();
  if (!apiKey) return { ads: [], facebookPageUrl: null };

  try {
    const resp = await axios.get('https://www.searchapi.io/api/v1/search', {
      params: {
        engine: 'meta_ad_library',
        q: businessName,
        country,
        search_type: 'keyword_unordered',
        api_key: apiKey,
      },
      timeout: 20000,
    });

    const ads: unknown[] = resp.data?.ads ?? [];
    if (!Array.isArray(ads) || ads.length === 0) return { ads: [], facebookPageUrl: null };

    // Build a lookup: adArchiveId → page_id, so we can get the correct Facebook page
    // URL from whichever ad survives filtering (not blindly from ads[0]).
    const pageIdByArchiveId = new Map<string, string>();
    for (const item of ads) {
      const ad = item as Record<string, unknown>;
      const archiveId = String(ad.ad_archive_id ?? '');
      const pageId = String(ad.page_id ?? '');
      if (archiveId && pageId) pageIdByArchiveId.set(archiveId, pageId);
    }

    // Helper: pick the Facebook page URL from the first ad in a filtered set
    function facebookPageUrlFromAds(filtered: AdCreative[]): string | null {
      for (const ad of filtered) {
        const archiveId = ad.adId.replace('meta_', '');
        const pageId = pageIdByArchiveId.get(archiveId);
        if (pageId) return `https://www.facebook.com/${pageId}`;
      }
      return null;
    }

    const mapped = ads
      .map((item: unknown): AdCreative | null => {
        const ad = item as Record<string, unknown>;
        const snapshot = ad.snapshot as Record<string, unknown> | undefined;
        const body = snapshot?.body as Record<string, unknown> | undefined;
        const images = snapshot?.images as Array<Record<string, unknown>> | undefined;
        const videos = snapshot?.videos as Array<Record<string, unknown>> | undefined;
        // Carousel ads store images inside snapshot.cards[] rather than snapshot.images[]
        const cards = snapshot?.cards as Array<Record<string, unknown>> | undefined;

        const rawId = String(ad.ad_archive_id ?? '');
        if (!rawId) return null;

        const adText = (body?.text as string | null)?.slice(0, 500) ?? null;
        const imageUrl =
          (images?.[0]?.original_image_url as string | null) ??
          (images?.[0]?.resized_image_url as string | null) ??
          (videos?.[0]?.video_preview_image_url as string | null) ??
          (cards?.[0]?.original_image_url as string | null) ??
          (cards?.[0]?.resized_image_url as string | null) ??
          null;
        const isActive = Boolean(ad.is_active);
        const startDate = parseDateStr(ad.start_date as string | null);
        const endDate = parseDateStr(ad.end_date as string | null);
        const platforms = (ad.publisher_platform as string[] | null)?.map(p => p.toLowerCase()) ?? ['facebook'];
        const ctaText = (snapshot?.cta_text as string | null) ?? null;
        const landingUrl = (snapshot?.link_url as string | null)
          ?? `https://www.facebook.com/ads/library/?id=${rawId}`;
        const displayFormat = (snapshot?.display_format as string | null) ?? null;
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

    // When multiple companies share the same business name, SearchAPI returns ads from all of
    // them. Filter progressively — always prefer the most precise match:
    //
    // 1. Domain slug match (only if slug is ≥5 chars — short slugs like "abc" cause false
    //    positives because they appear as substrings in unrelated URLs and ad copy)
    // 2. Significant business-name words (≥6 chars, ALL must match — prevents generic words
    //    like "digital" or "health" from matching unrelated advertisers)
    // 3. Return empty — never return unrelated ads
    if (domain) {
      const domainSlug = domain.replace(/^www\./, '').split('.')[0].toLowerCase();

      if (domainSlug.length >= 5) {
        const domainMatched = mapped.filter(ad =>
          ad.landingUrl?.toLowerCase().includes(domainSlug) ||
          ad.adText?.toLowerCase().includes(domainSlug)
        );
        if (domainMatched.length > 0) {
          return { ads: domainMatched, facebookPageUrl: facebookPageUrlFromAds(domainMatched) };
        }
      }

      // Significant words fallback — words must be ≥6 chars and ALL must appear in the ad
      const significantWords = businessName
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length >= 6);
      if (significantWords.length >= 1) {
        const nameMatched = mapped.filter(ad =>
          significantWords.every(word =>
            ad.landingUrl?.toLowerCase().includes(word) ||
            ad.adText?.toLowerCase().includes(word)
          )
        );
        if (nameMatched.length > 0) {
          return { ads: nameMatched, facebookPageUrl: facebookPageUrlFromAds(nameMatched) };
        }
      }

      // Nothing matched — return page URL only (business runs ads but none link to their domain)
      return { ads: [], facebookPageUrl: facebookPageUrlFromAds(mapped) };
    }

    return { ads: mapped, facebookPageUrl: facebookPageUrlFromAds(mapped) };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 429 || status === 402) {
        markKeyExhausted(apiKey);
        // Retry once with the next available key (handles concurrent key exhaustion)
        const retryKey = getNextAvailableKeyExcluding(apiKey);
        if (retryKey) {
          return scrapeMetaAdsViaSearchApi(businessName, country, domain);
        }
      }
    }
    return { ads: [], facebookPageUrl: null };
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
  countries?: string[],
  domain?: string
): Promise<{ ads: AdCreative[]; facebookPageUrl: string | null }> {
  const country = countries?.[0] ?? 'US';

  // Primary: SearchAPI meta_ad_library engine (works on Render — no IP blocking)
  const searchApiResult = await scrapeMetaAdsViaSearchApi(businessName, country, domain);
  if (searchApiResult.ads.length > 0) return searchApiResult;

  // Fallback: browser scraping (works locally, blocked on Render datacenter IPs)
  // Hard 45s timeout prevents this from hanging the entire research pipeline.
  const browserAds = await Promise.race([
    scrapeMetaAdsViaBrowser(businessName, country, options),
    new Promise<AdCreative[]>(resolve => setTimeout(() => resolve([]), 45000)),
  ]);
  return { ads: browserAds, facebookPageUrl: searchApiResult.facebookPageUrl };
}

async function scrapeMetaAdsViaBrowser(
  businessName: string,
  country: string,
  options?: ScraperOptions
): Promise<AdCreative[]> {
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
