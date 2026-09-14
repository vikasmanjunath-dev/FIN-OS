"""
News RSS ingestion — Phase 3 gap, built July 17 2026.

Fetches recent articles from four verified Indian financial news RSS feeds,
extracts clean text, and returns them in the same CrawledCircular shape the
regulatory crawlers use so jobs.py can call _ingest_regulatory_docs() unchanged.

Feeds verified live before writing this file:
  Mint Markets / Money — 35 entries each (feeds.livemint.com)
  MoneyControl top news — 18 entries
  NDTV Profit — 20 entries
  Hindu Business Line — 60 entries

ET Markets and BSE Announcements tested but returned too few/broken entries
and are left as commented-out fallbacks. CNBC TV18 returned 0 entries (bozo=1).

Article text extraction strategy:
  Each RSS entry typically has a short <summary> (~300–500 chars). Full article
  HTML is NOT fetched — financial news sites aggressively block scrapers and
  their full text adds little incremental value over a good summary for a
  news-RAG use case (we want "what happened", not the full editorial piece).
  The chunk size for news is 200 tokens / 40 overlap (config.py CHUNK_SIZES["news"]),
  which fits summaries well. If a summary is shorter than MIN_SUMMARY_CHARS,
  the entry is skipped (headline-only items with no useful context).
"""
from __future__ import annotations
import html
import re
from dataclasses import dataclass

import feedparser

MIN_SUMMARY_CHARS = 80  # skip pure-headline entries with no body

# Verified working as of July 17, 2026
NEWS_FEEDS: list[tuple[str, str, str]] = [
    # (source_name, url, finance_category)
    ("Mint Markets",        "https://www.livemint.com/rss/markets",  "markets"),
    ("Mint Money",          "https://www.livemint.com/rss/money",    "personal_finance"),
    ("MoneyControl",        "https://www.moneycontrol.com/rss/MCtopnews.xml", "markets"),
    ("NDTV Profit",         "https://feeds.feedburner.com/ndtvprofit-latest", "markets"),
    ("Hindu Business Line", "https://www.thehindubusinessline.com/feeder/default.rss", "markets"),
]

_HTML_TAG = re.compile(r"<[^>]+>")
_MULTI_SPACE = re.compile(r"\s{2,}")


@dataclass
class NewsArticle:
    """Same shape as CrawledCircular so _ingest_regulatory_docs() works unchanged."""
    title: str
    detail_url: str  # article link
    pdf_url: str     # same as detail_url for news (no separate PDF)
    text: str
    source: str
    finance_category: str


def _clean(text: str) -> str:
    text = html.unescape(text)
    text = _HTML_TAG.sub(" ", text)
    return _MULTI_SPACE.sub(" ", text).strip()


def fetch_news_feed(source: str, url: str, finance_category: str, limit: int) -> list[NewsArticle]:
    try:
        feed = feedparser.parse(url, request_headers={"User-Agent": "Mozilla/5.0"})
    except Exception as e:
        print(f"[news] failed to fetch {source}: {e}")
        return []

    articles = []
    for entry in feed.entries[:limit]:
        title = _clean(entry.get("title", "")).strip()
        link  = entry.get("link", "")
        # Prefer summary_detail (often has more text) over summary
        raw_summary = (
            entry.get("summary_detail", {}).get("value")
            or entry.get("summary", "")
            or entry.get("description", "")
        )
        summary = _clean(raw_summary)

        if len(summary) < MIN_SUMMARY_CHARS:
            continue
        if not title or not link:
            continue

        full_text = f"{title}. {summary}"
        articles.append(NewsArticle(
            title=title,
            detail_url=link,
            pdf_url=link,
            text=full_text,
            source=source,
            finance_category=finance_category,
        ))

    return articles


def fetch_all_news(limit_per_feed: int = 20) -> list[NewsArticle]:
    """Fetch up to `limit_per_feed` articles from each verified feed."""
    all_articles: list[NewsArticle] = []
    seen_titles: set[str] = set()

    for source, url, category in NEWS_FEEDS:
        articles = fetch_news_feed(source, url, category, limit=limit_per_feed)
        for a in articles:
            # Deduplicate by title (same story syndicated across feeds)
            key = a.title.lower()[:80]
            if key in seen_titles:
                continue
            seen_titles.add(key)
            all_articles.append(a)
        print(f"[news] {source}: {len(articles)} articles fetched")

    return all_articles
