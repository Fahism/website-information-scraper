import type { EstimatedMetricValue } from '@/scrapers/types';

// ── Industry benchmarks (WordStream / Meta / Google annual reports 2024) ──────

const INDUSTRY_CTR: Record<string, number> = {
  home_services: 0.009,
  legal:         0.0135,
  retail:        0.0159,
  medical:       0.0113,
  restaurant:    0.012,
  fitness:       0.0105,
  salon:         0.011,
  real_estate:   0.0099,
  default:       0.012,
};

// Base CPC by industry — used for Google search ads and as the industry anchor
const INDUSTRY_CPC: Record<string, number> = {
  home_services: 1.81,
  legal:         3.13,
  retail:        0.70,
  medical:       2.32,
  restaurant:    0.51,
  fitness:       1.06,
  salon:         0.97,
  real_estate:   1.81,
  default:       1.72,
};

const INDUSTRY_CPM: Record<string, number> = {
  home_services: 11.20,
  legal:         15.40,
  retail:         8.50,
  medical:       12.80,
  restaurant:     9.30,
  fitness:       10.20,
  salon:          9.80,
  real_estate:   11.50,
  default:       10.50,
};

const INDUSTRY_DAILY_SPEND: Record<string, number> = {
  home_services: 27,
  legal:         45,
  retail:        35,
  medical:       38,
  restaurant:    20,
  fitness:       25,
  salon:         18,
  real_estate:   32,
  default:       28,
};

// ── Platform × Format CPC multipliers vs industry base ────────────────────────
// Source: Meta Ads benchmark reports, WordStream Google Ads data (2024)
const PLATFORM_FORMAT_CPC_FACTOR: Record<string, Record<string, number>> = {
  meta: {
    image:    0.55,  // Meta image ~$0.94 avg (lower than search)
    video:    0.46,  // Meta video ~$0.79 avg (algo-favoured, lower CPC)
    carousel: 0.49,  // Meta carousel ~$0.84 avg
    text:     0.60,
    default:  0.55,
  },
  google: {
    text:     1.00,  // Google search = industry benchmark (highest intent)
    image:    0.37,  // Google display ~$0.63 avg
    video:    0.29,  // Google video (YouTube) ~$0.49 avg
    default:  1.00,
  },
  tiktok: {
    video:    0.58,  // TikTok ~$1.00 avg
    image:    0.70,
    default:  0.58,
  },
};

const PLATFORM_CPM_BASE: Record<string, Record<string, number>> = {
  meta: {
    image:   8.50,
    video:   7.20,   // video CPM lower — Meta rewards video with distribution
    carousel: 8.00,
    text:    9.00,
    default: 8.50,
  },
  google: {
    text:    0,      // search = CPC model, CPM not applicable
    image:   3.12,   // display CPM
    video:   6.80,   // YouTube CPM
    default: 3.12,
  },
  tiktok: {
    video:   9.16,
    image:   10.00,
    default: 9.16,
  },
};

