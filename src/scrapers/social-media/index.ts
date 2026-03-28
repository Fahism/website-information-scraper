import axios from 'axios';
import * as cheerio from 'cheerio';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import { getNextAvailableKey, markKeyExhausted } from '@/lib/searchapi-key-manager';
import { scrapeFacebook } from './facebook';
import { scrapeInstagram } from './instagram';
import { scrapeTikTok } from './tiktok';
import { scrapeYouTube } from './youtube';
import { scrapeLinkedIn } from './linkedin';
import { scrapeTwitter } from './twitter';
import type { SocialMediaResult, SocialProfile, ScraperOptions, ScraperError } from '@/scrapers/types';

const SOCIAL_LINK_PATTERNS: Record<string, RegExp> = {
  facebook: /facebook\.com\/(?!sharer|share|dialog|login|video|watch|groups|events|pages\/category)([^/?&"'\s]+)/i,
  instagram: /instagram\.com\/([^/?&"'\s]+)/i,
  tiktok: /tiktok\.com\/@([^/?&"'\s]+)/i,
  youtube: /youtube\.com\/(channel\/|c\/|@|user\/)?([^/?&"'\s]+)/i,
  linkedin: /linkedin\.com\/company\/([^/?&"'\s]+)/i,
  twitter: /twitter\.com\/(?!share|intent)([^/?&"'\s]+)|x\.com\/(?!share|intent)([^/?&"'\s]+)/i,
};

function findSocialLinksFromHtml(html: string): Record<string, string> {
  const found: Record<string, string> = {};
  const $ = cheerio.load(html);
  const allLinks: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (href) allLinks.push(href);
  });

  for (const [platform, pattern] of Object.entries(SOCIAL_LINK_PATTERNS)) {
    for (const link of allLinks) {
      const match = link.match(pattern);
      if (match) {
        found[platform] = link.startsWith('http') ? link : `https://${link}`;
        break;
      }
    }
  }

  return found;
}

async function googleSearchSocialProfiles(
  domain: string,
  businessName: string
): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  const platforms = ['facebook.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'linkedin.com/company'];
  const siteQuery = platforms.map(p => `site:${p}`).join(' OR ');
  const query = `"${businessName}" ${siteQuery}`;

  // Use SearchAPI for Google search — works from any IP including Render's datacenter
  const apiKey = getNextAvailableKey();
  if (apiKey) {
    try {
      const resp = await axios.get('https://www.searchapi.io/api/v1/search', {
        params: { engine: 'google', q: query, num: 10, api_key: apiKey },
        timeout: 15000,
      });
      const results: Array<Record<string, unknown>> = resp.data?.organic_results ?? [];
      for (const result of results) {
        const rawUrl = String(result.link ?? '');
        for (const [platform, pattern] of Object.entries(SOCIAL_LINK_PATTERNS)) {
          if (!found[platform] && pattern.test(rawUrl)) {
            found[platform] = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
          }
        }
      }
      return found;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 429 || status === 402) markKeyExhausted(apiKey);
      }
    }
  }

  // Fallback: direct browser scraping (works locally, blocked on datacenter IPs)
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
  try {
    const { page, close } = await getPage({ timeout: 15000 });
    try {
      await rateLimitedRequest('google.com', () =>
        page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      );
      const html = await page.content();
      const $ = cheerio.load(html);
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        const match = href.match(/\/url\?q=([^&]+)/);
        const rawUrl = match ? decodeURIComponent(match[1]) : href;
        for (const [platform, pattern] of Object.entries(SOCIAL_LINK_PATTERNS)) {
          if (!found[platform] && pattern.test(rawUrl)) {
            found[platform] = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
          }
        }
      });
    } finally {
      await close();
    }
  } catch {
    // Google search failed — return whatever we have
  }

  return found;
}

export async function scrapeSocialMedia(
  url: string,
  options?: ScraperOptions,
  sharedHtml?: string,
  businessName?: string | null
): Promise<SocialMediaResult> {
  const errors: ScraperError[] = [];
  const profiles: SocialProfile[] = [];

  // Step 1: Find social links from website HTML
  let socialLinks: Record<string, string> = {};
  if (sharedHtml) {
    socialLinks = findSocialLinksFromHtml(sharedHtml);
  } else {
    // Fallback: fetch with Playwright if no shared HTML
    try {
      const { page, close } = await getPage({ timeout: options?.timeout ?? 15000 });
      try {
        await rateLimitedRequest(url, () =>
          page.goto(url, { waitUntil: 'domcontentloaded', timeout: options?.timeout ?? 15000 })
        );
        const html = await page.content();
        socialLinks = findSocialLinksFromHtml(html);
      } finally {
        await close();
      }
    } catch {
      // Failed to fetch — socialLinks stays empty
    }
  }

  // Step 2: If few social links found (or no Facebook), try Google search fallback
  const needsFacebookSearch = !socialLinks.facebook;
  if (Object.keys(socialLinks).length < 2 || needsFacebookSearch) {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      // Use real business name from scraped data if available — "Optima Electrical Training"
      // is far more searchable than "optima ect" derived from the domain.
      const nameForSearch = businessName || domain.split('.')[0].replace(/[-_]/g, ' ');
      const googleResults = await googleSearchSocialProfiles(domain, nameForSearch);
      // Merge — don't overwrite links already found from the website
      for (const [platform, profileUrl] of Object.entries(googleResults)) {
        if (!socialLinks[platform]) {
          socialLinks[platform] = profileUrl;
        }
      }
    } catch {
      // Google fallback failed
    }
  }

  const scrapers: Array<[string, () => Promise<SocialProfile | null>]> = [
    ['instagram', () => socialLinks.instagram ? scrapeInstagram(socialLinks.instagram, options) : Promise.resolve(null)],
    ['facebook', () => socialLinks.facebook ? scrapeFacebook(socialLinks.facebook, options) : Promise.resolve(null)],
    ['tiktok', () => socialLinks.tiktok ? scrapeTikTok(socialLinks.tiktok, options) : Promise.resolve(null)],
    ['youtube', () => socialLinks.youtube ? scrapeYouTube(socialLinks.youtube, options) : Promise.resolve(null)],
    ['linkedin', () => socialLinks.linkedin ? scrapeLinkedIn(socialLinks.linkedin, options) : Promise.resolve(null)],
    ['twitter', () => socialLinks.twitter ? scrapeTwitter(socialLinks.twitter, options) : Promise.resolve(null)],
  ];

  // Wrap each platform scraper with a hard timeout so a hung browser page
  // cannot block the entire social media scraper indefinitely
  const scraperTimeout = Math.min(options?.timeout ?? 20000, 20000);
  const withTimeout = <T>(p: Promise<T>): Promise<T | null> =>
    Promise.race([
      p,
      new Promise<null>(resolve => setTimeout(() => resolve(null), scraperTimeout)),
    ]);

  const results = await Promise.allSettled(scrapers.map(([, fn]) => withTimeout(fn())));

  for (let i = 0; i < results.length; i++) {
    const [platform] = scrapers[i];
    const result = results[i];
    if (result.status === 'fulfilled' && result.value) {
      profiles.push(result.value);
    } else if (result.status === 'rejected') {
      errors.push({
        code: 'SOCIAL_SCRAPE_FAILED',
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        scraper: `social-media/${platform}`,
      });
    }
  }

  return { profiles, errors };
}
