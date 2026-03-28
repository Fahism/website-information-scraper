import * as cheerio from 'cheerio';
import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import { extractPhone, extractEmail, extractAddress, extractAddressFromHtml, extractAddressFromJsonPatterns, sanitizeStreetAddress, isPlaceholderEmail, isPlaceholderPhone } from './contact-extractor';
import type { BusinessInfoResult, ScraperOptions, ScraperError } from '@/scrapers/types';

const BOOKING_PATTERNS: Record<string, RegExp> = {
  'calendly': /calendly\.com/i,
  'gohighlevel': /msgsndr\.com|gohighlevel\.com/i,
  'acuity': /acuityscheduling\.com/i,
  'simplybook': /simplybook\.me/i,
  'mindbody': /mindbodyonline\.com/i,
  'square': /squareup\.com|squaresolutions/i,
};

function detectBooking(html: string): { hasBooking: boolean; platform: string | null } {
  for (const [platform, pattern] of Object.entries(BOOKING_PATTERNS)) {
    if (pattern.test(html)) return { hasBooking: true, platform };
  }
  return { hasBooking: false, platform: null };
}

function detectIndustry(text: string): string | null {
  const industries: Record<string, string[]> = {
    // Specific industries first — scored by keyword hit count so order doesn't bias results
    'financial_services': ['financial planning', 'financial advisor', 'financial consultant', 'financial services', 'loan', 'mortgage', 'insurance', 'investment', 'debt relief', 'solar loan', 'wealth management', 'credit repair', 'refinance', 'lender', 'banking'],
    'solar': ['solar panel', 'solar energy', 'solar loan', 'solar payment', 'solar system', 'solar relief', 'solar bill'],
    'home_services': ['roofing', 'plumbing', 'hvac', 'electrician', 'cleaning service', 'landscaping', 'painting contractor', 'general contractor'],
    'legal': ['attorney', 'lawyer', 'law firm', 'legal services', 'litigation'],
    'medical': ['clinic', 'doctor', 'dental', 'medical center', 'therapy', 'chiropractic', 'healthcare'],
    'real_estate': ['real estate', 'realtor', 'property management', 'homes for sale', 'mls listing'],
    'fitness': ['gym', 'fitness center', 'personal trainer', 'yoga studio', 'pilates'],
    'salon': ['hair salon', 'nail salon', 'day spa', 'beauty salon'],
    // "restaurant" uses only unambiguous terms — "menu" and "food" removed (too generic)
    'restaurant': ['restaurant', 'cafe', 'dining room', 'dine in', 'takeout', 'cuisine', 'eatery', 'bistro'],
    'retail': ['online store', 'add to cart', 'shop now', 'boutique'],
  };

  const lower = text.toLowerCase();

  // Score every industry by how many of its keywords appear in the text.
  // The one with the highest count wins — prevents a single generic word
  // (like "menu" or "health") from misclassifying the business.
  let bestIndustry: string | null = null;
  let bestScore = 0;

  for (const [industry, keywords] of Object.entries(industries)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndustry = industry;
    }
  }

  return bestIndustry;
}

interface SchemaOrgData {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  email?: string | null;
  phone?: string | null;
  googleRating?: number | null;
  reviewCount?: number | null;
  businessHours?: string | null;
}

function extractSchemaOrg($: ReturnType<typeof cheerio.load>): SchemaOrgData {
  const result: SchemaOrgData = {};

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() ?? '';
      const json = JSON.parse(raw);
      const items = Array.isArray(json) ? json : [json];

      for (const item of items) {
        const type = item['@type'] ?? '';
        const isLocalBusiness = ['LocalBusiness', 'Organization', 'Store', 'Restaurant', 'MedicalBusiness', 'HomeAndConstructionBusiness', 'LegalService', 'HealthAndBeautyBusiness'].some(t => type.includes(t));
        if (!isLocalBusiness) continue;

        const addr = item.address;
        if (addr) {
          const raw = addr.streetAddress ?? null;
          result.address = raw ? sanitizeStreetAddress(raw) : null;
          result.city = addr.addressLocality ?? null;
          result.state = addr.addressRegion ?? null;
          result.zip = addr.postalCode ?? null;
        }

        const rating = item.aggregateRating;
        if (rating) {
          const rv = parseFloat(rating.ratingValue);
          const rc = parseInt(rating.reviewCount ?? rating.ratingCount ?? '0', 10);
          if (!isNaN(rv)) result.googleRating = rv;
          if (!isNaN(rc) && rc > 0) result.reviewCount = rc;
        }

        const hours = item.openingHours;
        if (hours) {
          result.businessHours = Array.isArray(hours) ? hours.join(', ') : String(hours);
        }

        // Email from schema
        const schemaEmail = item.email ?? null;
        if (schemaEmail && typeof schemaEmail === 'string' && schemaEmail.includes('@') && !isPlaceholderEmail(schemaEmail)) {
          result.email = schemaEmail.trim().toLowerCase();
        }

        // Phone from schema
        const schemaPhone = item.telephone ?? item.phone ?? null;
        if (schemaPhone && typeof schemaPhone === 'string' && !isPlaceholderPhone(schemaPhone)) {
          result.phone = schemaPhone.trim();
        }
      }
    } catch {
      // skip malformed JSON-LD
    }
  });

  return result;
}

