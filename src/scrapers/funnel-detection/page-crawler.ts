import * as cheerio from 'cheerio';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import type { FunnelElement } from '@/scrapers/types';
import { FUNNEL_PATTERNS } from './funnel-patterns';

const PRIORITY_PATTERNS = /book|free|consult|checkout|offer|trial|schedule|appointment|landing|lp\/|contact|quote|estimate/i;

export async function crawlForFunnelElements(
  baseUrl: string,
  maxPages = 10,
  timeout = 30000,
  sharedHtml?: string
): Promise<{ elements: FunnelElement[]; crawledPages: number }> {
  const origin = new URL(baseUrl).origin;
  const visited = new Set<string>();
  const queue: string[] = [baseUrl];
  const elements: FunnelElement[] = [];

  // Priority queue — move high-value URLs to front
  const reprioritize = (urls: string[]) => {
    const priority = urls.filter(u => PRIORITY_PATTERNS.test(u));
    const rest = urls.filter(u => !PRIORITY_PATTERNS.test(u));
    return [...priority, ...rest];
  };

  while (queue.length > 0 && visited.size < maxPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      // Use shared HTML for first page, Playwright for subsequent pages
      let html: string;
      if (sharedHtml && visited.size === 1) {
        html = sharedHtml;
      } else {
        const { page, close } = await getPage({ timeout });
        try {
          await rateLimitedRequest(url, () => page.goto(url, { waitUntil: 'domcontentloaded', timeout }));
          html = await page.content();
        } finally {
          await close();
        }
      }

      // Check each funnel pattern
      for (const pattern of FUNNEL_PATTERNS) {
        const urlMatches = pattern.urlPatterns.some(p => p.test(url));
        const htmlMatches = pattern.htmlPatterns.some(p => p.test(html));
        if (urlMatches || htmlMatches) {
          const alreadyFound = elements.some(e => e.type === pattern.type && e.url === url);
          if (!alreadyFound) {
            elements.push({ type: pattern.type, url, notes: null });
          }
        }
      }

      // Extract internal links for BFS
      if (visited.size < maxPages) {
        const $ = cheerio.load(html);
        const newLinks: string[] = [];
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href') ?? '';
          try {
            const absolute = new URL(href, url).href;
            if (absolute.startsWith(origin) && !visited.has(absolute) && !queue.includes(absolute)) {
              newLinks.push(absolute);
            }
          } catch {
            // invalid URL
          }
        });
        queue.unshift(...reprioritize(newLinks).slice(0, 20));
      }
    } catch {
      // Skip failed pages
    }
  }

  return { elements, crawledPages: visited.size };
}
