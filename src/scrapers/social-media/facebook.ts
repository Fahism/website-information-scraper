import { getPage } from '@/lib/browser-pool';
import { rateLimitedRequest } from '@/lib/rate-limiter';
import * as cheerio from 'cheerio';
import axios from 'axios';
import type { SocialProfile, ScraperOptions } from '@/scrapers/types';
import { isPlaceholderEmail, isPlaceholderPhone } from '@/scrapers/business-info/contact-extractor';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;

// ─── External API methods for Facebook contact data ─────────────────────────

interface FacebookApiResult {
  email: string | null;
  phone: string | null;
  followers: number | null;
  bio: string | null;
}

/**
 * Fetch page contact info via Apify Facebook Pages Scraper.
 * Requires APIFY_API_TOKEN env var. Free tier: $5/mo credits (~500 pages).
 * No Facebook developer account needed — just sign up at apify.com.
 */
async function fetchFromApify(profileUrl: string): Promise<FacebookApiResult | null> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return null;

  try {
    // Run the Apify actor synchronously and get dataset items directly
    const apiUrl = `https://api.apify.com/v2/acts/apify~facebook-pages-scraper/run-sync-get-dataset-items?token=${token}`;
    const resp = await axios.post(apiUrl, {
      startUrls: [{ url: profileUrl }],
    }, {
      timeout: 20000, // Apify runs may take up to 60s but we cap at 20s to avoid blocking
      headers: { 'Content-Type': 'application/json' },
    });

    const items = resp.data;
    if (!Array.isArray(items) || items.length === 0) return null;

    const page = items[0];

    let email: string | null = null;
    // Apify returns email in various fields
    const rawEmail = page.email || page.emails?.[0] || null;
    if (rawEmail && typeof rawEmail === 'string' && rawEmail.includes('@') && !isPlaceholderEmail(rawEmail.toLowerCase())) {
      email = rawEmail.toLowerCase();
    }

    let phone: string | null = null;
    const rawPhone = page.phone || page.phoneNumber || null;
    if (rawPhone && typeof rawPhone === 'string' && !isPlaceholderPhone(rawPhone)) {
      phone = rawPhone;
    }

    return {
      email,
      phone,
      followers: page.likes || page.followers || null,
      bio: page.about || page.description || null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch page contact info via Facebook Graph API.
 * Requires FACEBOOK_APP_ID and FACEBOOK_APP_SECRET env vars.
 * Uses an app access token (no user login needed, but requires FB developer account).
 */
async function fetchFromGraphApi(handle: string): Promise<FacebookApiResult | null> {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) return null;

  try {
    const accessToken = `${appId}|${appSecret}`;
    const fields = 'name,about,description,emails,phone,single_line_address,fan_count';
    const url = `https://graph.facebook.com/v22.0/${handle}?fields=${fields}&access_token=${accessToken}`;

    const resp = await axios.get(url, { timeout: 10000 });
    const data = resp.data;

    let email: string | null = null;
    if (data.emails && Array.isArray(data.emails) && data.emails.length > 0) {
      const candidate = data.emails[0].toLowerCase();
      if (!isPlaceholderEmail(candidate)) email = candidate;
    }

    let phone: string | null = null;
    if (data.phone && typeof data.phone === 'string') {
      if (!isPlaceholderPhone(data.phone)) phone = data.phone;
    }

    return {
      email,
      phone,
      followers: data.fan_count ?? null,
      bio: data.about || data.description || null,
    };
  } catch {
    return null;
  }
}

/**
 * Try all external APIs to get Facebook page contact data.
 * Priority: Apify (no FB dev account needed) → Graph API (needs FB dev account)
 */
async function fetchFromExternalApi(profileUrl: string, handle: string | null): Promise<FacebookApiResult | null> {
  // Try Apify first (most accessible — no FB developer account needed)
  const apifyResult = await fetchFromApify(profileUrl);
  if (apifyResult && (apifyResult.email || apifyResult.phone)) return apifyResult;

  // Try Graph API as fallback
  if (handle) {
    const graphResult = await fetchFromGraphApi(handle);
    if (graphResult && (graphResult.email || graphResult.phone)) return graphResult;
  }

  return null;
}

/**
 * Extract email and phone from Facebook's embedded JSON data.
 *
 * Facebook server-renders page data inside <script> tags as JSON (relay store,
 * server JS, etc.). This data is available immediately at domcontentloaded —
 * before React hydration, before login walls, before lazy loading.
 *
 * This is by far the most reliable extraction method for Facebook.
 */
function extractContactFromFacebookJson(html: string): { email: string | null; phone: string | null } {
  let email: string | null = null;
  let phone: string | null = null;

  // --- Email ---
  // Patterns found in Facebook's JSON data: "email":"x@y.com", "contact_email":"..."
  const emailPatterns = [
    /"(?:email|contact_email|page_email)"\s*:\s*"([^"]*@[^"]*)"/gi,
    /"(?:email|contact_email|page_email)"\s*:\s*"([^"]*\\u0040[^"]*)"/gi,
  ];
  for (const pattern of emailPatterns) {
    if (email) break;
    for (const m of html.matchAll(pattern)) {
      try {
        // Handle Unicode escapes like \u0040 for @
        const decoded = JSON.parse(`"${m[1]}"`).toLowerCase();
        if (EMAIL_REGEX.test(decoded) && !isPlaceholderEmail(decoded)) {
          email = decoded;
          break;
        }
      } catch {
        const raw = m[1].replace(/\\u0040/gi, '@').toLowerCase();
        if (EMAIL_REGEX.test(raw) && !isPlaceholderEmail(raw)) {
          email = raw;
          break;
        }
      }
    }
  }

  // --- Phone ---
  // Patterns: "phone":"...", "phone_number":"...", "single_line_phone":"..."
  const phonePatterns = [
    /"(?:phone|phone_number|contact_phone|single_line_phone)"\s*:\s*"([^"]+)"/gi,
  ];
  for (const pattern of phonePatterns) {
    if (phone) break;
    for (const m of html.matchAll(pattern)) {
      try {
        const decoded = JSON.parse(`"${m[1]}"`);
        const digits = decoded.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 15 && !isPlaceholderPhone(decoded)) {
          phone = decoded;
          break;
        }
      } catch {
        const digits = m[1].replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 15) {
          phone = m[1];
          break;
        }
      }
    }
  }

  return { email, phone };
}