// ── Longevity efficiency multiplier ───────────────────────────────────────────
// Longer-running ads have been optimised by the algorithm → lower effective CPC
function longevityMultiplier(days: number): number {
  if (days >= 365) return 0.72;   // evergreen — maximum efficiency
  if (days >= 180) return 0.80;   // very well optimised
  if (days >= 60)  return 0.88;   // proven, algorithm has tuned delivery
  if (days >= 30)  return 0.94;   // settling in
  return 1.00;                     // new — no optimisation yet
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMidpoint(rangeStr: string | null): number | null {
  if (!rangeStr) return null;
  const cleaned = rangeStr.replace(/\$|,/g, '');
  const match = cleaned.match(/([\d.]+)\s*[KkMm]?\s*[–\-]\s*([\d.]+)\s*([KkMm]?)/);
  if (!match) return null;
  const parseVal = (num: string, suffix: string): number => {
    const n = parseFloat(num);
    const s = suffix.toUpperCase();
    return s === 'K' ? n * 1000 : s === 'M' ? n * 1_000_000 : n;
  };
  return (parseVal(match[1], match[3]) + parseVal(match[2], match[3])) / 2;
}

function mv(value: number, confidence: EstimatedMetricValue['confidence'], basis: string): EstimatedMetricValue {
  return { value, confidence, basis };
}

// ── Main estimator ────────────────────────────────────────────────────────────

export function estimateMetrics(
  ad: {
    impressionsRange: string | null;
    spendRange:       string | null;
    longevityDays:    number;
    platform?:        string;
    format?:          string | null;
  },
  industry: string | null
): {
  estimatedCPM:        EstimatedMetricValue | null;
  estimatedCTR:        EstimatedMetricValue | null;
  estimatedClicks:     number | null;
  estimatedCPC:        EstimatedMetricValue | null;
  estimatedDailySpend: EstimatedMetricValue | null;
} {
  const ind    = (industry && INDUSTRY_CPC[industry]) ? industry : 'default';
  const plt    = (ad.platform ?? 'default').toLowerCase();
  const fmt    = (ad.format ?? 'default').toLowerCase();
  const days   = ad.longevityDays;
  const lMult  = longevityMultiplier(days);

  const baseCPC  = INDUSTRY_CPC[ind]          ?? INDUSTRY_CPC.default;
  const baseCPM  = INDUSTRY_CPM[ind]          ?? INDUSTRY_CPM.default;
  const baseCTR  = INDUSTRY_CTR[ind]          ?? INDUSTRY_CTR.default;
  const baseSpend = INDUSTRY_DAILY_SPEND[ind] ?? INDUSTRY_DAILY_SPEND.default;

  // Platform×format multipliers
  const pltCPCFactors = PLATFORM_FORMAT_CPC_FACTOR[plt] ?? PLATFORM_FORMAT_CPC_FACTOR['meta'];
  const cpcFactor     = pltCPCFactors[fmt] ?? pltCPCFactors['default'] ?? 1.0;

  const pltCPMBase = PLATFORM_CPM_BASE[plt] ?? PLATFORM_CPM_BASE['meta'];
  const platformCPM = pltCPMBase[fmt] ?? pltCPMBase['default'] ?? baseCPM;

  // Parse any real ranges (EU political Meta / TikTok)
  const impMid   = parseMidpoint(ad.impressionsRange);
  const spendMid = parseMidpoint(ad.spendRange);

  // ── CPM ──────────────────────────────────────────────────────────────────
  let estimatedCPM: EstimatedMetricValue | null = null;
  if (spendMid && impMid) {
    estimatedCPM = mv((spendMid / impMid) * 1000, 'medium', 'computed_from_ranges');
  } else if (plt !== 'google' || fmt !== 'text') {
    // CPM not meaningful for Google search text ads
    const cpm = platformCPM * lMult;
    estimatedCPM = mv(cpm, 'very_low', 'platform_benchmark');
  }

  // ── CTR ──────────────────────────────────────────────────────────────────
  // Video ads on social have higher CTR than static; Google search is highest
  const ctrAdjust =
    plt === 'google' && fmt === 'text' ? 1.6 :    // search intent = higher CTR
    fmt === 'video'                   ? 0.9 :    // video — impressions high, CTR lower
    fmt === 'carousel'                ? 1.1 :    // carousels slightly above avg
    1.0;
  const estimatedCTR = mv(baseCTR * ctrAdjust, 'low', 'industry_benchmark');

  // ── Impressions (for click calculation) ──────────────────────────────────
  let estimatedImpressions = impMid;
  if (!estimatedImpressions && days > 0) {
    const dailySpendEst = spendMid ? spendMid / days : baseSpend;
    const cpmToUse = estimatedCPM?.value ?? platformCPM;
    estimatedImpressions = cpmToUse > 0 ? (dailySpendEst / cpmToUse) * 1000 * days : null;
  }

  // ── Clicks ───────────────────────────────────────────────────────────────
  const estimatedClicks = estimatedImpressions
    ? Math.round(estimatedImpressions * estimatedCTR.value)
    : null;

  // ── CPC ──────────────────────────────────────────────────────────────────
  let estimatedCPC: EstimatedMetricValue | null = null;
  if (spendMid && estimatedClicks && estimatedClicks > 0) {
    estimatedCPC = mv(spendMid / estimatedClicks, 'medium', 'computed_from_spend_and_clicks');
  } else {
    // Platform + format adjusted CPC, further tuned by longevity
    const adjustedCPC = baseCPC * cpcFactor * lMult;
    estimatedCPC = mv(adjustedCPC, 'very_low', 'platform_format_benchmark');
  }

  // ── Daily spend ──────────────────────────────────────────────────────────
  // Estimate how much this advertiser is spending per day on this ad
  let estimatedDailySpend: EstimatedMetricValue | null = null;
  if (spendMid && days > 0) {
    estimatedDailySpend = mv(spendMid / days, 'medium', 'computed_from_spend_range');
  } else {
    // Industry daily spend, scaled by efficiency
    estimatedDailySpend = mv(baseSpend * lMult, 'very_low', 'industry_benchmark');
  }

  return { estimatedCPM, estimatedCTR, estimatedClicks, estimatedCPC, estimatedDailySpend };
}
