import type { AdCreative, AdMetrics } from '@/scrapers/types';

export function computeLongevityDays(startDate: string | null): number {
  if (!startDate) return 0;
  try {
    const start = new Date(startDate);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}

export function buildPublicSignals(ad: AdCreative): Pick<AdMetrics,
  'adId' | 'impressionsRange' | 'spendRange' | 'reachRange' | 'platforms' |
  'ageGenderDistribution' | 'regionDistribution' | 'longevityDays' | 'isProvenAd'
> {
  const longevityDays = computeLongevityDays(ad.startDate);
  return {
    adId: ad.adId,
    impressionsRange: ad.impressionsRange,
    spendRange: ad.spendRange,
    reachRange: ad.reachRange,
    platforms: ad.platforms,
    ageGenderDistribution: ad.ageGenderDistribution,
    regionDistribution: ad.regionDistribution,
    longevityDays,
    isProvenAd: longevityDays >= 60,
  };
}
