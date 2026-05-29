import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import Parser from "rss-parser";
import fs from "fs";
import crypto from "crypto";

const parser = new Parser();

// ── RSS Feed Sources ──────────────────────────────────────────────────────────
const FEEDS: Record<string, string> = {
  India:  "https://news.google.com/rss/search?q=business+finance+india+when:1d&hl=en-IN&gl=IN&ceid=IN:en",
  Global: "https://news.google.com/rss/search?q=global+markets+economy+finance+when:1d&hl=en-US&gl=US&ceid=US:en"
};

// Fallback feeds if primary ones fail (ET and Moneycontrol RSS)
const FALLBACK_FEEDS: Record<string, string> = {
  India:  "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
  Global: "https://feeds.bloomberg.com/markets/news.rss"
};

// ── Server-side cache ─────────────────────────────────────────────────────────
interface CacheEntry { data: any[]; lastUpdated: number; isFetching: boolean; }
const cache: CacheEntry = { data: [], lastUpdated: 0, isFetching: false };
const CACHE_DURATION = 600_000; // 10 minutes

// Stable item IDs — hash of link so deduplication in the client works across refreshes
function stableId(link: string, region: string): string {
  return crypto.createHash("md5").update(`${region}:${link}`).digest("hex").slice(0, 12);
}

function determineType(title: string): "stocks" | "crypto" | "macro" {
  const t = title.toLowerCase();
  if (/(sensex|nifty|sebi|ipo|stock|shares|equity|bse|nse|trading|dividend|mutual.?fund|sip|elss)/i.test(t)) return "stocks";
  if (/(bitcoin|btc|crypto|eth|ethereum|token|defi|binance|blockchain|nft|coin|web3)/i.test(t)) return "crypto";
  return "macro";
}

function checkImpact(title: string): boolean {
  return /\b(surge|crash|plummet|soar|record|rbi|fed|ecb|warns|crisis|breakout|halving|inflation|recession|collapse|rate.?cut|rate.?hike|ban|shock|spike|rally|meltdown)\b/i.test(title);
}

function isUselessTitle(title: string): boolean {
  return /^(Market Data|Business News|Live Updates?|Top News|News|Updates?|Breaking|Latest)$/i.test(title.trim());
}

// ── Fetch one RSS feed, return normalized items ───────────────────────────────
async function fetchFeed(region: string, url: string): Promise<any[]> {
  const items: any[] = [];
  try {
    const feed = await parser.parseURL(url);
    for (const entry of feed.items.slice(0, 18)) {
      const parts = entry.title?.split(" - ") ?? [];
      const cleanTitle = (parts[0] || "No Title").trim();
      const source     = (parts[parts.length - 1] || "Network").trim();

      if (isUselessTitle(cleanTitle) || cleanTitle.length < 10) continue;

      items.push({
        id:          stableId(entry.link ?? cleanTitle, region),
        title:       cleanTitle,
        link:        entry.link ?? "https://news.google.com",
        source:      source,
        type:        determineType(cleanTitle),
        high_impact: checkImpact(cleanTitle),
        region:      region,
        timestamp:   entry.pubDate ? new Date(entry.pubDate).getTime() / 1000 : Date.now() / 1000
      });
    }
  } catch (err) {
    console.error(`[News1] Feed error (${region} – ${url}):`, (err as Error).message);
  }
  return items;
}

// ── Background cache refresher ────────────────────────────────────────────────
const refreshIntel = async () => {
  if (cache.isFetching) return; // prevent concurrent fetches
  cache.isFetching = true;

  try {
    const results = await Promise.all(
      Object.entries(FEEDS).map(async ([region, url]) => {
        let items = await fetchFeed(region, url);
        // If primary feed returned nothing, try fallback
        if (items.length === 0 && FALLBACK_FEEDS[region]) {
          console.warn(`[News1] Primary feed empty for ${region}, trying fallback…`);
          items = await fetchFeed(region, FALLBACK_FEEDS[region]);
        }
        return items;
      })
    );

    const aggregated = results.flat().sort((a, b) => b.timestamp - a.timestamp);

    if (aggregated.length > 0) {
      cache.data        = aggregated;
      cache.lastUpdated = Date.now();
      console.log(`[News1] Cache refreshed — ${aggregated.length} items`);
    } else {
      console.warn("[News1] All feeds returned 0 items — keeping stale cache");
    }
  } catch (e) {
    console.error("[News1] Background fetch crashed:", e);
  } finally {
    cache.isFetching = false;
  }
};

