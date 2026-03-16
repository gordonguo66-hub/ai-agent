import { NextResponse } from "next/server";

interface CoinGeckoArticle {
  id: number;
  title?: string;
  description?: string;
  url?: string;
  news_site?: string;
  created_at?: number; // unix seconds
  updated_at?: number;
}

interface NewsItem {
  title: string;
  source: string;
  url: string;
  timeAgo: string;
  sentiment: "positive" | "negative" | "normal";
  categories: string;
}

const POSITIVE_KEYWORDS = [
  "surge", "rally", "bull", "breakout", "gain", "soar", "jump", "rise",
  "adoption", "approve", "launch", "partner", "upgrade", "record high",
  "all-time high", "ath", "growth", "recover", "boost", "milestone",
];

const NEGATIVE_KEYWORDS = [
  "crash", "drop", "fall", "bear", "dump", "hack", "exploit", "scam",
  "fraud", "ban", "restrict", "fine", "lawsuit", "loss", "plunge",
  "liquidat", "bankrupt", "collapse", "suspend", "vulnerability",
];

function classifySentiment(title: string): "positive" | "negative" | "normal" {
  const lower = title.toLowerCase();
  const posScore = POSITIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
  const negScore = NEGATIVE_KEYWORDS.filter((k) => lower.includes(k)).length;
  if (posScore > negScore) return "positive";
  if (negScore > posScore) return "negative";
  return "normal";
}

function formatTimeAgo(minutesAgo: number): string {
  if (minutesAgo < 1) return "JUST NOW";
  if (minutesAgo < 60) return `${Math.floor(minutesAgo)} MIN AGO`;
  const hours = Math.floor(minutesAgo / 60);
  if (hours < 24) return `${hours} HOUR${hours > 1 ? "S" : ""} AGO`;
  const days = Math.floor(hours / 24);
  return `${days} DAY${days > 1 ? "S" : ""} AGO`;
}

// Server-side cache
let cachedNews: { items: NewsItem[]; expiry: number } | null = null;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

export async function GET() {
  // Return cache if fresh
  if (cachedNews && Date.now() < cachedNews.expiry) {
    return NextResponse.json({ articles: cachedNews.items });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(
      "https://api.coingecko.com/api/v3/news?page=1",
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ articles: [] });
    }

    const json = await res.json();
    const raw: CoinGeckoArticle[] = json?.data;

    if (!Array.isArray(raw)) {
      return NextResponse.json({ articles: [] });
    }

    const now = Date.now();

    const items: NewsItem[] = raw
      .slice(0, 12)
      .map((a) => {
        const publishedMs = (a.created_at || 0) * 1000;
        const minutesAgo = publishedMs > 0 ? (now - publishedMs) / 60000 : 0;
        const title = a.title || "Untitled";
        return {
          title,
          source: a.news_site || "Unknown",
          url: a.url || "",
          timeAgo: formatTimeAgo(minutesAgo),
          sentiment: classifySentiment(title),
          categories: "CRYPTO",
        };
      });

    cachedNews = { items, expiry: now + CACHE_TTL };
    return NextResponse.json({ articles: items });
  } catch {
    return NextResponse.json({ articles: [] });
  }
}