export async function scrapeBusinessInfo(
  url: string,
  options?: ScraperOptions
): Promise<BusinessInfoResult & { _html: string }> {
  const errors: ScraperError[] = [];
  const timeout = options?.timeout ?? 30000;
  let phone: string | null = null;
  let email: string | null = null;
  let address: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;
  let businessName: string | null = null;
  let description: string | null = null;
  let hasContactForm = false;
  let hasBookingSystem = false;
  let bookingPlatform: string | null = null;
  let googleMapsUrl: string | null = null;
  let industry: string | null = null;
  let googleRating: number | null = null;
  let reviewCount: number | null = null;
  let businessHours: string | null = null;

  let renderedHtml = '';
  const { page, close } = await getPage({ timeout });
  try {
    await rateLimitedRequest(url, () => page.goto(url, { waitUntil: 'domcontentloaded', timeout }));
    // Wait for any client-side redirects or navigation to settle before reading content.
    // Some sites (e.g. optima-ect.com) do JS redirects that cause page.content() to
    // fail with "page is navigating and changing the content".
    await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
    const html = await page.content();
    renderedHtml = html;
    const $ = cheerio.load(html);

    // Business name: try og:site_name, then title
    businessName =
      $('meta[property="og:site_name"]').attr('content') ||
      $('title').text().split(/[|\-–]/)[0].trim() ||
      null;

    // Description
    description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null;

    // Schema.org extraction (highest quality data — run first)
    const schema = extractSchemaOrg($);
    if (schema.address) address = schema.address;
    if (schema.city) city = schema.city;
    if (schema.state) state = schema.state;
    if (schema.zip) zip = schema.zip;
    if (schema.googleRating != null) googleRating = schema.googleRating;
    if (schema.reviewCount != null) reviewCount = schema.reviewCount;
    if (schema.businessHours) businessHours = schema.businessHours;

    // Use schema email/phone as highest priority (most reliable structured data)
    if (schema.email) email = schema.email;
    if (schema.phone) phone = schema.phone;

    // Extract from HTML/text as fallback
    const bodyText = $('body').text();
    if (!phone) phone = extractPhone(bodyText, html);
    if (!email) email = extractEmail(bodyText, html);

    // Fallback: search raw HTML for JSON patterns like "email":"..." or "contactEmail":"..."
    if (!email) {
      for (const m of html.matchAll(/"(?:email|contactEmail|contact_email)"\s*:\s*"([^"]+@[^"]+)"/gi)) {
        const candidate = m[1].trim().toLowerCase();
        if (candidate.includes('@') && !isPlaceholderEmail(candidate)) {
          email = candidate;
          break;
        }
      }
    }
    if (!phone) {
      for (const m of html.matchAll(/"(?:telephone|phone|phoneNumber|phone_number|contactPhone)"\s*:\s*"([^"]+)"/gi)) {
        const candidate = m[1].trim();
        if (!isPlaceholderPhone(candidate) && candidate.replace(/\D/g, '').length >= 7) {
          phone = candidate;
          break;
        }
      }
    }

    // Multi-layer address extraction cascade (each layer only runs if previous didn't fill address+city)

    // Layer 2: JSON patterns in raw HTML (catches structured data outside JSON-LD blocks)
    if (!address || !city) {
      const jsonAddr = extractAddressFromJsonPatterns(html);
      if (!address && jsonAddr.address) address = jsonAddr.address;
      if (!city && jsonAddr.city) city = jsonAddr.city;
      if (!state && jsonAddr.state) state = jsonAddr.state;
      if (!zip && jsonAddr.zip) zip = jsonAddr.zip;
    }

    // Layer 3: HTML fragment-based extraction (searches text between tags, avoids concatenation bug)
    if (!address || !city) {
      const htmlAddr = extractAddressFromHtml(html);
      if (!address && htmlAddr.address) address = htmlAddr.address;
      if (!city && htmlAddr.city) city = htmlAddr.city;
      if (!state && htmlAddr.state) state = htmlAddr.state;
      if (!zip && htmlAddr.zip) zip = htmlAddr.zip;
    }

    // Layer 4: Regex on body text (last resort — strip phone digits first to prevent contamination)
    if (!address || !city) {
      let cleanedText = bodyText;
      if (phone) {
        // Remove the phone in its original format and as raw digits
        cleanedText = cleanedText.replace(new RegExp(phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
        const phoneDigits = phone.replace(/\D/g, '');
        if (phoneDigits.length >= 7) {
          cleanedText = cleanedText.replace(new RegExp(phoneDigits, 'g'), ' ');
        }
      }
      const addrResult = extractAddress(cleanedText);
      if (!address) address = addrResult.address;
      if (!city) city = addrResult.city;
      if (!state) state = addrResult.state;
      if (!zip) zip = addrResult.zip;
    }

    // ── Internal contact page scraping ──────────────────────────────────────
    // If email is still missing, check internal contact/about pages on the same site.
    // Many businesses only show their email on dedicated contact pages.
    if (!email) {
      const domain = new URL(url).hostname;
      const $2 = cheerio.load(html);

      // Find contact/about page links
      const contactPageUrls = new Set<string>();
      $2('a[href]').each((_, el) => {
        const href = $2(el).attr('href') ?? '';
        const text = $2(el).text().toLowerCase().trim();
        const hrefLower = href.toLowerCase();
        if (
          hrefLower.includes('contact') || hrefLower.includes('contacto') ||
          hrefLower.includes('kontakt') || hrefLower.includes('about') ||
          hrefLower.includes('sobre') ||
          text.includes('contact') || text.includes('about us') ||
          text.includes('get in touch') || text.includes('reach us')
        ) {
          try {
            const fullUrl = new URL(href, url).href;
            if (new URL(fullUrl).hostname === domain) contactPageUrls.add(fullUrl.split('#')[0]);
          } catch { /* invalid URL */ }
        }
      });

      // Scrape up to 3 contact pages for email
      for (const contactUrl of [...contactPageUrls].slice(0, 3)) {
        if (email) break;
        try {
          await rateLimitedRequest(contactUrl, () =>
            page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
          );
          await page.waitForLoadState('load', { timeout: 8000 }).catch(() => {});
          const contactHtml = await page.content();

          // Check mailto links first (most reliable)
          for (const m of contactHtml.matchAll(/href=["']mailto:([^"'?#\s]+)/gi)) {
            const candidate = m[1].trim().toLowerCase();
            if (candidate.includes('@') && !isPlaceholderEmail(candidate)) {
              email = candidate;
              break;
            }
          }
          if (email) break;

          // Check tag text
          for (const m of contactHtml.matchAll(/>\s*([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\s*</g)) {
            const candidate = m[1].toLowerCase();
            if (!isPlaceholderEmail(candidate)) {
              email = candidate;
              break;
            }
          }
          if (email) break;

          // Check JSON patterns
          for (const m of contactHtml.matchAll(/"(?:email|contactEmail|contact_email)"\s*:\s*"([^"]+@[^"]+)"/gi)) {
            const candidate = m[1].trim().toLowerCase();
            if (!isPlaceholderEmail(candidate)) {
              email = candidate;
              break;
            }
          }
        } catch { /* skip failed pages */ }
      }
    }

    // Industry
    industry = detectIndustry(businessName + ' ' + description + ' ' + bodyText.slice(0, 2000));

    // Contact form
    hasContactForm = $('form').length > 0 &&
      ($('input[type="email"]').length > 0 || $('textarea').length > 0);

    // Booking system
    const booking = detectBooking(html);
    hasBookingSystem = booking.hasBooking;
    bookingPlatform = booking.platform;

    // Google Maps embed
    const mapIframe = $('iframe[src*="google.com/maps"], iframe[src*="maps.google"]');
    if (mapIframe.length > 0) {
      googleMapsUrl = mapIframe.first().attr('src') ?? null;
    }
  } catch (err) {
    errors.push({
      code: 'SCRAPE_FAILED',
      message: err instanceof Error ? err.message : String(err),
      scraper: 'business-info',
    });
  } finally {
    await close();
  }

  return {
    businessName,
    phone,
    email,
    address,
    city,
    state,
    zip,
    hasContactForm,
    hasBookingSystem,
    bookingPlatform,
    googleMapsUrl,
    description,
    industry,
    googleRating,
    reviewCount,
    businessHours,
    errors,
    _html: renderedHtml,
  };
}
