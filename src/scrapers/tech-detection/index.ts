import axios from 'axios';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import { scanHtml } from './html-scanner';
import type { TechDetectionResult, TechItem, ScraperOptions, ScraperError } from '@/scrapers/types';

export async function scrapeTechDetection(
  url: string,
  options?: ScraperOptions,
  sharedHtml?: string
): Promise<TechDetectionResult> {
  const errors: ScraperError[] = [];
  const technologies: TechItem[] = [];

  try {
    // Use shared HTML from business-info if available, otherwise fall back to axios
    let html: string;
    if (sharedHtml) {
      html = sharedHtml;
    } else {
      html = await rateLimitedRequest(url, () =>
        axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
          timeout: options?.timeout ?? 20000,
        }).then(r => r.data as string)
      );
    }

    const htmlTechs = scanHtml(html);
    technologies.push(...htmlTechs as TechItem[]);
  } catch (err) {
    errors.push({
      code: 'TECH_SCAN_FAILED',
      message: err instanceof Error ? err.message : String(err),
      scraper: 'tech-detection',
    });
  }

  const hasWordpress = technologies.some(t => t.name === 'WordPress');
  const hasShopify   = technologies.some(t => t.name === 'Shopify');
  const hasWebflow   = technologies.some(t => t.name === 'Webflow');

  const crmTech = technologies.find(t => t.category === 'crm');
  const hasCRM  = !!crmTech;
  const crmName = crmTech?.name ?? null;

  const emailTech = technologies.find(t => t.category === 'email_marketing');
  const hasEmailTool = !!emailTech;
  const emailToolName = emailTech?.name ?? null;

  const pixelTechs = technologies.filter(t => t.category === 'ads_pixel');
  const hasPixel = pixelTechs.length > 0;
  const pixelTypes = pixelTechs.map(t => t.name);

  return {
    technologies,
    hasWordpress,
    hasShopify,
    hasWebflow,
    hasCRM,
    crmName,
    hasEmailTool,
    emailToolName,
    hasPixel,
    pixelTypes,
    errors,
  };
}
