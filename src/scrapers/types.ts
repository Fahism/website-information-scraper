// ============================================================
// scrapers/types.ts — Single source of truth for all types
// ============================================================

export interface ScraperOptions {
  timeout?: number;       // ms, default 30000
  retries?: number;       // default 2
  userAgent?: string;
}

export interface ScraperError {
  code: string;
  message: string;
  scraper: string;
}

// ── Business Info ────────────────────────────────────────────

export interface BusinessInfoResult {
  businessName:     string | null;
  phone:            string | null;
  email:            string | null;
  address:          string | null;
  city:             string | null;
  state:            string | null;
  zip:              string | null;
  hasContactForm:   boolean;
  hasBookingSystem: boolean;
  bookingPlatform:  string | null; // 'calendly' | 'gohighlevel' | 'acuity' | etc.
  googleMapsUrl:    string | null;
  description:      string | null;
  industry:         string | null;
  googleRating:     number | null;
  reviewCount:      number | null;
  businessHours:    string | null;
  errors:           ScraperError[];
}

// ── Social Media ─────────────────────────────────────────────

export interface SocialProfile {
  platform:    'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'twitter';
  url:         string;
  handle:      string | null;
  followers:   number | null;
  following:   number | null;
  posts:       number | null;
  verified:    boolean;
  bio:         string | null;
  email:       string | null;
  phone:       string | null;
  engagementRate: number | null; // 0–1 decimal
  recentPosts: RecentPost[];
}

export interface RecentPost {
  url:         string | null;
  caption:     string | null;
  likes:       number | null;
  comments:    number | null;
  views:       number | null;
  postedAt:    string | null; // ISO date
}

export interface SocialMediaResult {
  profiles:    SocialProfile[];
  errors:      ScraperError[];
}

// ── Tech Detection ───────────────────────────────────────────

export interface TechItem {
  name:        string;
  category:    'analytics' | 'crm' | 'email_marketing' | 'ads_pixel' | 'chat' | 'booking' | 'ecommerce' | 'cms' | 'hosting' | 'other';
  confidence:  'high' | 'medium' | 'low';
  source:      'html_scan' | 'builtwith';
}

export interface TechDetectionResult {
  technologies: TechItem[];
  hasWordpress:  boolean;
  hasShopify:    boolean;
  hasWebflow:    boolean;
  hasCRM:        boolean;
  crmName:       string | null;
  hasEmailTool:  boolean;
  emailToolName: string | null;
  hasPixel:      boolean;
  pixelTypes:    string[];
  errors:        ScraperError[];
}

// ── Ads Intelligence ─────────────────────────────────────────

export interface AdCreative {
  adId:         string;
  platform:     'meta' | 'tiktok' | 'google';
  adText:       string | null;
  imageUrl:     string | null;
  ctaText:      string | null;
  landingUrl:   string | null;
  startDate:    string | null; // ISO date
  endDate:      string | null;
  isActive:     boolean;
  format:       string | null; // 'image' | 'video' | 'carousel'
  // Raw public data
  impressionsRange: string | null; // "1K–5K" (EU/UK Meta + TikTok only)
  spendRange:       string | null; // "$100–$499" (EU/UK Meta political only)
  reachRange:       string | null; // TikTok
  platforms:        string[];
  ageGenderDistribution: object | null;
  regionDistribution:    object | null;
}

export interface AdsIntelligenceResult {
  metaAds:   AdCreative[];
  tiktokAds: AdCreative[];
  googleAds: AdCreative[];
  totalActiveAds: number;
  oldestAdStartDate: string | null;
  facebookPageUrl: string | null; // extracted from Meta ad page_id — used as social media fallback
  errors:    ScraperError[];
}

// ── Ad Metrics ───────────────────────────────────────────────

export interface EstimatedMetricValue {
  value:      number;
  confidence: 'medium' | 'low' | 'very_low';
  basis:      string; // e.g. "computed_from_ranges" | "industry_benchmark"
}

