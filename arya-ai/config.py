"""
Arya AI — Central Configuration
All settings in one place. Override via .env file.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent

# ── Server ────────────────────────────────────────────────────────────────────
PORT          = int(os.getenv("ARYA_PORT", 7475))
HOST          = os.getenv("ARYA_HOST", "0.0.0.0")
CORS_ORIGINS  = os.getenv("ARYA_CORS", "http://localhost:7474,http://127.0.0.1:7474").split(",")

# ── Ollama ────────────────────────────────────────────────────────────────────
OLLAMA_BASE   = os.getenv("OLLAMA_BASE", "http://localhost:11434")
OLLAMA_MODEL  = os.getenv("OLLAMA_MODEL", "qwen3:14b")

# ── Database ──────────────────────────────────────────────────────────────────
DB_PATH       = BASE_DIR / "db" / "arya.db"

# ── Supabase (only used by /api/portfolio/summary — every other endpoint here
# is public market data with no user namespace) ──────────────────────────────
SUPABASE_URL       = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY  = os.getenv("SUPABASE_ANON_KEY", "")

# ── Cache TTLs (seconds) ──────────────────────────────────────────────────────
TTL_QUOTE     = int(os.getenv("TTL_QUOTE",   10))      # live stock quotes
TTL_INDEX     = int(os.getenv("TTL_INDEX",   15))      # Nifty / Sensex
TTL_MF_NAV    = int(os.getenv("TTL_MF_NAV",  3600))    # mutual fund NAVs (1h)
TTL_GOLD      = int(os.getenv("TTL_GOLD",    300))     # gold/silver (5m)
TTL_CRYPTO    = int(os.getenv("TTL_CRYPTO",  60))      # crypto (1m)
TTL_FX        = int(os.getenv("TTL_FX",      300))     # forex (5m)
TTL_NEWS      = int(os.getenv("TTL_NEWS",    600))     # news feed (10m)
TTL_SEARCH    = int(os.getenv("TTL_SEARCH",  300))     # web search results (5m)
TTL_TECHNICAL = int(os.getenv("TTL_TECHNICAL", 300))   # TA signals (5m)

# ── NSE session ───────────────────────────────────────────────────────────────
NSE_BASE      = "https://www.nseindia.com"
NSE_HEADERS   = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.nseindia.com/",
    "Connection": "keep-alive",
}

# ── CoinGecko (free, no key) ──────────────────────────────────────────────────
COINGECKO_BASE = "https://api.coingecko.com/api/v3"

# ── AMFI (official, free) ─────────────────────────────────────────────────────
AMFI_NAV_URL  = "https://www.amfiindia.com/spages/NAVAll.txt"

# ── News RSS feeds ────────────────────────────────────────────────────────────
NEWS_FEEDS = [
    {"name": "Economic Times Markets", "url": "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"},
    {"name": "Moneycontrol Markets",   "url": "https://www.moneycontrol.com/rss/marketsnews.xml"},
    {"name": "Business Standard",      "url": "https://www.business-standard.com/rss/markets-106.rss"},
    {"name": "Mint Markets",           "url": "https://www.livemint.com/rss/markets"},
    {"name": "NDTV Profit",            "url": "https://feeds.feedburner.com/ndtvprofit-latest"},
]

# ── DuckDuckGo search ─────────────────────────────────────────────────────────
DDGO_URL      = "https://html.duckduckgo.com/html/"
SEARCH_TIMEOUT = int(os.getenv("SEARCH_TIMEOUT", 8))

# ── Report output ─────────────────────────────────────────────────────────────
REPORTS_DIR   = BASE_DIR / "reports" / "output"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

# ── yfinance suffix map ───────────────────────────────────────────────────────
NSE_SUFFIX    = ".NS"
BSE_SUFFIX    = ".BO"

# ── Indian major indices (yfinance tickers) ───────────────────────────────────
INDEX_TICKERS = {
    "NIFTY 50":     "^NSEI",
    "SENSEX":       "^BSESN",
    "NIFTY BANK":   "^NSEBANK",
    "NIFTY IT":     "^CNXIT",
    "NIFTY MIDCAP": "NIFTYMIDCAP50.NS",
    "INDIA VIX":    "^INDIAVIX",
}
