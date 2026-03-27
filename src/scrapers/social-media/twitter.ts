import axios from 'axios';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
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

export async function scrapeTwitter(
  profileUrl: string,
  options?: ScraperOptions
): Promise<SocialProfile | null> {
  const handleMatch = profileUrl.match(/(?:twitter|x)\.com\/([^/?&\s]+)/i);
  const handle = handleMatch ? handleMatch[1] : null;

  if (!handle) return null;

  // Confirm profile exists via oEmbed
  try {
    const oEmbedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://twitter.com/${handle}`)}`;
    await rateLimitedRequest('twitter.com', () =>
      axios.get(oEmbedUrl, { timeout: options?.timeout ?? 15000 })
    );
  } catch {
    return null;
  }

  // Try to get follower count from x.com profile page
  let followers: number | null = null;
  const { page, close } = await getPage({ timeout: options?.timeout ?? 30000 });
  try {
    await rateLimitedRequest('x.com', () =>
      page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: options?.timeout ?? 30000 })
    );

    await page.waitForTimeout(2000);

    // Multiple selector fallbacks
    const followerSelectors = [
      '[data-testid="UserProfileHeader_Items"] a[href*="followers"]',
      'a[href$="/followers"] span',
      `a[href="/${handle}/followers"] span`,
    ];

    for (const sel of followerSelectors) {
      try {
        const text = await page.$eval(sel, el => el.textContent?.trim() ?? '').catch(() => '');
        if (text) {
          followers = parseCount(text);
          if (followers) break;
        }
      } catch {
        // try next selector
      }
    }

    // Nitter fallback if still no followers
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
    // page load failed — still return profile
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
