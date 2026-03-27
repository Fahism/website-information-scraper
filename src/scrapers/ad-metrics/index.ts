import { buildPublicSignals } from './public-signals';
import { estimateMetrics } from './estimator';
import type { AdsIntelligenceResult, AdMetricsResult, AdMetrics, ScraperError } from '@/scrapers/types';

const DISCLAIMER = 'Estimated values based on industry benchmarks and/or range midpoints. Not actual advertiser data.';

export async function scrapeAdMetrics(
  adsResult: AdsIntelligenceResult,
  industry: string | null
): Promise<AdMetricsResult> {
  const errors: ScraperError[] = [];
  const allAds = [...adsResult.metaAds, ...adsResult.tiktokAds, ...adsResult.googleAds];

  const metrics: AdMetrics[] = allAds.map(ad => {
    const signals = buildPublicSignals(ad);
    const estimates = estimateMetrics(
      { ...signals, platform: ad.platform, format: ad.format },
      industry
    );
    return {
      ...signals,
      ...estimates,
      roas: null,
      disclaimer: DISCLAIMER,
    };
  });

  const provenAdCount = metrics.filter(m => m.isProvenAd).length;
  const avgLongevityDays = metrics.length > 0
    ? Math.round(metrics.reduce((s, m) => s + m.longevityDays, 0) / metrics.length)
    : 0;

  // Find top platform by ad count
  const platformCounts: Record<string, number> = {};
  for (const ad of allAds) {
    for (const p of ad.platforms) {
      platformCounts[p] = (platformCounts[p] ?? 0) + 1;
    }
  }
  const topPlatform = Object.entries(platformCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    metrics,
    summary: { provenAdCount, avgLongevityDays, topPlatform },
    errors,
  };
}
