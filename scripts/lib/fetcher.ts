/**
 * Rate-limited HTTP client for Slov-Lex static legislation pages.
 *
 * Source host: https://static.slov-lex.sk
 * Access pattern: /static/SK/ZZ/{year}/{number}/ and /static/SK/ZZ/{year}/{number}/{version}.html
 */

const USER_AGENT = 'Ansvar-Law-MCP/1.0 (real-ingestion; legal data pipeline)';
const MIN_DELAY_MS = 1200;
const MAX_RETRIES = 3;

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function applyRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

export interface FetchResult {
  status: number;
  body: string;
  contentType: string;
  url: string;
}

export async function fetchWithRateLimit(url: string): Promise<FetchResult> {
  await applyRateLimit();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
      const backoffMs = Math.pow(2, attempt + 1) * 1000;
      await sleep(backoffMs);
      continue;
    }

    const body = await response.text();
    return {
      status: response.status,
      body,
      contentType: response.headers.get('content-type') ?? '',
      url: response.url,
    };
  }

  throw new Error(`Failed to fetch ${url} after ${MAX_RETRIES + 1} attempts`);
}

export function resolveRelativeUrl(baseUrl: string, href: string): string {
  return new URL(href, baseUrl).toString();
}
