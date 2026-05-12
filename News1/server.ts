import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import Parser from "rss-parser";
import fs from "fs";

const parser = new Parser();

const FEEDS = {
  India: "https://news.google.com/rss/search?q=business+finance+india+when:1d&hl=en-IN&gl=IN&ceid=IN:en",
  Global: "https://news.google.com/rss/search?q=global+markets+economy+finance+when:1d&hl=en-US&gl=US&ceid=US:en"
};

// Caching logic
let cache: { data: any[]; lastUpdated: number } = {
  data: [],
  lastUpdated: 0
};
const CACHE_DURATION = 600000; // 10 minutes in ms

function determineType(title: string): "stocks" | "crypto" | "macro" {
  const t = title.toLowerCase();
  if (/(sensex|nifty|stock|ipo|market|shares|equity|trading)/i.test(t)) return "stocks";
  if (/(bitcoin|crypto|eth|token|binance|blockchain|coin)/i.test(t)) return "crypto";
  return "macro";
}

function checkImpact(title: string): boolean {
  const impactKeywords = ['surge', 'crash', 'plummets', 'soars', 'record', 'rate', 'rbi', 'fed', 'warns', 'crisis', 'breakout', 'hits', 'drops', 'halving', 'inflation', 'recession', 'collapse'];
  const t = title.toLowerCase();
  return impactKeywords.some(word => t.includes(word));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // Background fetcher
  const refreshIntel = async () => {
    try {
      const aggregatedNews: any[] = [];
      const fetchPromises = Object.entries(FEEDS).map(async ([region, url]) => {
        try {
          const feed = await parser.parseURL(url);
          feed.items.slice(0, 15).forEach((entry, i) => {
            const cleanTitle = (entry.title?.split(" - ")[0] || "No Title").trim();
            const source = (entry.title?.split(" - ").pop() || "Network").trim();
            
            // Filter out generic filler titles from RSS feeds
            const isUseless = /^(Market Data|Business News|Live Updates|Top News|News|Updates)$/i.test(cleanTitle);
            if (isUseless) return;

            aggregatedNews.push({
              id: `${region}_${i}_${Date.now()}`,
              title: cleanTitle,
              link: entry.link,
              source: source,
              type: determineType(cleanTitle),
              high_impact: checkImpact(cleanTitle),
              region: region,
              timestamp: entry.pubDate ? new Date(entry.pubDate).getTime() / 1000 : Date.now() / 1000
            });
          });
        } catch (err) {
          console.error(`Error fetching ${region} feed:`, err);
        }
      });

      await Promise.all(fetchPromises);
      aggregatedNews.sort((a, b) => b.timestamp - a.timestamp);
      
      if (aggregatedNews.length > 0) {
        cache.data = aggregatedNews;
        cache.lastUpdated = Date.now();
      }
    } catch (e) {
      console.error("Background fetch crashed:", e);
    }
  };

  // Initial fetch
  refreshIntel();

  // Simulated Market Data Generator
  const getMarkets = () => [
    { name: "NIFTY 50", value: "+0.82%", trend: "up" },
    { name: "BANKNIFTY", value: "-0.14%", trend: "down" },
    { name: "SENSEX", value: "+0.75%", trend: "up" },
    { name: "BTC/USD", value: "+2.41%", trend: "up" },
    { name: "ETH/USD", value: "-1.05%", trend: "down" },
    { name: "S&P 500", value: "+1.12%", trend: "up" },
    { name: "GOLD/OZ", value: "+0.38%", trend: "up" }
  ].map(m => ({
    ...m,
    value: `${m.trend === 'up' ? '+' : '-'}${(Math.random() * 2 + 0.1).toFixed(2)}%`
  }));

  // API Routes
  app.get("/api/health", (req, res) => res.json({ status: "up" }));

  app.get("/api/intel", async (req, res) => {
    const currentTime = Date.now();
    if (currentTime - cache.lastUpdated > CACHE_DURATION) {
      refreshIntel();
    }

    if (cache.data.length === 0) {
      let attempts = 0;
      while (cache.data.length === 0 && attempts < 10) {
        await new Promise(r => setTimeout(r, 200));
        attempts++;
      }
    }

    res.json({
      status: "online",
      cached_ago: Math.floor((currentTime - cache.lastUpdated) / 1000),
      items: cache.data,
      markets: getMarkets()
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
