import axios from 'axios';
import * as cheerio from 'cheerio';
import { rateLimitedRequest } from '@/lib/rate-limiter';

interface BuiltWithTech {
  name: string;
  category: string;
}

export async function scrapeBuiltWith(domain: string): Promise<BuiltWithTech[]> {
  const url = `https://builtwith.com/${domain}`;
  const results: BuiltWithTech[] = [];

  try {
    const html = await rateLimitedRequest('builtwith.com', () =>
      axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        timeout: 15000,
      }).then(r => r.data as string)
    );

    const $ = cheerio.load(html);

    // BuiltWith free page lists tech in cards
    $('.tech-card, .card-body h6, [data-tech]').each((_, el) => {
      const name = $(el).text().trim();
      if (name && name.length < 60) {
        results.push({ name, category: 'other' });
      }
    });
  } catch {
    // Silently fail — html-scanner is the primary source
  }

  return results;
}
