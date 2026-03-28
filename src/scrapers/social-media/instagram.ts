import axios from 'axios';
import * as cheerio from 'cheerio';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import { getPage } from '@/lib/browser-pool';
import { getNextAvailableKey, markKeyExhausted } from '@/lib/searchapi-key-manager';
import type { SocialProfile, ScraperOptions } from '@/scrapers/types';

function extractHandle(url: string): string | null {
  const match = url.match(/instagram\.com\/([^/?&\s]+)/i);
  return match ? match[1].replace(/\/$/, '') : null;
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
  profileUrl: string,
  handle: string
): Promise<{ followers: number | null; bio: string | null }> {
  const apiKey = getNextAvailableKey();
  if (!apiKey) return { followers: null, bio: null };

  try {
    const resp = await axios.get('https://www.searchapi.io/api/v1/search', {
      params: { engine: 'google', q: `site:instagram.com/${handle}`, api_key: apiKey },
      timeout: 15000,
    });

    const results: Array<Record<string, unknown>> = resp.data?.organic_results ?? [];
    // Find the result whose link matches the profile
    const match = results.find(r => {
      const link = String(r.link ?? '');
      return link.includes(`instagram.com/${handle}`);
    }) ?? results[0];

    if (!match) return { followers: null, bio: null };

    const snippet = String(match.snippet ?? '');
    // Snippet format: "338 Followers, 0 Following, 6 Posts - Name (@handle) on Instagram: "bio""
    const followersMatch = snippet.match(/([\d,KkMm.]+)\s+Followers/i);
    const followers = followersMatch ? parseCount(followersMatch[1]) : null;

    // Bio is usually after the dash: "- Name (@handle) on Instagram: "bio text""
    const bioMatch = snippet.match(/on Instagram:\s*["""]?([^"""]+)/i);
    const bio = bioMatch ? bioMatch[1].trim() : (snippet || null);

    return { followers, bio };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 429 || status === 402) markKeyExhausted(apiKey);
    }
    return { followers: null, bio: null };
  }
}

export async function scrapeInstagram(
  profileUrl: string,
  options?: ScraperOptions
): Promise<SocialProfile | null> {
  const handle = extractHandle(profileUrl);
  if (!handle) return null;

  // Primary: SearchAPI Google search (works on Render datacenter IPs)
  const searchResult = await scrapeViaSearchApi(profileUrl, handle);
  if (searchResult.followers !== null) {
    return {
      platform: 'instagram',
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

  // Secondary: Instagram JSON endpoint (may work on fresh IPs)
  try {
    const apiUrl = `https://www.instagram.com/${handle}/?__a=1&__d=dis`;
    const data = await rateLimitedRequest('instagram.com', () =>
      axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'application/json',
        },
        timeout: options?.timeout ?? 15000,
      }).then(r => r.data as Record<string, unknown>)
    );

    const user = (data.graphql as Record<string, unknown>)?.user as Record<string, unknown> | undefined;
    if (user) {
      const followers = (user.edge_followed_by as Record<string, number>)?.count ?? null;
      const following = (user.edge_follow as Record<string, number>)?.count ?? null;
      const posts = (user.edge_owner_to_timeline_media as Record<string, number>)?.count ?? null;
      return {
        platform: 'instagram',
        url: profileUrl,
        handle,
        followers,
        following,
        posts,
        verified: !!(user.is_verified),
        bio: (user.biography as string) ?? null,
        email: null,
        phone: null,
        engagementRate: null,
        recentPosts: [],
      };
    }
  } catch {
    // Fall through to Playwright
  }

  // Last resort: Playwright (works on localhost, blocked on Render)
  const { page, close } = await getPage({ timeout: options?.timeout ?? 30000 });
  try {
    await rateLimitedRequest('instagram.com', () => page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: options?.timeout ?? 30000 }));
    const content = await page.content();
    const $ = cheerio.load(content);

    const followersText = $('meta[property="og:description"]').attr('content') ?? '';
    const followersMatch = followersText.match(/([\d,KkMm.]+)\s*Followers/i);
    const followers = followersMatch ? parseCount(followersMatch[1]) : null;
    const bio = $('meta[property="og:description"]').attr('content') ?? null;

    return {
      platform: 'instagram',
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
