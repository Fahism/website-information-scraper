import PQueue from 'p-queue';
import { scrapeBusinessInfo } from './business-info';
import { scrapeTechDetection } from './tech-detection';
import { scrapeSocialMedia } from './social-media';
import { scrapeAdsIntelligence } from './ads-intelligence';
import { scrapeAdMetrics } from './ad-metrics';
import { scrapeFunnelDetection } from './funnel-detection';
import { scrapeSeoTraffic } from './seo-traffic';
import { isPlaceholderEmail, isPlaceholderPhone } from './business-info/contact-extractor';
import type {
  ReportData,
  BusinessInfoResult,
  SocialMediaResult,
  TechDetectionResult,
  AdsIntelligenceResult,
  AdMetricsResult,
  FunnelDetectionResult,
  SeoTrafficResult,
} from './types';

export interface OrchestratorOptions {
  onProgress?: (progress: number, step: string) => Promise<void>;
  onPartialResult?: (key: string, data: unknown) => Promise<void>;
  timeout?: number;
}

function getScraperConcurrency(): number {
  const raw = process.env.SCRAPER_CONCURRENCY;
  const parsed = raw ? Number.parseInt(raw, 10) : 2;

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 2;
  }

  return parsed;
}

export async function runOrchestrator(
  url: string,
  jobId: string,
  userId: string,
  options?: OrchestratorOptions
): Promise<ReportData> {
  const { onProgress, onPartialResult, timeout = 30000 } = options ?? {};
  const scraperOptions = { timeout };

  const update = async (progress: number, step: string) => {
    await onProgress?.(progress, step);
  };

  await update(5, 'Resolving URL');

  // Run all scrapers in parallel with p-queue
  const queue = new PQueue({ concurrency: getScraperConcurrency() });

  let businessInfo: (BusinessInfoResult & { _html: string }) | null = null;
  let socialMedia: SocialMediaResult | null = null;
  let techStack: TechDetectionResult | null = null;
  let adsIntelligence: AdsIntelligenceResult | null = null;
  let adMetrics: AdMetricsResult | null = null;
  let funnelData: FunnelDetectionResult | null = null;
  let seoTraffic: SeoTrafficResult | null = null;

  await update(10, 'Starting scrapers');

  // businessInfoDone resolves once business info completes — downstream scrapers await this
  let resolveBusinessInfoDone!: () => void;
  const businessInfoDone = new Promise<void>(res => { resolveBusinessInfoDone = res; });

  // adsIntelligenceDone resolves once ads are scraped — adMetrics awaits this
  let resolveAdsIntelligenceDone!: () => void;
  const adsIntelligenceDone = new Promise<void>(res => { resolveAdsIntelligenceDone = res; });

  const tasks = [
    queue.add(async () => {
      businessInfo = await scrapeBusinessInfo(url, scraperOptions);
      await onPartialResult?.('business_info', businessInfo);
      resolveBusinessInfoDone();
      await update(20, 'Business info scraped');
    }),
    queue.add(async () => {
      await businessInfoDone;
      techStack = await scrapeTechDetection(url, scraperOptions, businessInfo?._html);
      await onPartialResult?.('tech_stack', techStack);
      await update(35, 'Tech stack detected');
    }),
    queue.add(async () => {
      await businessInfoDone;
      funnelData = await scrapeFunnelDetection(url, scraperOptions, businessInfo?._html, {
        hasContactForm: businessInfo?.hasContactForm,
        hasBookingSystem: businessInfo?.hasBookingSystem,
      });
      await onPartialResult?.('funnel_data', funnelData);
      await update(50, 'Funnel analyzed');
    }),
    queue.add(async () => {
      await businessInfoDone;
      socialMedia = await scrapeSocialMedia(url, scraperOptions, businessInfo?._html, businessInfo?.businessName);

      // Backfill email/phone from Facebook when the website had nothing OR
      // had only a placeholder value (e.g. user@domain.com, 0000000).
      if (businessInfo) {
        const fbProfile = socialMedia?.profiles.find(p => p.platform === 'facebook');
        if (fbProfile) {
          const emailMissing = !businessInfo.email || isPlaceholderEmail(businessInfo.email);
          const phoneMissing = !businessInfo.phone || isPlaceholderPhone(businessInfo.phone);
          if (emailMissing && fbProfile.email) businessInfo.email = fbProfile.email;
          if (phoneMissing && fbProfile.phone) businessInfo.phone = fbProfile.phone;
        }
      }

      await onPartialResult?.('social_media', socialMedia);
      await onPartialResult?.('business_info', businessInfo);
      await update(60, 'Social media scraped');
    }),
    queue.add(async () => {
      await businessInfoDone;
      seoTraffic = await scrapeSeoTraffic(url, businessInfo?.businessName ?? null, scraperOptions, businessInfo?._html);
      await onPartialResult?.('seo_traffic', seoTraffic);
      await update(70, 'SEO data collected');
    }),
    queue.add(async () => {
      await businessInfoDone;
      adsIntelligence = await scrapeAdsIntelligence(url, scraperOptions, {
        businessName: businessInfo?.businessName,
      });
      await onPartialResult?.('ads_intelligence', adsIntelligence);
      resolveAdsIntelligenceDone();
      await update(80, 'Ad intelligence gathered');
    }),
    queue.add(async () => {
      await adsIntelligenceDone;
      if (adsIntelligence) {
        adMetrics = await scrapeAdMetrics(adsIntelligence, businessInfo?.industry ?? null);
        await onPartialResult?.('ad_metrics', adMetrics);
      }
      await update(85, 'Ad metrics calculated');
    }),
  ];

  await Promise.all(tasks);

  // Fallback: if social media found no Facebook profile but Meta ads exist, seed a stub
  // using the Facebook page URL extracted from the ad data (all ads belong to a page)
  const _sm = socialMedia as SocialMediaResult | null;
  const _ai = adsIntelligence as AdsIntelligenceResult | null;
  if (_sm && _ai?.facebookPageUrl) {
    const hasFacebook = _sm.profiles.some(p => p.platform === 'facebook');
    if (!hasFacebook) {
      _sm.profiles.unshift({
        platform: 'facebook',
        url: _ai.facebookPageUrl,
        handle: null,
        followers: null,
        following: null,
        posts: null,
        verified: false,
        bio: null,
        email: null,
        phone: null,
        engagementRate: null,
        recentPosts: [],
      });
    }
  }

  await update(90, 'Generating AI analysis');

  // Default empty results if scraper failed
  const emptyErrors = { errors: [] };

  return {
    id: '',
    jobId,
    businessName: (businessInfo as BusinessInfoResult | null)?.businessName ?? null,
    websiteUrl: url,
    createdAt: new Date().toISOString(),
    businessInfo: businessInfo ?? { businessName: null, phone: null, email: null, address: null, city: null, state: null, zip: null, hasContactForm: false, hasBookingSystem: false, bookingPlatform: null, googleMapsUrl: null, description: null, industry: null, googleRating: null, reviewCount: null, businessHours: null, ...emptyErrors },
    socialMedia: socialMedia ?? { profiles: [], ...emptyErrors },
    techStack: techStack ?? { technologies: [], hasWordpress: false, hasShopify: false, hasWebflow: false, hasCRM: false, crmName: null, hasEmailTool: false, emailToolName: null, hasPixel: false, pixelTypes: [], ...emptyErrors },
    adsIntelligence: adsIntelligence ?? { metaAds: [], tiktokAds: [], googleAds: [], totalActiveAds: 0, oldestAdStartDate: null, facebookPageUrl: null, ...emptyErrors },
    adMetrics: adMetrics ?? { metrics: [], summary: { provenAdCount: 0, avgLongevityDays: 0, topPlatform: null }, ...emptyErrors },
    funnelData: funnelData ?? { funnelScore: 0, elements: [], crawledPages: 0, hasLandingPage: false, hasLeadMagnet: false, hasEmailCapture: false, hasBooking: false, ...emptyErrors },
    seoTraffic: seoTraffic ?? { indexedPageCount: null, hasBlog: false, blogUrl: null, metaTitle: null, metaDescription: null, h1: null, topKeywords: [], isRunningPaidSearch: false, responseTimeMs: null, hasSSL: false, ...emptyErrors },
    opportunities: { businessSummary: '', overallScore: 0, opportunities: [], strengths: [], gaps: [] },
    loomScript: { wordCount: 0, estimatedDuration: 0, subjectLine: '', sections: { hook: '', observation: '', insight: '', pitch: '', cta: '' }, fullScript: '' },
  };
}
