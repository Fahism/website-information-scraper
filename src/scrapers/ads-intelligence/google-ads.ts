import axios from 'axios';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import { getNextAvailableKey, markKeyExhausted } from '@/lib/searchapi-key-manager';
import type { AdCreative, ScraperOptions } from '@/scrapers/types';

const SEARCHAPI_BASE = 'https://www.searchapi.io/api/v1/search';

interface SearchApiAd {
  id?: string;
  target_domain?: string;
  advertiser?: { id?: string; name?: string };
  first_shown_datetime?: string;
  last_shown_datetime?: string;
  total_days_shown?: number;
  format?: string;
  image?: { link?: string; height?: number; width?: number };
  details_link?: string;
  // Text ad fields (may vary)
  headline?: string;
  description?: string;
  text?: string;
}

interface SearchApiResponse {
  ad_creatives?: SearchApiAd[];
}

function mapSearchApiAd(item: SearchApiAd): AdCreative {
  const lastSeen = item.last_shown_datetime;
  const isActive = lastSeen
    ? new Date(lastSeen) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    : true;

  const adText = item.headline ?? item.text ?? item.description ?? null;
  const format = item.format?.toLowerCase().includes('video')
    ? 'video'
    : item.format?.toLowerCase().includes('text')
    ? 'text'
    : 'image';

  return {
    adId: item.id ?? `google_${Date.now()}_${Math.random()}`,
    platform: 'google',
    adText: adText?.slice(0, 500) ?? null,
    imageUrl: item.image?.link ?? null,
    ctaText: null,
    landingUrl: item.details_link ?? null,
    startDate: item.first_shown_datetime ? item.first_shown_datetime.split('T')[0] : null,
    endDate: item.last_shown_datetime ? item.last_shown_datetime.split('T')[0] : null,
    isActive,
    format,
    impressionsRange: null,
    spendRange: null,       // Google Ads Transparency doesn't expose spend data
    reachRange: null,
    platforms: ['google'],
    ageGenderDistribution: null,
    regionDistribution: null,
  };
}

function isQuotaError(err: unknown): boolean {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    return status === 429 || status === 402;
  }
  return false;
}

export async function scrapeGoogleAds(
  businessName: string,
  options?: ScraperOptions,
  domain?: string
): Promise<AdCreative[]> {
  // Try each available key in order, rotating on quota errors
  for (let attempt = 0; attempt < 5; attempt++) {
    const apiKey = getNextAvailableKey();
    if (!apiKey) return [];

    const params: Record<string, string> = {
      engine: 'google_ads_transparency_center',
      api_key: apiKey,
    };
    if (domain) {
      params.domain = domain;
    } else {
      params.q = businessName;
    }

    try {
      const response = await rateLimitedRequest('searchapi.io', () =>
        axios.get<SearchApiResponse>(SEARCHAPI_BASE, {
          params,
          timeout: options?.timeout ?? 30000,
        }).then(r => r.data)
      );

      const ads = response.ad_creatives ?? [];
      if (!Array.isArray(ads)) return [];

      const seen = new Set<string>();
      const unique = ads.filter(item => {
        const key = item.id ?? '';
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return unique.slice(0, 5).map(mapSearchApiAd);
    } catch (err) {
      if (isQuotaError(err)) {
        markKeyExhausted(apiKey);
        continue;
      }
      return [];
    }
  }

  return [];
}
