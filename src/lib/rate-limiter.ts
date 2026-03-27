import Bottleneck from 'bottleneck';

const limiters = new Map<string, Bottleneck>();

const DOMAIN_CONFIGS: Record<string, { minTime: number; maxConcurrent: number }> = {
  'google.com':                    { minTime: 3000,  maxConcurrent: 1 },
  'adstransparency.google.com':    { minTime: 4000,  maxConcurrent: 1 },
  'graph.facebook.com':            { minTime: 1000,  maxConcurrent: 2 },
  'tiktok.com':                    { minTime: 2500,  maxConcurrent: 1 },
  'library.tiktok.com':            { minTime: 2500,  maxConcurrent: 1 },
  'searchapi.io':                  { minTime: 500,   maxConcurrent: 3 },
  'builtwith.com':                 { minTime: 2000,  maxConcurrent: 1 },
  'facebook.com':                  { minTime: 3000,  maxConcurrent: 1 },
  'instagram.com':                 { minTime: 3000,  maxConcurrent: 1 },
  'linkedin.com':                  { minTime: 4000,  maxConcurrent: 1 },
  'youtube.com':                   { minTime: 2000,  maxConcurrent: 2 },
  'x.com':                         { minTime: 3000,  maxConcurrent: 1 },
  'twitter.com':                   { minTime: 3000,  maxConcurrent: 1 },
  'bing.com':                      { minTime: 3000,  maxConcurrent: 1 },
  'html.duckduckgo.com':           { minTime: 2000,  maxConcurrent: 1 },
  'duckduckgo.com':                { minTime: 2000,  maxConcurrent: 1 },
  'default':                       { minTime: 2000,  maxConcurrent: 3 },
};

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return 'default';
  }
}

export function getLimiter(url: string): Bottleneck {
  const domain = extractDomain(url);
  const config = DOMAIN_CONFIGS[domain] ?? DOMAIN_CONFIGS['default'];
  const key = domain;

  if (!limiters.has(key)) {
    limiters.set(key, new Bottleneck({
      minTime: config.minTime,
      maxConcurrent: config.maxConcurrent,
    }));
  }

  return limiters.get(key)!;
}

export async function rateLimitedRequest<T>(
  url: string,
  fn: () => Promise<T>
): Promise<T> {
  const limiter = getLimiter(url);
  return limiter.schedule(fn);
}
