import axios from 'axios';
import { getNextAvailableKey, markKeyExhausted } from '@/lib/searchapi-key-manager';
import * as cheerio from 'cheerio';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';

// SearchAPI Google: works from any IP including Render datacenter
async function searchViaApi(query: string): Promise<Record<string, unknown> | null> {
  const apiKey = getNextAvailableKey();
  if (!apiKey) return null;

  try {
    const resp = await axios.get('https://www.searchapi.io/api/v1/search', {
      params: { engine: 'google', q: query, num: 5, api_key: apiKey },
      timeout: 15000,
    });
    return resp.data as Record<string, unknown>;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 429 || status === 402) markKeyExhausted(apiKey);
    }
    return null;
  }
}

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
  // Primary: SearchAPI (works on Render)
  const data = await searchViaApi(`site:${domain}`);
  if (data) {
    const info = data.search_information as Record<string, unknown> | undefined;
    // SearchAPI returns total_results in search_information
    const total = info?.total_results ?? info?.organic_results_state;
    if (typeof total === 'number') return total;
    if (typeof total === 'string') {
      const n = parseInt(total.replace(/[^\d]/g, ''), 10);
      if (!isNaN(n)) return n;
    }
    // Also check organic results count as a minimum estimate
    const organic = data.organic_results as unknown[];
    if (Array.isArray(organic) && organic.length > 0) {
      // Try to parse from result stats string if available
      const stats = String(info?.query_displayed ?? '');
      const m = stats.match(/([\d,]+)/);
      if (m) return parseInt(m[1].replace(/,/g, ''), 10);
      // Return result count as minimum
      return organic.length;
    }
  }

  // Fallback: Playwright (works locally, likely blocked on Render)
  try {
    const html = await fetchWithPlaywright(`https://www.google.com/search?q=${encodeURIComponent(`site:${domain}`)}`);
    const $ = cheerio.load(html);
    const resultStats = $('#result-stats').text();
    const m1 = resultStats.match(/About ([\d,]+) results/);
    if (m1) return parseInt(m1[1].replace(/,/g, ''), 10);
    const m2 = html.match(/About ([\d,]+) results/i);
    if (m2) return parseInt(m2[1].replace(/,/g, ''), 10);
  } catch {
    // Playwright failed
  }

  return null;
}

export async function checkBlogExists(domain: string): Promise<{ hasBlog: boolean; blogUrl: string | null }> {
  // Primary: SearchAPI (works on Render)
  const data = await searchViaApi(`site:${domain} inurl:blog`);
  if (data) {
    const results = data.organic_results as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(results) && results.length > 0) {
      const blogResult = results.find(r => {
        const link = String(r.link ?? '');
        return link.includes(domain) && link.includes('blog');
      });
      if (blogResult) {
        return { hasBlog: true, blogUrl: String(blogResult.link) };
      }
    }
  }

  // Fallback: Playwright (works locally)
  try {
    const html = await fetchWithPlaywright(
      `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} inurl:blog`)}&num=3`
    );
    const $ = cheerio.load(html);
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const match = href.match(/\/url\?q=([^&]+)/);
      if (match) {
        try {
          const decoded = decodeURIComponent(match[1]);
          if (decoded.includes(domain) && decoded.includes('blog')) links.push(decoded);
        } catch { /* skip */ }
      }
    });
    return { hasBlog: links.length > 0, blogUrl: links[0] ?? null };
  } catch {
    return { hasBlog: false, blogUrl: null };
  }
}

export async function checkPaidSearch(businessName: string, domain: string): Promise<boolean> {
  // Primary: SearchAPI (works on Render) — check if ads appear in results
  const data = await searchViaApi(businessName);
  if (data) {
    // SearchAPI returns paid ads in 'ads' field
    const ads = data.ads as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(ads) && ads.length > 0) {
      return ads.some(ad => String(ad.link ?? ad.displayed_link ?? '').includes(domain));
    }
    // Also check if any organic result with ads marker exists
    const organic = data.organic_results as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(organic)) {
      const html = JSON.stringify(organic);
      return html.includes('data-text-ad') || (html.includes('tads') && html.includes(domain));
    }
  }

  // Fallback: Playwright (works locally)
  try {
    const html = await fetchWithPlaywright(
      `https://www.google.com/search?q=${encodeURIComponent(businessName)}`
    );
    return html.includes('data-text-ad') || (html.includes('tads') && html.includes(domain));
  } catch {
    return false;
  }
}
