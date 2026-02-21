/**
 * News & Events Service
 * Fetches crypto news from CryptoCompare (free, no API key required)
 * and formats it for AI consumption in trading decisions.
 */

export interface NewsArticle {
  title: string;
  source: string;
  publishedAt: string; // ISO 8601
  minutesAgo: number;
  categories: string;
  body: string; // truncated
}

export interface NewsResult {
  articles: NewsArticle[];
  formattedContext: string; // ready-to-inject prompt text
}

// In-memory cache: coin symbol → { data, expiry }
const newsCache = new Map<
  string,
  { data: NewsResult; expiry: number }
>();

const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const FETCH_TIMEOUT_MS = 5000; // 5 seconds
const MAX_AGE_HOURS = 24;

function formatTimeAgo(minutesAgo: number): string {
  if (minutesAgo < 1) return "just now";
  if (minutesAgo < 60) return `${Math.floor(minutesAgo)} min ago`;
  const hours = Math.floor(minutesAgo / 60);
  const mins = Math.floor(minutesAgo % 60);
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}min ago` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function fetchCryptoNews(
  market: string,
  maxArticles = 5
): Promise<NewsResult | null> {
  const coin = market.split("-")[0].toUpperCase();

  // Check cache
  const cached = newsCache.get(coin);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(
      `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${coin}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[News] CryptoCompare returned ${res.status}`);
      return null;
    }

    const json = await res.json();
    const rawArticles = json?.Data;

    if (!Array.isArray(rawArticles) || rawArticles.length === 0) {
      return null;
    }

    const now = Date.now();
    const maxAgeMs = MAX_AGE_HOURS * 60 * 60 * 1000;

    const articles: NewsArticle[] = rawArticles
      .filter((a: any) => {
        const publishedMs = (a.published_on || 0) * 1000;
        return now - publishedMs < maxAgeMs;
      })
      .slice(0, maxArticles)
      .map((a: any) => {
        const publishedMs = (a.published_on || 0) * 1000;
        const minutesAgo = (now - publishedMs) / 60000;
        const body = (a.body || "").slice(0, 200);
        return {
          title: a.title || "Untitled",
          source: a.source_info?.name || a.source || "Unknown",
          publishedAt: new Date(publishedMs).toISOString(),
          minutesAgo,
          categories: a.categories || coin,
          body: body.length === 200 ? body + "..." : body,
        };
      });

    if (articles.length === 0) {
      return null;
    }

    // Build formatted context string
    const nowISO = new Date().toISOString();
    const lines: string[] = [
      `NEWS & EVENTS (recent headlines for ${coin}):`,
      `Current time: ${nowISO}`,
      "",
    ];

    articles.forEach((article, i) => {
      lines.push(
        `${i + 1}. [${formatTimeAgo(article.minutesAgo)}] "${article.title}" (${article.source})`
      );
      lines.push(
        `   Published: ${article.publishedAt} | Categories: ${article.categories}`
      );
      if (article.body) {
        lines.push(`   ${article.body}`);
      }
      lines.push("");
    });

    const result: NewsResult = {
      articles,
      formattedContext: lines.join("\n"),
    };

    // Store in cache
    newsCache.set(coin, { data: result, expiry: now + CACHE_TTL_MS });

    return result;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error(`[News] CryptoCompare request timed out for ${coin}`);
    } else {
      console.error(`[News] Failed to fetch news for ${coin}:`, error.message);
    }
    return null;
  }
}
