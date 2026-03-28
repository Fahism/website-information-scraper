import axios from 'axios';
import * as cheerio from 'cheerio';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import { getNextAvailableKey, markKeyExhausted, getNextAvailableKeyExcluding } from '@/lib/searchapi-key-manager';
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
  youtube: /youtube\.com\/(channel\/|c\/|@|user\/)([^/?&"'\s]+)/i,
  linkedin: /linkedin\.com\/company\/([^/?&"'\s]+)/i,
  twitter: /twitter\.com\/(?!share|intent)([^/?&"'\s]+)|x\.com\/(?!share|intent)([^/?&"'\s]+)/i,
};

function findSocialLinksFromHtml(html: string): Record<string, string> {
  const found: Record<string, string> = {};
  const $ = cheerio.load(html);

  // Collect candidate URLs from multiple sources — many Shopify/modern sites
  // never put social links in <a href> at page-load time; they use data attrs,
  // JSON config in <script> tags, or other non-anchor attributes.
  const candidates = new Set<string>();

  // 1. <a href> links
  $('a[href]').each((_, el) => {
    const v = $(el).attr('href');
    if (v) candidates.add(v);
  });

  // 2. data-href, data-url, data-link, content attributes on any element
  $('[data-href],[data-url],[data-link],[content]').each((_, el) => {
    for (const attr of ['data-href', 'data-url', 'data-link', 'content']) {
      const v = $(el).attr(attr);
      if (v) candidates.add(v);
    }
  });

  // 3. Raw HTML scan — catches social URLs in <script> JSON configs,
  //    inline JS, and meta tags (e.g. Shopify theme settings, og:see_also)
  const rawMatches = html.match(
    /https?:\/\/(?:www\.)?(?:facebook|instagram|tiktok|youtube|linkedin|twitter|x)\.com\/[^\s"'<>\\)]+/gi
  );
  if (rawMatches) rawMatches.forEach(u => candidates.add(u));

  for (const [platform, pattern] of Object.entries(SOCIAL_LINK_PATTERNS)) {
    for (const link of candidates) {
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

  // Domain slug (e.g. "mdrnfinancial" from "mdrnfinancial.com") is unique to this specific
  // business and is the best primary search anchor. However short slugs (≤4 chars, e.g. "abc",
  // "go") appear as substrings in countless unrelated URLs and produce noisy results — for those
  // we fall back to the business name as the stage-1 query instead.
  const domainSlug = domain.split('.')[0];
  const domainQuery = domainSlug.length >= 5
    ? `"${domainSlug}" (${siteQuery})`
    : `"${businessName}" (${siteQuery})`;
  const nameQuery = `"${businessName}" (${siteQuery})`;

  // Helper: parse social links out of a SearchAPI organic_results array
  function parseSocialLinks(results: Array<Record<string, unknown>>): Record<string, string> {
    const partial: Record<string, string> = {};
    for (const result of results) {
      const rawUrl = String(result.link ?? '');
      for (const [platform, pattern] of Object.entries(SOCIAL_LINK_PATTERNS)) {
        if (!partial[platform] && pattern.test(rawUrl)) {
          partial[platform] = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
        }
      }
    }
    return partial;
  }

  // Use SearchAPI for Google search — works from any IP including Render's datacenter
  const apiKey = getNextAvailableKey();
  if (apiKey) {
    try {
      // Stage 1: domain-anchored search (most precise — finds the actual business, not same-named competitors)
      const domainResp = await axios.get('https://www.searchapi.io/api/v1/search', {
        params: { engine: 'google', q: domainQuery, num: 10, api_key: apiKey },
        timeout: 15000,
      });
      const domainLinks = parseSocialLinks(domainResp.data?.organic_results ?? []);
      for (const [platform, url] of Object.entries(domainLinks)) {
        found[platform] = url;
      }

      // Stage 2: name-only fallback for any platforms still missing
      // YouTube is intentionally excluded from name-only search — business name abbreviations
      // (e.g. "TWS USA") frequently match unrelated channels (gaming, entertainment, etc.)
      // that share the same acronym. YouTube is only trusted when found via domain-anchored
      // stage 1 search, which ties it to the actual business website.
      const youtubeFoundInStage1 = !!found.youtube;
      const missing = platforms.some(p => {
        const key = p.split('.')[0].replace('/company', '');
        return !found[key === 'linkedin' ? 'linkedin' : key];
      });
      if (missing) {
        const nameResp = await axios.get('https://www.searchapi.io/api/v1/search', {
          params: { engine: 'google', q: nameQuery, num: 10, api_key: apiKey },
          timeout: 15000,
        });
        const nameLinks = parseSocialLinks(nameResp.data?.organic_results ?? []);
        for (const [platform, url] of Object.entries(nameLinks)) {
          // Only fill gaps — don't overwrite domain-anchored results (they're more accurate)
          if (!found[platform]) {
            // Skip YouTube from name-only results — too many false positives
            if (platform === 'youtube' && !youtubeFoundInStage1) continue;
            found[platform] = url;
          }
        }
      }

      return found;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 429 || status === 402) {
          markKeyExhausted(apiKey);
          // Retry once with the next available key
          const retryKey = getNextAvailableKeyExcluding(apiKey);
          if (retryKey) {
            try {
              const retryResp = await axios.get('https://www.searchapi.io/api/v1/search', {
                params: { engine: 'google', q: domainQuery, num: 10, api_key: retryKey },
                timeout: 15000,
              });
              const retryLinks = parseSocialLinks(retryResp.data?.organic_results ?? []);
              for (const [platform, url] of Object.entries(retryLinks)) {
                found[platform] = url;
              }
              return found;
            } catch (retryErr) {
              if (axios.isAxiosError(retryErr)) {
                const s = retryErr.response?.status;
                if (s === 429 || s === 402) markKeyExhausted(retryKey);
              }
            }
          }
        }
      }
    }
  }

  // Fallback: direct browser scraping (works locally, blocked on datacenter IPs)
  // Use domain-anchored query first, name-only as fallback
  const browserYoutubeFoundInStage1 = !!found.youtube;
  for (const isNameQuery of [false, true]) {
    if (Object.keys(found).length >= platforms.length) break;
    const query = isNameQuery ? nameQuery : domainQuery;
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
              // Skip YouTube from name-only results — too many false positives
              if (platform === 'youtube' && isNameQuery && !browserYoutubeFoundInStage1) return;
              found[platform] = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
            }
          }
        });
      } finally {
        await close();
      }
    } catch {
      // Google search failed — try next query
    }
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
    const knownLink = socialLinks[platform as keyof typeof socialLinks];
    if (result.status === 'fulfilled' && result.value) {
      profiles.push(result.value);
    } else if (result.status === 'fulfilled' && result.value === null && knownLink) {
      // Scraper was blocked or timed out, but we know the URL exists — add a stub
      // so the UI shows the social link rather than "No social profiles found"
      profiles.push({
        platform: platform as SocialProfile['platform'],
        url: knownLink,
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
    } else if (result.status === 'rejected') {
      if (knownLink) {
        // Scraper threw an error but we know the URL — add stub so the link is shown
        profiles.push({
          platform: platform as SocialProfile['platform'],
          url: knownLink,
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
      errors.push({
        code: 'SOCIAL_SCRAPE_FAILED',
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        scraper: `social-media/${platform}`,
      });
    }
  }

  return { profiles, errors };
}
