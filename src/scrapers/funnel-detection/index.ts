import { crawlForFunnelElements } from './page-crawler';
import { scoreFunnel } from './funnel-patterns';
import type { FunnelDetectionResult, FunnelElement, ScraperOptions, ScraperError } from '@/scrapers/types';

export interface FunnelExtraContext {
  hasContactForm?: boolean;
  hasBookingSystem?: boolean;
}

export async function scrapeFunnelDetection(
  url: string,
  options?: ScraperOptions,
  sharedHtml?: string,
  extraContext?: FunnelExtraContext
): Promise<FunnelDetectionResult> {
  const errors: ScraperError[] = [];

  try {
    const { elements, crawledPages } = await crawlForFunnelElements(
      url,
      10,
      options?.timeout ?? 30000,
      sharedHtml
    );

    // Cross-reference with business-info data
    if (extraContext?.hasContactForm) {
      const hasEmailCapture = elements.some(e => e.type === 'email_capture');
      if (!hasEmailCapture) {
        elements.push({ type: 'email_capture', url, notes: 'Detected via business-info contact form' });
      }
    }
    if (extraContext?.hasBookingSystem) {
      const hasBooking = elements.some(e => e.type === 'booking_embed');
      if (!hasBooking) {
        elements.push({ type: 'booking_embed', url, notes: 'Detected via business-info booking system' });
      }
    }

    const funnelScore = scoreFunnel(elements);

    return {
      funnelScore,
      elements,
      crawledPages,
      hasLandingPage: elements.some(e => e.type === 'landing_page'),
      hasLeadMagnet: elements.some(e => e.type === 'lead_magnet'),
      hasEmailCapture: elements.some(e => e.type === 'email_capture'),
      hasBooking: elements.some(e => e.type === 'booking_embed'),
      errors,
    };
  } catch (err) {
    errors.push({
      code: 'FUNNEL_FAILED',
      message: err instanceof Error ? err.message : String(err),
      scraper: 'funnel-detection',
    });
    return {
      funnelScore: 0,
      elements: [],
      crawledPages: 0,
      hasLandingPage: false,
      hasLeadMagnet: false,
      hasEmailCapture: false,
      hasBooking: false,
      errors,
    };
  }
}
