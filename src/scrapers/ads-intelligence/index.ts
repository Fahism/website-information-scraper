import { scrapeMetaAdLibrary } from './meta-ad-library';
import { scrapeTikTokAds } from './tiktok-ads';
import { scrapeGoogleAds } from './google-ads';
import type { AdsIntelligenceResult, ScraperOptions, ScraperError } from '@/scrapers/types';

// Map common country-code TLDs to Meta Ad Library country codes
const TLD_TO_COUNTRY: Record<string, string> = {
  'in': 'IN', 'co.in': 'IN',
  'uk': 'GB', 'co.uk': 'GB',
  'au': 'AU', 'com.au': 'AU',
  'ca': 'CA',
  'de': 'DE',
  'fr': 'FR',
  'br': 'BR', 'com.br': 'BR',
  'mx': 'MX', 'com.mx': 'MX',
  'jp': 'JP', 'co.jp': 'JP',
  'kr': 'KR', 'co.kr': 'KR',
  'za': 'ZA', 'co.za': 'ZA',
  'ng': 'NG', 'com.ng': 'NG',
  'it': 'IT',
  'es': 'ES',
  'nl': 'NL',
  'se': 'SE',
  'no': 'NO',
  'dk': 'DK',
  'fi': 'FI',
  'pl': 'PL',
  'ru': 'RU',
  'cn': 'CN',
  'sg': 'SG', 'com.sg': 'SG',
  'ae': 'AE',
  'sa': 'SA', 'com.sa': 'SA',
  'ph': 'PH', 'com.ph': 'PH',
  'id': 'ID', 'co.id': 'ID',
  'nz': 'NZ', 'co.nz': 'NZ',
  'vn': 'VN', 'com.vn': 'VN',
  'th': 'TH', 'co.th': 'TH',
  'my': 'MY', 'com.my': 'MY',
  'bd': 'BD',
  'pk': 'PK',
  'lk': 'LK',
  'tr': 'TR', 'com.tr': 'TR',
  'eg': 'EG', 'com.eg': 'EG',
};

// Returns a single country code if detectable from TLD, null if generic (.com, .net, .org, etc.)
function detectCountryFromUrl(websiteUrl: string): string | null {
  try {
    const hostname = new URL(websiteUrl).hostname.replace(/^www\./, '');
    const parts = hostname.split('.');

    // Check 2-part TLDs first (e.g., co.in, com.au, co.uk)
    if (parts.length >= 3) {
      const twoPartTld = parts.slice(-2).join('.');
      if (TLD_TO_COUNTRY[twoPartTld]) return TLD_TO_COUNTRY[twoPartTld];
    }

    // Check single TLDs (e.g., .de, .fr, .ca)
    const lastPart = parts[parts.length - 1];
    if (TLD_TO_COUNTRY[lastPart]) return TLD_TO_COUNTRY[lastPart];
  } catch {
    // fallback
  }
  return null; // Generic TLD — caller should use broad country list
}

export interface AdsScraperContext {
  businessName?: string | null;
}

export async function scrapeAdsIntelligence(
  websiteUrl: string,
  options?: ScraperOptions,
  context?: AdsScraperContext
): Promise<AdsIntelligenceResult> {
  const errors: ScraperError[] = [];

  // Use actual business name from business-info if available, otherwise derive from domain
  let businessName: string;
  if (context?.businessName) {
    businessName = context.businessName;
  } else {
    const rawSlug = new URL(websiteUrl).hostname.replace(/^www\./, '').split('.')[0];
    businessName = rawSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // Build country list for Meta API — single country if detectable from TLD, else broad search
  const detectedCountry = detectCountryFromUrl(websiteUrl);
  const metaCountries = detectedCountry ? [detectedCountry] : undefined; // undefined = use broad list in scraper

  const domain = new URL(websiteUrl).hostname.replace(/^www\./, '');

  const [metaResult, tiktokResult, googleResult] = await Promise.allSettled([
    scrapeMetaAdLibrary(businessName, options, metaCountries, domain),
    scrapeTikTokAds(businessName, options, domain),
    scrapeGoogleAds(businessName, options, domain),
  ]);

  const metaAds = metaResult.status === 'fulfilled' ? metaResult.value.ads : [];
  const facebookPageUrl = metaResult.status === 'fulfilled' ? metaResult.value.facebookPageUrl : null;
  const tiktokAds = tiktokResult.status === 'fulfilled' ? tiktokResult.value : [];
  const googleAds = googleResult.status === 'fulfilled' ? googleResult.value : [];

  if (metaResult.status === 'rejected') {
    errors.push({ code: 'META_ADS_FAILED', message: String(metaResult.reason), scraper: 'ads-intelligence/meta' });
  }
  if (tiktokResult.status === 'rejected') {
    errors.push({ code: 'TIKTOK_ADS_FAILED', message: String(tiktokResult.reason), scraper: 'ads-intelligence/tiktok' });
  }
  if (googleResult.status === 'rejected') {
    errors.push({ code: 'GOOGLE_ADS_FAILED', message: String(googleResult.reason), scraper: 'ads-intelligence/google' });
  }

  const allAds = [...metaAds, ...tiktokAds, ...googleAds];
  const totalActiveAds = allAds.filter(a => a.isActive).length;

  const startDates = allAds
    .map(a => a.startDate)
    .filter((d): d is string => d !== null)
    .sort();
  const oldestAdStartDate = startDates[0] ?? null;

  return { metaAds, tiktokAds, googleAds, totalActiveAds, oldestAdStartDate, facebookPageUrl, errors };
}
