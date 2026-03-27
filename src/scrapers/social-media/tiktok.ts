import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
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

export async function scrapeTikTok(
  profileUrl: string,
  options?: ScraperOptions
): Promise<SocialProfile | null> {
  const handle = extractHandle(profileUrl);
  const { page, close } = await getPage({ timeout: options?.timeout ?? 30000 });

  try {
    await rateLimitedRequest('tiktok.com', () =>
      page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: options?.timeout ?? 30000 })
    );

    // Wait for dynamic content to load
    await page.waitForTimeout(3000);

    const content = await page.content();
    const $ = cheerio.load(content);

    // Multiple selector fallbacks for followers
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
