import axios from 'axios';
import { getNextAvailableKey, markKeyExhausted } from '@/lib/searchapi-key-manager';
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
// Use SearchAPI Google to get follower count from knowledge panel snippet
export async function scrapeLinkedIn(
  profileUrl: string,
  options?: ScraperOptions
): Promise<SocialProfile | null> {
  const handleMatch = profileUrl.match(/linkedin\.com\/company\/([^/?&\s]+)/i);
  const handle = handleMatch ? handleMatch[1] : null;

  let followers: number | null = null;
  let bio: string | null = null;

  if (handle) {
    const apiKey = getNextAvailableKey();
    if (apiKey) {
      try {
        const resp = await axios.get('https://www.searchapi.io/api/v1/search', {
          params: {
            engine: 'google',
            q: `${handle.replace(/-/g, ' ')} linkedin followers`,
            api_key: apiKey,
          },
          timeout: options?.timeout ?? 15000,
        });

        const results: Array<Record<string, unknown>> = resp.data?.organic_results ?? [];
        // Find a result whose link contains the LinkedIn company page
        const match = results.find(r => {
          const link = String(r.link ?? '');
          return link.includes('linkedin.com/company/');
        }) ?? results[0];

        if (match) {
          const snippet = String(match.snippet ?? '');
          // Snippet format: "Company Name. Industry. Location X followers. Description"
          const followersMatch = snippet.match(/([\d,KkMm.]+)\s+followers/i);
          if (followersMatch) followers = parseCount(followersMatch[1]);

          // Bio is everything after the followers line
          const afterFollowers = snippet.replace(/.*\d[\d,.]*[KkMm]?\s+followers\.\s*/i, '').trim();
          if (afterFollowers.length > 10) bio = afterFollowers.slice(0, 300);
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          if (status === 429 || status === 402) markKeyExhausted(apiKey);
        }
      }
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
