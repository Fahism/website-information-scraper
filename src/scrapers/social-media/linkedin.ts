import axios from 'axios';
import * as cheerio from 'cheerio';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import type { SocialProfile, ScraperOptions } from '@/scrapers/types';

function parseCount(str: string): number | null {
  if (!str) return null;
  const clean = str.replace(/,/g, '').trim();
  const m = clean.match(/([\d.]+)\s*([KkMm]?)/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const suffix = m[2].toUpperCase();
  if (suffix === 'K') return Math.round(num * 1000);
  if (suffix === 'M') return Math.round(num * 1000000);
  return Math.round(num);
}

// Never automate LinkedIn login per CLAUDE.md rules
// Use Google Knowledge Panel to get follower count
export async function scrapeLinkedIn(
  profileUrl: string,
  options?: ScraperOptions
): Promise<SocialProfile | null> {
  const handleMatch = profileUrl.match(/linkedin\.com\/company\/([^/?&\s]+)/i);
  const handle = handleMatch ? handleMatch[1] : null;

  let followers: number | null = null;
  let bio: string | null = null;

  if (handle) {
    try {
      const query = `site:linkedin.com/company/${handle} followers`;
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

      const html = await rateLimitedRequest('google.com', () =>
        axios.get(googleUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
          timeout: options?.timeout ?? 15000,
        }).then(r => r.data as string)
      );

      const $ = cheerio.load(html);
      const pageText = $('body').text();

      const followersMatch = pageText.match(/([\d,KkMm.]+)\s+followers/i);
      if (followersMatch) followers = parseCount(followersMatch[1]);

      // Try to grab description from knowledge panel
      const descEl = $('[data-attrid="description"] span, .kno-rdesc span').first();
      if (descEl.length) bio = descEl.text().trim() || null;
    } catch {
      // Google search failed — return URL-only profile
    }
  }

  return {
    platform: 'linkedin',
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
}
