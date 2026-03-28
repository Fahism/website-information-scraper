// ─── Placeholder / fake-data detection ────────────────────────────────────────

/**
 * Email addresses that are clearly template placeholders or example values.
 * These appear in contact-form widgets, themes, and HTML templates and must
 * be rejected so we fall back to Facebook contact info instead.
 */
const PLACEHOLDER_EMAIL_PATTERNS: RegExp[] = [
  // Generic placeholder domains
  /@domain\.com$/i,
  /@example\.com$/i,
  /@example\.org$/i,
  /@example\.net$/i,
  /@test\.com$/i,
  /@website\.com$/i,
  /@yourdomain\./i,
  /@company\.com$/i,
  /@yourcompany\./i,
  // Generic local parts
  /^user@/i,
  /^test@/i,
  /^email@/i,
  /^name@/i,
  /^admin@example/i,
  /^info@example/i,
  /^contact@example/i,
  /yourname/i,
  /youremail/i,
  /your\.email/i,
  /placeholder/i,
];

export function isPlaceholderEmail(email: string): boolean {
  return PLACEHOLDER_EMAIL_PATTERNS.some(p => p.test(email));
}

/**
 * Phone numbers that are obviously fake or test values.
 */
export function isPlaceholderPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return true;
  // All the same digit: 0000000, 1111111, etc.
  if (/^(.)\1+$/.test(digits)) return true;
  return false;
}

// ─── Extractors ────────────────────────────────────────────────────────────────

