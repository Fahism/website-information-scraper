import axios from 'axios';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import { getNextAvailableKey, markKeyExhausted } from '@/lib/searchapi-key-manager';
import * as cheerio from 'cheerio';
import type { SocialProfile, ScraperOptions } from '@/scrapers/types';

function extractHandle(url: string): string | null {
  const match = url.match(/tiktok\.com\/@([^/?&\s]+)/i);
  return match ? match[1] : null;
}

function parseCount(str: string): number | null {
  if (!str) return null;
  const clean = str.replace(/,/g, '').trim();
  const m = clean.match(/([\d.]+)\s*([KkMm]?)/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const suffix = m[2].toUpperCase();
  if (suffix === 'K') return Math.round(num * 1000);
  if (suffix === 'M') return Math.round(num * 1000000);
  return Math.round(num);
}

// SearchAPI Google: works from any IP including Render datacenter
async function scrapeViaSearchApi(
  handle: string
): Promise<{ followers: number | null; bio: string | null }> {
  const apiKey = getNextAvailableKey();
  if (!apiKey) return { followers: null, bio: null };

  try {
    const resp = await axios.get('https://www.searchapi.io/api/v1/search', {
      params: { engine: 'google', q: `site:tiktok.com/@${handle}`, api_key: apiKey },
      timeout: 15000,
    });

    const results: Array<Record<string, unknown>> = resp.data?.organic_results ?? [];
    const match = results.find(r => String(r.link ?? '').includes(`tiktok.com/@${handle}`)) ?? results[0];
    if (!match) return { followers: null, bio: null };

    const snippet = String(match.snippet ?? '');
    // TikTok snippet format: "X Followers · Y Following · Z Likes. Bio text."
    const followersMatch = snippet.match(/([\d,.KkMm]+)\s+Followers/i);
    const followers = followersMatch ? parseCount(followersMatch[1]) : null;

    // Bio is after the stats separator
    const bioMatch = snippet.replace(/[\d,.KkMm]+\s+Followers.*?[.·]\s*/i, '').trim();
    const bio = bioMatch.length > 5 ? bioMatch.slice(0, 300) : null;

    return { followers, bio };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 429 || status === 402) markKeyExhausted(apiKey);
    }
    return { followers: null, bio: null };
  }
}

export async function scrapeTikTok(
  profileUrl: string,
  options?: ScraperOptions
): Promise<SocialProfile | null> {
  const handle = extractHandle(profileUrl);
  if (!handle) return null;

  // Primary: SearchAPI Google search (works on Render datacenter IPs)
  const searchResult = await scrapeViaSearchApi(handle);
  if (searchResult.followers !== null) {
    return {
      platform: 'tiktok',
      url: profileUrl,
      handle,
      followers: searchResult.followers,
      following: null,
      posts: null,
      verified: false,
      bio: searchResult.bio,
      email: null,
      phone: null,
      engagementRate: null,
      recentPosts: [],
    };
  }

  // Fallback: Playwright (works on localhost, blocked on Render)
  const { page, close } = await getPage({ timeout: options?.timeout ?? 30000 });
  try {
    await rateLimitedRequest('tiktok.com', () =>
      page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: options?.timeout ?? 30000 })
    );
    await page.waitForTimeout(3000);

    const content = await page.content();
    const $ = cheerio.load(content);

    let followersText = '';
    const followerSelectors = [
      '[data-e2e="followers-count"]',
      '[data-e2e="user-stats"] strong:first-child',
      '.user-stats strong',
      '[title*="Follower"]',
    ];
    for (const sel of followerSelectors) {
      const text = $(sel).first().text().trim();
      if (text) { followersText = text; break; }
    }
    const followers = parseCount(followersText);
    const bio = $('[data-e2e="user-bio"]').text().trim() || null;

    return {
      platform: 'tiktok',
      url: profileUrl,
      handle,
      followers,
      following: null,
      posts: null,
      verified: false,
      bio,
      email: null,
      phone: null,
      engagementRate: null,
      recentPosts: [],
    };
  } catch {
    return null;
  } finally {
    await close();
  }
}
