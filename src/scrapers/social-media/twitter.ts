import axios from 'axios';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import { getNextAvailableKey, markKeyExhausted } from '@/lib/searchapi-key-manager';
import type { SocialProfile, ScraperOptions } from '@/scrapers/types';

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
      params: { engine: 'google', q: `site:x.com/${handle} OR site:twitter.com/${handle}`, api_key: apiKey },
      timeout: 15000,
    });

    const results: Array<Record<string, unknown>> = resp.data?.organic_results ?? [];
    const match = results.find(r => {
      const link = String(r.link ?? '');
      return (link.includes(`twitter.com/${handle}`) || link.includes(`x.com/${handle}`)) &&
             !link.includes('/status/');
    }) ?? results[0];

    if (!match) return { followers: null, bio: null };

    const snippet = String(match.snippet ?? '');
    // Twitter snippet format sometimes includes follower count
    const followersMatch = snippet.match(/([\d,.KkMm]+)\s+Followers/i);
    const followers = followersMatch ? parseCount(followersMatch[1]) : null;

    return { followers, bio: null };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 429 || status === 402) markKeyExhausted(apiKey);
    }
    return { followers: null, bio: null };
  }
}

export async function scrapeTwitter(
  profileUrl: string,
  options?: ScraperOptions
): Promise<SocialProfile | null> {
  const handleMatch = profileUrl.match(/(?:twitter|x)\.com\/([^/?&\s]+)/i);
  const handle = handleMatch ? handleMatch[1] : null;

  if (!handle) return null;

  // Confirm profile exists via oEmbed (works from any IP)
  try {
    const oEmbedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://twitter.com/${handle}`)}`;
    await rateLimitedRequest('twitter.com', () =>
      axios.get(oEmbedUrl, { timeout: options?.timeout ?? 15000 })
    );
  } catch {
    return null;
  }

  // Primary: SearchAPI Google search for follower count (works on Render)
  const searchResult = await scrapeViaSearchApi(handle);
  if (searchResult.followers !== null) {
    return {
      platform: 'twitter',
      url: profileUrl,
      handle,
      followers: searchResult.followers,
      following: null,
      posts: null,
      verified: false,
      bio: null,
      email: null,
      phone: null,
      engagementRate: null,
      recentPosts: [],
    };
  }

  // Fallback: Playwright + Nitter (works locally; Playwright blocked on Render)
  let followers: number | null = null;
  const { page, close } = await getPage({ timeout: options?.timeout ?? 30000 });
  try {
    await rateLimitedRequest('x.com', () =>
      page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: options?.timeout ?? 30000 })
    );
    await page.waitForTimeout(2000);

    const followerSelectors = [
      '[data-testid="UserProfileHeader_Items"] a[href*="followers"]',
      'a[href$="/followers"] span',
      `a[href="/${handle}/followers"] span`,
    ];
    for (const sel of followerSelectors) {
      const text = await page.$eval(sel, el => el.textContent?.trim() ?? '').catch(() => '');
      if (text) { followers = parseCount(text); if (followers) break; }
    }

    if (!followers) {
      try {
        const nitterHtml = await rateLimitedRequest('twitter.com', () =>
          axios.get(`https://nitter.net/${handle}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000,
          }).then(r => r.data as string)
        );
        const nitterMatch = nitterHtml.match(/title="([\d,]+)\s+Followers"/i);
        if (nitterMatch) followers = parseCount(nitterMatch[1]);
      } catch {
        // nitter unavailable
      }
    }
  } catch {
    // page load failed
  } finally {
    await close();
  }

  return {
    platform: 'twitter',
    url: profileUrl,
    handle,
    followers,
    following: null,
    posts: null,
    verified: false,
    bio: null,
    email: null,
    phone: null,
    engagementRate: null,
    recentPosts: [],
  };
}