export function extractPhone(text: string, html?: string): string | null {
  // Priority 1: Extract from <a href="tel:..."> links (most reliable)
  if (html) {
    const telMatch = html.match(/href=["']tel:([^"']+)["']/i);
    if (telMatch) {
      const phone = decodeURIComponent(telMatch[1]).replace(/\s+/g, ' ').trim();
      if (phone.replace(/\D/g, '').length >= 7 && !isPlaceholderPhone(phone)) return phone;
    }
  }

  // Priority 2: International format with + country code
  // Uses [\s.\-–]* (zero or more separator chars) so formats like "+1 747 223 - 8843"
  // (space-dash-space between groups) are captured in full rather than truncated.
  const intlPattern = /\+\d{1,3}[\s.\-–]*\(?\d{1,5}\)?[\s.\-–]*\d{3,8}[\s.\-–]+\d{4,8}/g;
  const intlMatches = text.match(intlPattern);
  if (intlMatches) {
    const best = intlMatches.sort((a, b) => b.length - a.length)[0];
    if (best.replace(/\D/g, '').length >= 7 && !isPlaceholderPhone(best)) return best.trim();
  }

  // Priority 3: US format: (XXX) XXX-XXXX or XXX-XXX-XXXX or XXX.XXX.XXXX
  const usPatterns = [
    /\b(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g,
    /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
  ];
  for (const pattern of usPatterns) {
    const match = text.match(pattern);
    if (match && !isPlaceholderPhone(match[0])) return match[0].replace(/\s+/g, ' ').trim();
  }

  // Priority 4: Generic long digit sequences
  const genericPattern = /\b\d{2,5}[-.\s]\d{4,8}\b/g;
  const genericMatches = text.match(genericPattern);
  if (genericMatches) {
    const best = genericMatches.sort((a, b) => b.length - a.length)[0];
    if (best.replace(/\D/g, '').length >= 7 && !isPlaceholderPhone(best)) return best.trim();
  }

  return null;
}

export function extractEmail(text: string, html?: string): string | null {
  if (html) {
    // Priority 1: <a href="mailto:..."> links (most reliable)
    for (const m of html.matchAll(/href=["']mailto:([^"'?#\s]+)/gi)) {
      const email = m[1].trim().toLowerCase();
      if (email.includes('@') && !isPlaceholderEmail(email)) return email;
    }

    // Priority 2: Email as text content between HTML tags
    for (const m of html.matchAll(/>\s*([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\s*</g)) {
      const email = m[1].toLowerCase();
      if (!isPlaceholderEmail(email)) return email;
    }

    // Priority 2b: Email at end of a text node, right before a closing tag.
    // Catches patterns like "<li>Email: contact@x.com</li>" where a prefix
    // ("Email: ") prevents the sole-content pattern above from matching.
    // Strip <script> blocks first so emails embedded in JS bundles/config
    // (internal/dev addresses) are not mistaken for customer-facing contact emails.
    const htmlNoScript = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    for (const m of htmlNoScript.matchAll(/([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})(?=\s*<)/g)) {
      const candidate = m[1].toLowerCase();
      const tld = candidate.split('.').pop() ?? '';
      if (isConcatenatedTld(tld)) continue;
      if (!isPlaceholderEmail(candidate)) return candidate;
    }
  }

  // Priority 3: Regex from body text (last resort)
  // Guard against TLD concatenation: Cheerio's .text() can merge adjacent inline
  // elements without whitespace, producing "contact@x.comAddress" where "comAddress"
  // is parsed as one TLD. We reject any TLD that starts with a known short TLD and
  // then continues with more letters — that's always a concatenation artifact.
  for (const m of text.matchAll(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g)) {
    const email = m[0].toLowerCase();
    const tld = email.split('.').pop() ?? '';
    if (isConcatenatedTld(tld)) continue;
    if (!isPlaceholderEmail(email)) return email;
  }

  return null;
}

/**
 * Detect TLDs that are actually two words run together due to DOM text concatenation.
 * e.g. "comaddress" = ".com" + "address", "comContact" = ".com" + "Contact"
 * Real TLDs never start with a common short TLD followed by more letters.
 */
function isConcatenatedTld(tld: string): boolean {
  const SHORT_TLDS = ['com', 'org', 'net', 'co', 'io', 'uk', 'us', 'ca', 'au', 'de', 'fr', 'eu', 'in'];
  for (const base of SHORT_TLDS) {
    if (tld.startsWith(base) && tld.length > base.length) return true;
  }
  return false;
}

// ─── Address extraction ────────────────────────────────────────────────────────

const STREET_TYPES =
  'st(?:reet)?|ave(?:nue)?|blvd|boulevard|rd|road|dr(?:ive)?|ln|lane|' +
  'way|ct|court|pl(?:ace)?|hwy|highway|pkwy|parkway|cir(?:cle)?|' +
  'ter(?:race)?|trl|trail';

const UNIT_SUFFIX = '(?:\\s*,?\\s*(?:suite|ste|apt|unit|floor|fl|#)\\s*[\\w-]+)?';

function findStreetAddress(input: string): [string, string, string, string] | null {
  // (?<!\d) prevents matching digits that are part of a phone number or longer
  // numeric sequence (e.g. "65061719" from concatenated DOM text).
  const pattern = new RegExp(
    `(?<!\\d)(\\d{1,5}[A-Za-z]?\\s+(?:[\\w.']+\\s){0,6}(?:${STREET_TYPES})\\.?${UNIT_SUFFIX})` +
    `[,\\s]+([A-Za-z][A-Za-z\\s]{1,30}?),\\s*([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)`,
    'i'
  );

  const candidates = [...input.matchAll(new RegExp(pattern, 'gi'))];
  if (!candidates.length) return null;

  const best = candidates.sort((a, b) => a[1].length - b[1].length)[0];
  return [
    best[1].trim().replace(/[,\s]+$/, ''),
    best[2].trim(),
    best[3],
    best[4],
  ];
}

export function extractAddress(text: string): {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const streetResult = findStreetAddress(text);
  if (streetResult) {
    return {
      address: streetResult[0],
      city: streetResult[1],
      state: streetResult[2],
      zip: streetResult[3],
    };
  }

  const poBoxMatch = text.match(
    /P\.?O\.?\s+Box\s+\d+[.,]?\s+([A-Za-z\s]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i
  );
  if (poBoxMatch) {
    return {
      address: `P.O. Box ${poBoxMatch[0].match(/Box\s+(\d+)/i)?.[1] ?? ''}`.trim(),
      city: poBoxMatch[1].trim(),
      state: poBoxMatch[2],
      zip: poBoxMatch[3],
    };
  }

  const cityStateMatch = text.match(
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/
  );
  if (cityStateMatch) {
    return {
      address: null,
      city: cityStateMatch[1].trim(),
      state: cityStateMatch[2],
      zip: cityStateMatch[3],
    };
  }

  return { address: null, city: null, state: null, zip: null };
}

export function sanitizeStreetAddress(raw: string): string {
  const result = findStreetAddress(raw + ', Placeholder, NY 00000');
  if (result && result[0].length < raw.length) return result[0];
  return raw.replace(/[,\s]+$/, '').trim();
}

// ─── HTML-based address extraction (avoids Cheerio concatenation bug) ─────────

/**
 * Extract address from individual text fragments between HTML tags.
 * This avoids the $('body').text() concatenation problem where phone digits
 * merge with addresses. Tag boundaries (>...<) are natural separators.
 */
export function extractAddressFromHtml(html: string): {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  // Strip <script> and <style> blocks to avoid false matches from JS/CSS
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Extract text fragments between tags (10-300 chars, reasonable address length)
  const fragments: string[] = [];
  for (const m of cleaned.matchAll(/>([^<]{10,300})</g)) {
    const text = m[1].replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) fragments.push(text);
  }

  // Try each fragment individually
  for (const fragment of fragments) {
    const result = findStreetAddress(fragment);
    if (result) {
      return { address: result[0], city: result[1], state: result[2], zip: result[3] };
    }
  }

  // Try combining adjacent fragments (address may span 2 tags):
  // e.g. <div>1719 Ginesi Dr.</div><div>Freehold, NJ 07728</div>
  for (let i = 0; i < fragments.length - 1; i++) {
    const combined = fragments[i] + ', ' + fragments[i + 1];
    const result = findStreetAddress(combined);
    if (result) {
      return { address: result[0], city: result[1], state: result[2], zip: result[3] };
    }
  }

  return { address: null, city: null, state: null, zip: null };
}

/**
 * Extract address from JSON patterns in raw HTML.
 * Catches structured data outside formal JSON-LD blocks (inline scripts,
 * widget configs, etc.) that use Schema.org-style keys.
 */
export function extractAddressFromJsonPatterns(html: string): {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  let address: string | null = null;
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;

  // Prefer Schema.org keys first, then fall back to generic keys.
  // Generic keys like "city" and "state" can match config values (e.g. "city":"City").

  // streetAddress (Schema.org only — no generic equivalent)
  const streetMatch = html.match(/"streetAddress"\s*:\s*"([^"]+)"/i);
  if (streetMatch) address = sanitizeStreetAddress(streetMatch[1].trim());

  // addressLocality first, then "city" as fallback
  const localityMatch = html.match(/"addressLocality"\s*:\s*"([^"]+)"/i);
  if (localityMatch) {
    city = localityMatch[1].trim();
  } else {
    // Only match "city" if the value looks like a real city name (capitalized, 2+ chars, not generic)
    for (const m of html.matchAll(/"city"\s*:\s*"([^"]+)"/gi)) {
      const val = m[1].trim();
      if (val.length >= 2 && val !== 'City' && val !== 'city' && /^[A-Z]/.test(val)) {
        city = val;
        break;
      }
    }
  }

  // addressRegion first, then "state" as fallback
  const regionMatch = html.match(/"addressRegion"\s*:\s*"([^"]{1,30})"/i);
  if (regionMatch) {
    state = regionMatch[1].trim();
  } else {
    for (const m of html.matchAll(/"state"\s*:\s*"([^"]{1,30})"/gi)) {
      const val = m[1].trim();
      if (val.length >= 2 && val !== 'State' && val !== 'state') {
        state = val;
        break;
      }
    }
  }

  // postalCode first, then "zip" / "zipCode" as fallback
  const postalMatch = html.match(/"postalCode"\s*:\s*"([^"]+)"/i);
  if (postalMatch) {
    zip = postalMatch[1].trim();
  } else {
    const zipMatch = html.match(/"(?:zipCode|zip)"\s*:\s*"([^"]+)"/i);
    if (zipMatch) zip = zipMatch[1].trim();
  }

  if (address || city) return { address, city, state, zip };
  return { address: null, city: null, state: null, zip: null };
}