/**
 * Extract email from rendered HTML — fallback when JSON extraction fails.
 * Handles direct mailto:, Facebook /l.php redirect URLs, and text between tags.
 */
function extractEmailFromHtml(html: string): string | null {
  const candidates: string[] = [];

  // 1. Direct mailto: href
  const mailtoMatch = html.match(/href=["']mailto:([^"'?#\s]+)/i);
  if (mailtoMatch) candidates.push(mailtoMatch[1].trim().toLowerCase());

  // 2. Facebook /l.php redirect: /l.php?u=mailto%3Ainfo%40example.com
  const lphpMailto = html.match(/l\.php\?u=mailto%3A([^%&"'\s]+(?:%40[^&"'\s]+)?)/i);
  if (lphpMailto) {
    try { candidates.push(decodeURIComponent(lphpMailto[1]).toLowerCase()); } catch { /* skip */ }
  }

  // 3. Email as text between tags (with whitespace tolerance)
  const tagMatch = html.match(/>\s*([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\s*</);
  if (tagMatch) candidates.push(tagMatch[1].toLowerCase());

  // 4. Email in quoted attribute value
  const attrMatch = html.match(/["']\s*([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\s*["']/);
  if (attrMatch) candidates.push(attrMatch[1].toLowerCase());

  for (const c of candidates) {
    if (EMAIL_REGEX.test(c) && !isPlaceholderEmail(c)) return c;
  }
  return null;
}

/**
 * Extract phone from rendered HTML — fallback when JSON extraction fails.
 * Handles direct tel:, Facebook /l.php redirect URLs, and text between tags.
 */
function extractPhoneFromHtml(html: string): string | null {
  // 1. Direct tel: href
  const telMatch = html.match(/href=["']tel:([^"']+)/i);
  if (telMatch) {
    const phone = decodeURIComponent(telMatch[1]).trim();
    if (phone.replace(/\D/g, '').length >= 7 && !isPlaceholderPhone(phone)) return phone;
  }

  // 2. Facebook /l.php redirect: /l.php?u=tel%3A%2B44...
  const lphpTel = html.match(/l\.php\?u=tel%3A([^&"'\s]+)/i);
  if (lphpTel) {
    try {
      const phone = decodeURIComponent(lphpTel[1]).trim();
      if (phone.replace(/\D/g, '').length >= 7 && !isPlaceholderPhone(phone)) return phone;
    } catch { /* skip */ }
  }

  // 3. Phone as text between tags (with whitespace tolerance)
  const PHONE_PATTERN = />\s*(\+?\d[\d\s.\-()]{6,20}\d)\s*</g;
  for (const m of html.matchAll(PHONE_PATTERN)) {
    const digits = m[1].replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15 && !isPlaceholderPhone(m[1])) {
      return m[1].trim();
    }
  }

  return null;
}

function extractHandle(url: string): string | null {
  const match = url.match(/facebook\.com\/([^/?&\s]+)/i);
  return match ? match[1].replace(/\/$/, '') : null;
}

function parseCount(str: string): number | null {
  if (!str) return null;
  const clean = str.replace(/,/g, '').trim();
  const m = clean.match(/([\d.]+)\s*([KkMm]?)/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const suffix = m[2].toUpperCase();
  if (suffix === 'K') return Math.round(num * 1000);
  if (suffix === 'M') return Math.round(num * 1000000);
  return Math.round(num);
}

/**
 * Try all extraction methods on a page's HTML.
 * JSON first (fastest, most reliable), then rendered HTML fallback.
 */
function extractAllContact(html: string): { email: string | null; phone: string | null } {
  // JSON data — available immediately, no render needed
  const json = extractContactFromFacebookJson(html);
  let email = json.email;
  let phone = json.phone;

  // HTML fallback — for pages where JSON doesn't contain the data
  if (!email) email = extractEmailFromHtml(html);
  if (!phone) phone = extractPhoneFromHtml(html);

  return { email, phone };
}

// ─── Main scraper ──────────────────────────────────────────────────────────────

export async function scrapeFacebook(
  profileUrl: string,
  options?: ScraperOptions
): Promise<SocialProfile | null> {
  const handle = extractHandle(profileUrl);

  // ── Strategy 1: External API (Apify or Graph API — fastest, most reliable) ──
  // No browser needed. Apify needs APIFY_API_TOKEN, Graph API needs FB dev account.
  const apiData = await fetchFromExternalApi(profileUrl, handle);
  if (apiData && (apiData.email || apiData.phone)) {
    return {
      platform: 'facebook',
      url: profileUrl,
      handle,
      followers: apiData.followers,
      following: null,
      posts: null,
      verified: false,
      bio: apiData.bio,
      email: apiData.email,
      phone: apiData.phone,
      engagementRate: null,
      recentPosts: [],
    };
  }

  // ── Strategy 2: Browser scraping (fallback when Graph API unavailable) ──
  const { page, close } = await getPage({ timeout: options?.timeout ?? 30000 });

  try {
    await rateLimitedRequest('facebook.com', () =>
      page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: options?.timeout ?? 30000 })
    );

    const content = await page.content();
    const $ = cheerio.load(content);
    const bodyText = $('body').text();

    // ── Followers ──
    const ogDesc = $('meta[property="og:description"]').attr('content') ?? '';
    let followers: number | null = null;

    const ogMatch = ogDesc.match(/([\d,KkMm.]+)\s*(likes|followers)/i);
    if (ogMatch) followers = parseCount(ogMatch[1]);

    if (!followers) {
      const patterns = [
        /([\d,.]+[KkMm]?)\s+(?:people\s+)?(?:like|follow)\s+this\s+page/i,
        /([\d,.]+[KkMm]?)\s+followers/i,
        /([\d,.]+[KkMm]?)\s+likes/i,
      ];
      for (const pattern of patterns) {
        const m = bodyText.match(pattern);
        if (m) { followers = parseCount(m[1]); if (followers) break; }
      }
    }

    const bio = ogDesc || null;

    // ── Email & Phone: try JSON + HTML on main profile page ──
    let { email, phone } = extractAllContact(content);

    // ── Fallback: /about page (has Contact Info section) ──
    if (!email || !phone) {
      const aboutUrl = profileUrl.replace(/\/$/, '') + '/about';
      try {
        await rateLimitedRequest('facebook.com', () =>
          page.goto(aboutUrl, { waitUntil: 'domcontentloaded', timeout: options?.timeout ?? 30000 })
        );
        await page.waitForTimeout(2000);
        const aboutContent = await page.content();
        const aboutContact = extractAllContact(aboutContent);
        if (!email) email = aboutContact.email;
        if (!phone) phone = aboutContact.phone;
      } catch {
        // /about failed — keep whatever we have
      }
    }

    // Try external APIs to fill gaps in browser-scraped data
    if (!email || !phone) {
      const apiData = await fetchFromExternalApi(profileUrl, handle);
      if (apiData) {
        if (!email && apiData.email) email = apiData.email;
        if (!phone && apiData.phone) phone = apiData.phone;
        if (!followers && apiData.followers) followers = apiData.followers;
      }
    }

    return {
      platform: 'facebook',
      url: profileUrl,
      handle,
      followers,
      following: null,
      posts: null,
      verified: false,
      bio,
      email,
      phone,
      engagementRate: null,
      recentPosts: [],
    };
  } catch {
    return null;
  } finally {
    await close();
  }
}
