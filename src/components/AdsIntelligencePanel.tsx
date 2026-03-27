import type { AdsIntelligenceResult, AdMetricsResult, AdCreative, AdMetrics } from '@/scrapers/types';

interface AdCardProps {
  ad: AdCreative;
  metrics: AdMetrics | undefined;
}

function AdCard({ ad, metrics }: AdCardProps) {
  const longevityDays = metrics?.longevityDays ?? 0;
  const isProvenAd = metrics?.isProvenAd ?? false;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="bg-zinc-800 rounded-xl p-4 space-y-3">
      {/* Header: platform + longevity */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase">{ad.platform}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          isProvenAd ? 'bg-emerald-900 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
        }`}>
          {longevityDays}d {isProvenAd ? '· proven' : ''}
        </span>
      </div>

      {/* Ad image thumbnail */}
      {ad.imageUrl && (
        <div className="w-full h-28 bg-zinc-700 rounded-lg flex items-center justify-center overflow-hidden">
          <img
            src={ad.imageUrl}
            alt="Ad creative"
            className="max-w-full max-h-full object-contain"
            onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
          />
        </div>
      )}

      {/* Ad text */}
      {ad.adText && (
        <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed">{ad.adText}</p>
      )}

      {/* Dates row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        {ad.startDate && (
          <span>Started: {formatDate(ad.startDate)}</span>
        )}
        {ad.isActive ? (
          ad.endDate
            ? <span className="text-emerald-500">Active · last seen {formatDate(ad.endDate)}</span>
            : <span className="text-emerald-500">Active</span>
        ) : (
          ad.endDate
            ? <span className="text-red-400">Ended: {formatDate(ad.endDate)}</span>
            : <span className="text-zinc-600">Inactive</span>
        )}
      </div>

      {/* Metrics row */}
      <div className="border-t border-zinc-700 pt-2 space-y-1.5">
        {/* Real data — show if available (EU/TikTok only) */}
        {(ad.impressionsRange || ad.spendRange) && (
          <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
            {ad.impressionsRange && <span title="Reported impressions range">👁 {ad.impressionsRange}</span>}
            {ad.spendRange && <span title="Reported spend range">💰 {ad.spendRange}</span>}
          </div>
        )}

        {/* Estimated metrics grid */}
        {metrics && (
          <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
            {metrics.estimatedCPC && (
              <div title={`Basis: ${metrics.estimatedCPC.basis}`}>
                <p className="text-zinc-600 uppercase tracking-wide" style={{ fontSize: '0.6rem' }}>CPC est.</p>
                <p className={metrics.estimatedCPC.confidence === 'medium' ? 'text-zinc-300' : 'text-zinc-500'}>
                  ${metrics.estimatedCPC.value.toFixed(2)}
                </p>
              </div>
            )}
            {metrics.estimatedCPM && (
              <div title={`Basis: ${metrics.estimatedCPM.basis}`}>
                <p className="text-zinc-600 uppercase tracking-wide" style={{ fontSize: '0.6rem' }}>CPM est.</p>
                <p className="text-zinc-500">${metrics.estimatedCPM.value.toFixed(2)}</p>
              </div>
            )}
            {metrics.estimatedCTR && (
              <div title="Industry CTR benchmark">
                <p className="text-zinc-600 uppercase tracking-wide" style={{ fontSize: '0.6rem' }}>CTR est.</p>
                <p className="text-zinc-500">{(metrics.estimatedCTR.value * 100).toFixed(2)}%</p>
              </div>
            )}
            {metrics.estimatedDailySpend && (
              <div title={`Basis: ${metrics.estimatedDailySpend.basis}`}>
                <p className="text-zinc-600 uppercase tracking-wide" style={{ fontSize: '0.6rem' }}>$/day est.</p>
                <p className="text-zinc-500">${metrics.estimatedDailySpend.value.toFixed(0)}</p>
              </div>
            )}
            {metrics.estimatedClicks !== null && metrics.estimatedClicks > 0 && (
              <div title="Estimated total clicks over ad lifetime">
                <p className="text-zinc-600 uppercase tracking-wide" style={{ fontSize: '0.6rem' }}>Clicks est.</p>
                <p className="text-zinc-500">
                  {metrics.estimatedClicks >= 1000
                    ? `${(metrics.estimatedClicks / 1000).toFixed(1)}K`
                    : metrics.estimatedClicks}
                </p>
              </div>
            )}
            {longevityDays > 0 && (
              <div title="Longevity efficiency — longer ads get cheaper over time">
                <p className="text-zinc-600 uppercase tracking-wide" style={{ fontSize: '0.6rem' }}>Efficiency</p>
                <p className={longevityDays >= 180 ? 'text-emerald-500' : longevityDays >= 60 ? 'text-emerald-600' : 'text-zinc-500'}>
                  {longevityDays >= 365 ? 'Max' : longevityDays >= 180 ? 'High' : longevityDays >= 60 ? 'Good' : 'Low'}
                </p>
              </div>
            )}
          </div>
        )}
        <p className="text-zinc-700" style={{ fontSize: '0.6rem' }}>Est. · not actual data</p>
      </div>
    </div>
  );
}

interface AdsIntelligencePanelProps {
  adsIntelligence: AdsIntelligenceResult;
  adMetrics: AdMetricsResult;
}

// Interleave ads from multiple platforms so each platform gets fair visibility.
// Takes up to maxPerPlatform from each, then round-robins them into one list.
function interleavePlatforms(
  meta: AdCreative[],
  tiktok: AdCreative[],
  google: AdCreative[],
  maxPerPlatform: number
): AdCreative[] {
  const m = meta.slice(0, maxPerPlatform);
  const g = google.slice(0, maxPerPlatform);
  const t = tiktok.slice(0, maxPerPlatform);
  const result: AdCreative[] = [];
  const maxLen = Math.max(m.length, g.length, t.length);
  for (let i = 0; i < maxLen; i++) {
    if (m[i]) result.push(m[i]);
    if (g[i]) result.push(g[i]);
    if (t[i]) result.push(t[i]);
  }
  return result;
}

export default function AdsIntelligencePanel({ adsIntelligence, adMetrics }: AdsIntelligencePanelProps) {
  const MAX_PER_PLATFORM = 6;

  // Interleave platforms so the grid always shows a mix (Meta, Google, TikTok alternating)
  const displayAds = interleavePlatforms(
    adsIntelligence.metaAds,
    adsIntelligence.tiktokAds,
    adsIntelligence.googleAds,
    MAX_PER_PLATFORM
  );

  const totalFound =
    adsIntelligence.metaAds.length +
    adsIntelligence.tiktokAds.length +
    adsIntelligence.googleAds.length;

  const metricsMap = new Map(adMetrics.metrics.map(m => [m.adId, m]));

  // Build platform breakdown label e.g. "Meta 25 · Google 5"
  const platformBreakdown = [
    adsIntelligence.metaAds.length   > 0 && `Meta ${adsIntelligence.metaAds.length}`,
    adsIntelligence.googleAds.length > 0 && `Google ${adsIntelligence.googleAds.length}`,
    adsIntelligence.tiktokAds.length > 0 && `TikTok ${adsIntelligence.tiktokAds.length}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">Ads Intelligence</h3>
        <div className="text-right">
          <p className="text-xs text-zinc-500">
            {adsIntelligence.totalActiveAds} active · {adMetrics.summary.provenAdCount} proven
          </p>
          {platformBreakdown && (
            <p className="text-xs text-zinc-600 mt-0.5">{platformBreakdown}</p>
          )}
        </div>
      </div>

      {totalFound === 0 ? (
        adsIntelligence.errors.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-zinc-500">Ad library access unavailable.</p>
            <a
              href="https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-violet-400 hover:text-violet-300 underline"
            >
              Search Meta Ads Library manually
            </a>
          </div>
        ) : (
          <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-lg p-4">
            <p className="text-sm text-emerald-400 font-medium">No active ads found</p>
            <p className="text-xs text-zinc-500 mt-1">This business is not running paid advertising — an opportunity to help them get started.</p>
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayAds.map(ad => (
              <AdCard key={ad.adId} ad={ad} metrics={metricsMap.get(ad.adId)} />
            ))}
          </div>
          {totalFound > displayAds.length && (
            <p className="text-xs text-zinc-600">
              Showing {displayAds.length} of {totalFound} ads found ({MAX_PER_PLATFORM} per platform)
            </p>
          )}
          <p className="text-xs text-zinc-700 leading-relaxed">
            Estimated metrics based on industry benchmarks and/or range midpoints. Not actual advertiser data.
          </p>
        </>
      )}
    </div>
  );
}
