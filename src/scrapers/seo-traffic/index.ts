import axios from 'axios';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import * as cheerio from 'cheerio';
import { getIndexedPageCount, checkBlogExists, checkPaidSearch } from './google-search';
import { extractKeywords } from './keyword-extractor';
import type { SeoTrafficResult, ScraperOptions, ScraperError } from '@/scrapers/types';

const COMMON_BLOG_PATHS = ['/blog', '/news', '/articles', '/resources', '/insights'];

async function checkBlogPathsDirect(baseUrl: string, timeout: number): Promise<{ hasBlog: boolean; blogUrl: string | null }> {
  const origin = new URL(baseUrl).origin;
  for (const path of COMMON_BLOG_PATHS) {
    try {
      const fullUrl = origin + path;
      const resp = await axios.head(fullUrl, {
        timeout,
        maxRedirects: 3,
        validateStatus: s => s < 400,
      });
      if (resp.status < 400) {
        return { hasBlog: true, blogUrl: fullUrl };
      }
    } catch {
      // path doesn't exist
    }
  }
  return { hasBlog: false, blogUrl: null };
}

export async function scrapeSeoTraffic(
  url: string,
  businessName: string | null,
  options?: ScraperOptions,
  sharedHtml?: string
): Promise<SeoTrafficResult> {
  const errors: ScraperError[] = [];
  let metaTitle: string | null = null;
  let metaDescription: string | null = null;
  let h1: string | null = null;
  let topKeywords: string[] = [];
  let responseTimeMs: number | null = null;
  const hasSSL = url.startsWith('https://');
  let ogTitle: string | null = null;
  let ogDescription: string | null = null;
  let canonicalUrl: string | null = null;
  let hasStructuredData = false;
  let h2Count = 0;
  let imagesWithoutAlt = 0;

  try {
    const domain = new URL(url).hostname.replace(/^www\./, '');

    // Use shared HTML from business-info if available, otherwise fall back to axios
    let html: string;
    if (sharedHtml) {
      html = sharedHtml;
    } else {
      html = await rateLimitedRequest(url, () =>
        axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: options?.timeout ?? 20000,
        }).then(r => r.data as string)
      );
    }

    // Measure response time with a lightweight HEAD request
    try {
      const startTime = Date.now();
      await axios.head(url, { timeout: 5000, maxRedirects: 3 });
      responseTimeMs = Date.now() - startTime;
    } catch {
      // HEAD failed — skip response time measurement
    }

    const $ = cheerio.load(html);
    metaTitle = $('title').text().trim() || null;
    metaDescription = $('meta[name="description"]').attr('content') || null;
    h1 = $('h1').first().text().trim() || null;
    topKeywords = extractKeywords(html);

    // Additional SEO signals
    ogTitle = $('meta[property="og:title"]').attr('content') || null;
    ogDescription = $('meta[property="og:description"]').attr('content') || null;
    canonicalUrl = $('link[rel="canonical"]').attr('href') || null;
    hasStructuredData = $('script[type="application/ld+json"]').length > 0;
    h2Count = $('h2').length;
    imagesWithoutAlt = $('img').filter((_, el) => {
      const alt = $(el).attr('alt');
      return alt === undefined || alt.trim() === '';
    }).length;

    // Check blog paths directly first (faster than Google query)
    const [directBlogResult, indexedCount, isRunningPaidSearch] = await Promise.all([
      checkBlogPathsDirect(url, 8000),
      getIndexedPageCount(domain),
      businessName ? checkPaidSearch(businessName, domain) : Promise.resolve(false),
    ]);

    // Only fall back to Google blog search if direct paths failed
    const blogResult = directBlogResult.hasBlog
      ? directBlogResult
      : await checkBlogExists(domain);

    return {
      indexedPageCount: indexedCount,
      hasBlog: blogResult.hasBlog,
      blogUrl: blogResult.blogUrl,
      metaTitle,
      metaDescription,
      h1,
      topKeywords,
      isRunningPaidSearch,
      responseTimeMs,
      hasSSL,
      ogTitle,
      ogDescription,
      canonicalUrl,
      hasStructuredData,
      h2Count,
      imagesWithoutAlt,
      errors,
    };
  } catch (err) {
    errors.push({
      code: 'SEO_FAILED',
      message: err instanceof Error ? err.message : String(err),
      scraper: 'seo-traffic',
    });
    return {
      indexedPageCount: null,
      hasBlog: false,
      blogUrl: null,
      metaTitle,
      metaDescription,
      h1,
      topKeywords,
      isRunningPaidSearch: false,
      responseTimeMs,
      hasSSL,
      ogTitle,
      ogDescription,
      canonicalUrl,
      hasStructuredData,
      h2Count,
      imagesWithoutAlt,
      errors,
    };
  }
}
