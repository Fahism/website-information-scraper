import * as cheerio from 'cheerio';

const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'your', 'have', 'more', 'will', 'about',
  'their', 'been', 'when', 'what', 'which', 'they', 'them', 'than', 'then',
  'also', 'into', 'over', 'some', 'just', 'like', 'such', 'both', 'each',
  'very', 'most', 'here', 'were', 'make', 'does', 'call', 'work', 'help',
  'free', 'best', 'home', 'need', 'would', 'could', 'should', 'these',
  'those', 'other', 'only', 'same', 'well', 'back', 'even', 'good', 'much',
  'many', 'still', 'come', 'know', 'take', 'want', 'give', 'first', 'last',
  'long', 'great', 'little', 'right', 'find', 'here', 'thing', 'tell',
  'look', 'because', 'being', 'leave', 'could', 'there', 'before', 'after',
  'where', 'really', 'write', 'become', 'much', 'between', 'never', 'under',
  'open', 'seem', 'together', 'always', 'keep', 'start', 'turn', 'show',
  'every', 'play', 'read', 'click', 'learn', 'page', 'site', 'website',
  'privacy', 'policy', 'terms', 'conditions', 'copyright', 'reserved',
  'menu', 'navigation', 'skip', 'content', 'toggle', 'close', 'search',
  // Web/URL noise
  'http', 'https', 'webp', 'jpeg', 'uploads', 'jquery', 'google', 'bootstrap',
  'webpack', 'fonts', 'static', 'assets', 'images', 'media', 'thumb', 'icon',
  'logo', 'small', 'large', 'medium', 'null', 'true', 'false', 'undefined',
  'script', 'style', 'class', 'function', 'window', 'document', 'return',
  'const', 'lets', 'vars', 'type', 'data', 'item', 'list', 'text', 'link',
  'href', 'src', 'view', 'load', 'send', 'form', 'input', 'button', 'label',
  'title', 'block', 'inline', 'flex', 'grid', 'color', 'width', 'height',
  'margin', 'padding', 'font', 'size', 'bold', 'auto', 'none', 'rgba', 'calc',
  'span', 'section', 'footer', 'header',
]);

// File extension patterns to filter out (matched anywhere in the keyword)
const FILE_EXT_PATTERN = /\.(webp|jpe?g|png|svg|gif|mp4|webm|css|js|json|woff2?|ttf|eot)$/i;

function extractDomainRoot(html: string): string | null {
  const $ = cheerio.load(html);
  const canonical = $('link[rel="canonical"]').attr('href') ?? '';
  const ogUrl = $('meta[property="og:url"]').attr('content') ?? '';
  const candidates = [canonical, ogUrl].filter(Boolean);
  for (const c of candidates) {
    try {
      const hostname = new URL(c).hostname.replace(/^www\./, '');
      // Return the second-level domain label (e.g. "example" from "example.com")
      return hostname.split('.')[0].toLowerCase();
    } catch {
      // ignore
    }
  }
  return null;
}

export function extractKeywords(html: string, limit = 10): string[] {
  const $ = cheerio.load(html);
  const domainRoot = extractDomainRoot(html);

  const textSources: string[] = [];

  // Title tag
  const title = $('title').text().trim();
  if (title) textSources.push(title, title); // double-weight

  // Meta description
  const metaDesc = $('meta[name="description"]').attr('content') ?? '';
  if (metaDesc) textSources.push(metaDesc, metaDesc); // double-weight

  // Meta keywords
  const metaKeywords = $('meta[name="keywords"]').attr('content') ?? '';
  if (metaKeywords) textSources.push(metaKeywords, metaKeywords, metaKeywords); // triple-weight

  // Headings (h1 triple-weight, h2 double-weight, h3 single)
  $('h1').each((_, el) => {
    const t = $(el).text().trim();
    if (t) { textSources.push(t, t, t); }
  });
  $('h2').each((_, el) => {
    const t = $(el).text().trim();
    if (t) { textSources.push(t, t); }
  });
  $('h3').each((_, el) => {
    const t = $(el).text().trim();
    if (t) { textSources.push(t); }
  });

  // Image alt attributes
  $('img[alt]').each((_, el) => {
    const alt = $(el).attr('alt') ?? '';
    if (alt && alt.length > 3 && alt.length < 100) textSources.push(alt);
  });

  // Body text (first 3000 chars)
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 3000);
  if (bodyText) textSources.push(bodyText);

  const fullText = textSources.join(' ').toLowerCase();
  const words = fullText.match(/\b[a-z]{4,}\b/g) ?? [];

  // Single word frequency
  const freq = new Map<string, number>();
  for (const word of words) {
    if (!STOPWORDS.has(word)) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }

  // Bigram extraction (2-word phrases)
  const cleanWords = words.filter(w => !STOPWORDS.has(w));
  for (let i = 0; i < cleanWords.length - 1; i++) {
    const bigram = `${cleanWords[i]} ${cleanWords[i + 1]}`;
    freq.set(bigram, (freq.get(bigram) ?? 0) + 1);
  }

  return [...freq.entries()]
    .filter(([, count]) => count >= 2) // only words/phrases appearing 2+ times
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    // Post-filter: remove domain fragments, pure digit strings, and file extension noise
    .filter(word => {
      // Remove all-digit words
      if (/^\d+$/.test(word)) return false;
      // Remove words containing file extension patterns
      if (FILE_EXT_PATTERN.test(word)) return false;
      // Remove words that are or contain the domain hostname root
      if (domainRoot && word.split(' ').some(part => part === domainRoot)) return false;
      return true;
    })
    .slice(0, limit);
}
