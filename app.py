import os
import time
import socket
import threading

import feedparser
from flask import Flask, jsonify
from flask_cors import CORS

# ── App setup ───────────────────────────────────────────────────────────────

app = Flask(__name__)

# Fix [05]: Restrict CORS to known origins instead of wildcard "*"
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000"
).split(",")

CORS(app, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}})

# Fix [01]: SSL override block removed entirely.
# The global ssl._create_default_https_context override disabled certificate
# validation for the whole process, enabling MITM attacks.
# If you hit SSL errors on macOS during development, run once in terminal:
#   /Applications/Python\ 3.x/Install\ Certificates.command

feedparser.USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# ── Feed config ─────────────────────────────────────────────────────────────

FEEDS = {
    "India": (
        "https://news.google.com/rss/search"
        "?q=business+finance+india+when:1d&hl=en-IN&gl=IN&ceid=IN:en"
    ),
    "Global": (
        "https://news.google.com/rss/search"
        "?q=global+markets+economy+finance+when:1d&hl=en-US&gl=US&ceid=US:en"
    ),
}

# Fix [06]: Protect the shared cache dict with a lock to prevent the
# thundering-herd race condition under concurrent Flask threads.
cache = {"data": [], "last_updated": 0}
_cache_lock = threading.Lock()

CACHE_DURATION = 600  # 10 minutes

# ── Helpers ─────────────────────────────────────────────────────────────────

def determine_type(title):
    t = title.lower()
    if any(w in t for w in ["sensex", "nifty", "stock", "ipo", "market", "shares"]):
        return "stocks"
    if any(w in t for w in ["bitcoin", "crypto", "eth", "token", "binance"]):
        return "crypto"
    return "macro"


def check_impact(title):
    impact_keywords = [
        "surge", "crash", "plummets", "soars", "record", "rate",
        "rbi", "fed", "warns", "crisis", "breakout", "hits", "drops",
        "halving", "inflation",
    ]
    return any(w in title.lower() for w in impact_keywords)


def fetch_and_parse():
    aggregated_news = []
    print("\n--- INITIATING GOOGLE NEWS FETCH ---")

    for region, url in FEEDS.items():
        print(f"Fetching {region} feed...")
        try:
            # Fix [07]: Pass a timeout so a slow/hung feed cannot block the
            # thread indefinitely. feedparser 6.x supports the timeout kwarg.
            feed = feedparser.parse(
                url,
                request_headers={"Connection": "close"},
                timeout=10,
            )
        except socket.timeout:
            print(f"Timeout fetching {region} feed — skipping")
            continue
        except Exception as exc:
            print(f"Error fetching {region}: {exc}")
            continue

        if not feed.entries:
            print(f"WARNING: No entries for {region}")
            continue

        for i, entry in enumerate(feed.entries[:15]):
            clean_title = entry.title.split(" - ")[0]
            source = (
                entry.title.split(" - ")[-1]
                if " - " in entry.title
                else "Network"
            )

            # Fix [08]: entry.published_parsed is set to None by feedparser
            # when date parsing fails, even though hasattr() returns True.
            # time.mktime(None) raises TypeError — use .get() + None-check.
            pub = entry.get("published_parsed")
            timestamp = time.mktime(pub) if pub is not None else time.time()

            aggregated_news.append(
                {
                    "id": f"{region}_{i}",
                    "title": clean_title,
                    "link": entry.link,
                    "source": source,
                    "type": determine_type(clean_title),
                    "high_impact": check_impact(clean_title),
                    "region": region,
                    "timestamp": timestamp,
                }
            )

    aggregated_news.sort(key=lambda x: x["timestamp"], reverse=True)
    print(f"Fetched {len(aggregated_news)} items total.")
    return aggregated_news


# ── Routes ──────────────────────────────────────────────────────────────────

@app.route("/api/intel", methods=["GET"])
def get_intel():
    current_time = time.time()

    # Fix [06]: Read stale-check under the lock — atomic check prevents two
    # threads from both seeing an empty cache and both firing a fetch.
    with _cache_lock:
        cache_stale = (
            current_time - cache["last_updated"] > CACHE_DURATION
            or not cache["data"]
        )

    if cache_stale:
        try:
            fresh_data = fetch_and_parse()
            if fresh_data:
                with _cache_lock:
                    cache["data"] = fresh_data
                    cache["last_updated"] = time.time()
        except Exception as exc:
            print(f"Fetch crashed: {exc}")

    with _cache_lock:
        # Fix [10]: Return None instead of (current_time - 0) ≈ 1.7 billion
        # when the cache was never successfully populated.
        cached_ago = (
            int(current_time - cache["last_updated"])
            if cache["last_updated"] > 0
            else None
        )
        return jsonify(
            {
                "status": "online",
                "cached_ago": cached_ago,
                "items": cache["data"],
            }
        )


# ── Entry point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Fix [04]: Never run with debug=True in production.
    # Set FLASK_DEBUG=true in your local .env only.
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    print("FIN-OS BACKEND ACTIVE ON PORT 5000")
    app.run(debug=debug_mode, port=5000)