// ── Real market snapshot (static baseline + small random drift for realism) ──
// NOTE: In production, replace this with a real market data API (Yahoo Finance, NSE API, etc.)
const BASE_MARKETS = [
  { name: "NIFTY 50",  baseChange: +0.82, trend: "up"   as const },
  { name: "BANKNIFTY", baseChange: -0.14, trend: "down" as const },
  { name: "SENSEX",    baseChange: +0.75, trend: "up"   as const },
  { name: "BTC/USD",   baseChange: +2.41, trend: "up"   as const },
  { name: "ETH/USD",   baseChange: -1.05, trend: "down" as const },
  { name: "S&P 500",   baseChange: +1.12, trend: "up"   as const },
  { name: "GOLD/OZ",   baseChange: +0.38, trend: "up"   as const },
];

// Apply small ±0.15% drift per poll to simulate live movement
const marketDrift: Record<string, number> = {};
const getMarkets = () =>
  BASE_MARKETS.map(m => {
    if (marketDrift[m.name] === undefined) marketDrift[m.name] = m.baseChange;
    marketDrift[m.name] += (Math.random() - 0.5) * 0.15;   // ±0.075% drift
    const val = Math.abs(marketDrift[m.name]);
    const sign = marketDrift[m.name] >= 0 ? '+' : '-';
    return { name: m.name, value: `${sign}${val.toFixed(2)}%`, trend: marketDrift[m.name] >= 0 ? 'up' : 'down' };
  });

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT ?? "3000", 10);

  app.use(cors());
  app.use(express.json());

  // Vite middleware for development
  let vite: any;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
  }

  // Expose the rest of the FIN-OS ecosystem so the sidebar links work
  const parentDir = path.join(process.cwd(), "..");
  app.use("/html", express.static(path.join(parentDir, "html")));
  app.use("/Porfolio Analyser", express.static(path.join(parentDir, "Porfolio Analyser")));
  app.use("/stock-dashboard", express.static(path.join(parentDir, "stock-dashboard")));
  app.use("/TradeJournal", express.static(path.join(parentDir, "TradeJournal")));
  app.use("/css", express.static(path.join(parentDir, "css")));
  app.use("/js", express.static(path.join(parentDir, "js")));
  app.use("/assets", express.static(path.join(parentDir, "assets")));

  // Initial fetch + schedule periodic refresh every 10 minutes
  refreshIntel();
  setInterval(refreshIntel, CACHE_DURATION);

  // ── API Routes ────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => res.json({ status: "up", items: cache.data.length, cached_ago: Math.floor((Date.now() - cache.lastUpdated) / 1000) }));

  app.get("/api/intel", async (_req, res) => {
    const currentTime = Date.now();

    // Kick off a background refresh if data is stale (but still serve current cache)
    if (!cache.isFetching && currentTime - cache.lastUpdated > CACHE_DURATION) {
      refreshIntel(); // fire-and-forget
    }

    // Wait briefly for the very first fetch to complete (cold start)
    if (cache.data.length === 0) {
      let attempts = 0;
      while (cache.data.length === 0 && attempts < 15) {
        await new Promise(r => setTimeout(r, 300));
        attempts++;
      }
    }

    if (cache.data.length === 0) {
      // Still empty after waiting — return meaningful error so client shows ghost data
      res.status(503).json({ status: "offline", items: [], markets: getMarkets() });
      return;
    }

    res.json({
      status:     "online",
      cached_ago: Math.floor((currentTime - cache.lastUpdated) / 1000),
      items:      cache.data,
      markets:    getMarkets()
    });
  });

  // SPA Fallback / Static Files
  if (process.env.NODE_ENV !== "production") {
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
