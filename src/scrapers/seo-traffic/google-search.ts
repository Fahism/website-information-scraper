import * as cheerio from 'cheerio';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';

async function fetchWithPlaywright(url: string, timeout = 15000): Promise<string> {
  const { page, close } = await getPage({ timeout });
  try {
    await rateLimitedRequest(new URL(url).hostname, () =>
      page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    );
    return await page.content();
  } finally {
    await close();
  }
}

export async function getIndexedPageCount(domain: string): Promise<number | null> {
  const query = `site:${domain}`;
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  try {
    const html = await fetchWithPlaywright(googleUrl);

    const $ = cheerio.load(html);

    // Pattern 1: #result-stats
    const resultStats = $('#result-stats').text();
    const m1 = resultStats.match(/About ([\d,]+) results/);
    if (m1) return parseInt(m1[1].replace(/,/g, ''), 10);

    // Pattern 2: raw HTML regex
    const m2 = html.match(/About ([\d,]+) results/i);
    if (m2) return parseInt(m2[1].replace(/,/g, ''), 10);

    // Pattern 3: results without "About"
    const m3 = html.match(/([\d,]+) results/i);
    if (m3) return parseInt(m3[1].replace(/,/g, ''), 10);
  } catch {
    // Google failed — try Bing
  }

  // Bing fallback
  try {
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(`site:${domain}`)}`;
    const bingHtml = await fetchWithPlaywright(bingUrl);

    const $b = cheerio.load(bingHtml);
    const bingCount = $b('.sb_count').first().text();
    const bingMatch = bingCount.match(/([\d,]+)/);
    if (bingMatch) return parseInt(bingMatch[1].replace(/,/g, ''), 10);
  } catch {
    // Bing also failed
  }

  return null;
}

export async function checkBlogExists(domain: string): Promise<{ hasBlog: boolean; blogUrl: string | null }> {
  const query = `site:${domain} inurl:blog`;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=3`;

  try {
    const html = await fetchWithPlaywright(url);

    const $ = cheerio.load(html);
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const match = href.match(/\/url\?q=([^&]+)/);
      if (match) {
        try {
          const decoded = decodeURIComponent(match[1]);
          if (decoded.includes(domain) && decoded.includes('blog')) {
            links.push(decoded);
          }
        } catch {
          // ignore
        }
      }
    });

    return { hasBlog: links.length > 0, blogUrl: links[0] ?? null };
  } catch {
    return { hasBlog: false, blogUrl: null };
  }
}

export async function checkPaidSearch(businessName: string, domain: string): Promise<boolean> {
  const query = businessName;
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  try {
    const html = await fetchWithPlaywright(url);

    return html.includes('data-text-ad') || (html.includes('tads') && html.includes(domain));
  } catch {
    return false;
  }
}
