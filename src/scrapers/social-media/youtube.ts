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

export async function scrapeYouTube(
  channelUrl: string,
  options?: ScraperOptions
): Promise<SocialProfile | null> {
  try {
    const html = await rateLimitedRequest('youtube.com', () =>
      axios.get(channelUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: options?.timeout ?? 20000,
      }).then(r => r.data as string)
    );

    const $ = cheerio.load(html);
    const ogTitle = $('meta[property="og:title"]').attr('content') ?? null;
    const description = $('meta[property="og:description"]').attr('content') ?? null;

    // Multi-pattern subscriber extraction
    let followers: number | null = null;

    // Pattern 1: simpleText JSON
    const p1 = html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/i);
    if (p1) followers = parseCount(p1[1].replace(/[^\d.KkMm]/gi, ''));

    // Pattern 2: accessibility label
    if (!followers) {
      const p2 = html.match(/"accessibilityData":\{"label":"([\d,.]+[KkMm]?)\s+subscribers?"/i);
      if (p2) followers = parseCount(p2[1]);
    }

    // Pattern 3: og:description fallback
    if (!followers && description) {
      const p3 = description.match(/([\d,.]+[KkMm]?)\s+subscribers?/i);
      if (p3) followers = parseCount(p3[1]);
    }

    // Video count extraction
    let posts: number | null = null;
    const videoCountMatch = html.match(/"videosCountText":\{"runs":\[\{"text":"([\d,]+)"/i);
    if (videoCountMatch) {
      posts = parseInt(videoCountMatch[1].replace(/,/g, ''), 10) || null;
    }

    const handleMatch = channelUrl.match(/youtube\.com\/(channel\/|c\/|@|user\/)?([^/?&\s]+)/i);
    const handle = handleMatch ? handleMatch[2] : null;

    return {
      platform: 'youtube',
      url: channelUrl,
      handle,
      followers,
      following: null,
      posts,
      verified: false,
      bio: description,
      email: null,
      phone: null,
      engagementRate: null,
      recentPosts: [],
    };
  } catch {
    return null;
  }
}
