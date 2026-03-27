import type { AdCreative, ScraperOptions } from '@/scrapers/types';

// TikTok Ad Library scraping requires developer account verification,
// which is unavailable in regions where TikTok is banned (e.g. India).
// Returns empty array to avoid blocking the pipeline.
export async function scrapeTikTokAds(
  _businessName: string,
  _options?: ScraperOptions,
  _domain?: string
): Promise<AdCreative[]> {
  return [];
}