export interface AdMetrics {
  adId:                  string;
  impressionsRange:      string | null;
  spendRange:            string | null;
  reachRange:            string | null;
  platforms:             string[];
  ageGenderDistribution: object | null;
  regionDistribution:    object | null;
  longevityDays:         number;
  isProvenAd:            boolean; // longevityDays >= 60
  estimatedCPM:          EstimatedMetricValue | null;
  estimatedCTR:          EstimatedMetricValue | null;
  estimatedClicks:       number | null;
  estimatedCPC:          EstimatedMetricValue | null;
  estimatedDailySpend:   EstimatedMetricValue | null;
  roas:                  null; // Never estimatable
  disclaimer:            string;
}

export interface AdMetricsResult {
  metrics:  AdMetrics[];
  summary: {
    provenAdCount:    number;
    avgLongevityDays: number;
    topPlatform:      string | null;
  };
  errors:   ScraperError[];
}

// ── Funnel Detection ─────────────────────────────────────────

export interface FunnelElement {
  type:   'landing_page' | 'lead_magnet' | 'email_capture' | 'booking_embed' |
          'checkout' | 'chatbot' | 'upsell' | 'free_offer' | 'consultation' | 'contact_page';
  url:    string;
  notes:  string | null;
}

export interface FunnelDetectionResult {
  funnelScore:    number; // 0–10
  elements:       FunnelElement[];
  crawledPages:   number;
  hasLandingPage: boolean;
  hasLeadMagnet:  boolean;
  hasEmailCapture: boolean;
  hasBooking:     boolean;
  errors:         ScraperError[];
}

// ── SEO / Traffic ─────────────────────────────────────────────

export interface SeoTrafficResult {
  indexedPageCount:   number | null;
  hasBlog:            boolean;
  blogUrl:            string | null;
  metaTitle:          string | null;
  metaDescription:    string | null;
  h1:                 string | null;
  topKeywords:        string[];
  isRunningPaidSearch: boolean;
  responseTimeMs:     number | null;
  hasSSL:             boolean;
  ogTitle?:           string | null;
  ogDescription?:     string | null;
  canonicalUrl?:      string | null;
  hasStructuredData?: boolean;
  h2Count?:           number;
  imagesWithoutAlt?:  number;
  errors:             ScraperError[];
}

// ── AI Results ───────────────────────────────────────────────

export interface Opportunity {
  id:             string;
  category:       'automation' | 'funnel' | 'social' | 'ads' | 'seo' | 'tech' | 'content';
  priority:       'high' | 'medium' | 'low';
  finding:        string; // one sentence
  recommendation: string; // two sentences max
  evidence:       string[];
}

export interface OpportunityAnalysis {
  businessSummary: string;
  overallScore:    number; // 0–100
  opportunities:   Opportunity[];
  strengths:       string[];
  gaps:            string[];
}

export interface LoomScript {
  wordCount:         number;
  estimatedDuration: number; // seconds
  subjectLine:       string;
  sections: {
    hook:        string;
    observation: string;
    insight:     string;
    pitch:       string;
    cta:         string;
  };
  fullScript: string;
}

// ── Report ───────────────────────────────────────────────────

export interface ReportData {
  id:              string;
  jobId:           string;
  businessName:    string | null;
  websiteUrl:      string;
  createdAt:       string;
  businessInfo:    BusinessInfoResult;
  socialMedia:     SocialMediaResult;
  techStack:       TechDetectionResult;
  adsIntelligence: AdsIntelligenceResult;
  adMetrics:       AdMetricsResult;
  funnelData:      FunnelDetectionResult;
  seoTraffic:      SeoTrafficResult;
  opportunities:   OpportunityAnalysis;
  loomScript:      LoomScript;
}

// ── Job ──────────────────────────────────────────────────────

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ResearchJob {
  id:           string;
  userId:       string;
  inputType:    'url' | 'name_location';
  rawInput:     string;
  resolvedUrl:  string | null;
  status:       JobStatus;
  progress:     number; // 0–100
  currentStep:  string | null;
  errorMessage: string | null;
  startedAt:    string | null;
  completedAt:  string | null;
  createdAt:    string;
}
