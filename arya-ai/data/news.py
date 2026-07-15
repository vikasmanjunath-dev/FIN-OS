"""
Arya AI — News & Web Search Layer
RSS scraping, DuckDuckGo search, URL content extraction.
No dependency on voice AI or other FIN-OS modules.
"""
import time
import hashlib
import re
import feedparser
import requests
from bs4 import BeautifulSoup

import data.cache as cache
from db.store import cache_news, get_recent_news, cache_search, get_search_cached
from config import NEWS_FEEDS, DDGO_URL, SEARCH_TIMEOUT, TTL_NEWS, TTL_SEARCH
from intelligence.sentiment import score_headline

# ── RSS News ──────────────────────────────────────────────────────────────────

_FINANCE_KEYWORDS = [
    "nifty", "sensex", "sebi", "rbi", "stock", "share", "market", "fund",
    "mutual fund", "ipo", "fii", "dii", "interest rate", "inflation", "gdp",
    "rupee", "crude", "gold", "bank", "nse", "bse", "quarter", "earnings",
    "profit", "revenue", "dividend", "buyback", "merger", "acquisition",
]

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; Finos-Arya/1.0; +https://finos.ai)",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}


def _is_finance_relevant(title: str, summary: str = "") -> bool:
    text = (title + " " + summary).lower()
    return any(kw in text for kw in _FINANCE_KEYWORDS)


def _article_id(url: str, title: str) -> str:
    return hashlib.md5((url + title).encode()).hexdigest()[:16]


def fetch_news(force: bool = False) -> list[dict]:
    """
    Fetch and return recent financial news articles.
    Uses L1 memory cache → L2 SQLite cache → live RSS fetch.
    """
    key = "news:feed"
    if not force:
        cached = cache.get(key, TTL_NEWS)
        if cached:
            return cached
        db_rows = get_recent_news(limit=40, ttl=TTL_NEWS)
        if db_rows:
            cache.set(key, db_rows)
            return db_rows

    articles = []
    seen_ids = set()

    for feed_info in NEWS_FEEDS:
        try:
            feed = feedparser.parse(
                feed_info["url"],
                request_headers=_HEADERS,
            )
            for entry in feed.entries[:15]:
                title   = entry.get("title", "").strip()
                url     = entry.get("link", "")
                summary = BeautifulSoup(
                    entry.get("summary", ""), "lxml"
                ).get_text(" ", strip=True)[:400]
                published = entry.get("published", entry.get("updated", ""))

                if not title or not url:
                    continue
                if not _is_finance_relevant(title, summary):
                    continue

                art_id = _article_id(url, title)
                if art_id in seen_ids:
                    continue
                seen_ids.add(art_id)

                sentiment, score = score_headline(title + " " + summary)
                tags = _extract_tags(title + " " + summary)

                articles.append({
                    "id":              art_id,
                    "title":           title,
                    "summary":         summary,
                    "url":             url,
                    "source":          feed_info["name"],
                    "sentiment":       sentiment,
                    "sentiment_score": score,
                    "tags":            tags,
                    "published":       published,
                })
        except Exception:
            continue

    articles.sort(key=lambda a: a.get("published", ""), reverse=True)

    if articles:
        cache_news(articles)
        cache.set(key, articles[:40])

    return articles[:40]


def _extract_tags(text: str) -> list[str]:
    tags = []
    tag_map = {
        "nifty": "NIFTY", "sensex": "SENSEX", "rbi": "RBI", "sebi": "SEBI",
        "ipo": "IPO", "mutual fund": "MF", "gold": "GOLD", "crude": "OIL",
        "rupee": "INR", "inflation": "INFLATION", "interest rate": "RATES",
        "fii": "FII", "dii": "DII", "budget": "BUDGET", "tax": "TAX",
    }
    tl = text.lower()
    for kw, tag in tag_map.items():
        if kw in tl:
            tags.append(tag)
    return list(dict.fromkeys(tags))[:5]


# ── Web Search ────────────────────────────────────────────────────────────────

def web_search(query: str, max_results: int = 5) -> list[dict]:
    """
    DuckDuckGo HTML search — no API key, no rate-limit header required.
    Returns list of {title, url, snippet}.
    """
    cached = get_search_cached(query, TTL_SEARCH)
    if cached:
        return cached[:max_results]

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                      "Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        r = requests.post(
            DDGO_URL,
            data={"q": query, "b": "", "kl": "in-en"},
            headers=headers,
            timeout=SEARCH_TIMEOUT,
            allow_redirects=True,
        )
        r.raise_for_status()
        soup    = BeautifulSoup(r.text, "lxml")
        results = []
        for result in soup.select(".result"):
            title_el   = result.select_one(".result__title")
            url_el     = result.select_one(".result__url")
            snippet_el = result.select_one(".result__snippet")
            if not title_el:
                continue
            title   = title_el.get_text(" ", strip=True)
            url     = url_el.get_text(strip=True) if url_el else ""
            snippet = snippet_el.get_text(" ", strip=True) if snippet_el else ""
            # Reconstruct full URL from DDG's redirect
            link_tag = result.select_one("a.result__a")
            if link_tag and link_tag.get("href"):
                href = link_tag["href"]
                if href.startswith("//duckduckgo.com/l/?uddg="):
                    from urllib.parse import unquote
                    url = unquote(href.split("uddg=")[1].split("&")[0])
            if title and url:
                results.append({"title": title, "url": url, "snippet": snippet})
            if len(results) >= max_results:
                break

        if results:
            cache_search(query, results, "ddg")
        return results
    except Exception as e:
        return [{"error": str(e), "title": "", "url": "", "snippet": ""}]


# ── URL Content Extraction ────────────────────────────────────────────────────

def _extract_with_bs4(html: str) -> str:
    """The original heuristic — CSS class name guessing. Kept as a fallback,
    not the primary path anymore; see read_url()'s docstring for why."""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
        tag.decompose()
    article = soup.find("article") or soup.find(class_=re.compile(r"article|content|story|post"))
    text = article.get_text(" ", strip=True) if article else soup.get_text(" ", strip=True)
    return re.sub(r"\s{2,}", " ", text).strip()


def read_url(url: str, max_chars: int = 3000) -> str:
    """
    Fetch a URL and return clean article text (no HTML).
    Used by the agent's read_url tool.

    trafilatura first, BeautifulSoup-heuristic fallback — not a blind library
    swap. Tested both against real pages (a Wikipedia infobox-heavy article
    and RBI's notification listing page, which turned out to be a JS-shell
    with no real content in the static HTML at all) and got mixed results:
    each method fails differently on non-prose pages — the old heuristic
    sometimes strips too aggressively (returned 37 chars of a 173KB RBI page
    because nav/header/footer removal ate the whole thing), trafilatura
    sometimes includes too much nav cruft on infobox-heavy pages. Neither
    is uniformly better, so this keeps both: trafilatura is purpose-built for
    exactly the genuine-prose-article case this tool is mostly used for (news,
    blog posts), with the old method as a safety net if trafilatura comes back
    empty or suspiciously short.
    """
    key = f"url:{hashlib.md5(url.encode()).hexdigest()[:12]}"
    cached = cache.get(key, 1800)
    if cached:
        return cached

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Finos-Arya/1.0)",
        "Accept": "text/html,application/xhtml+xml,*/*",
    }
    try:
        r = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
        r.raise_for_status()

        import trafilatura
        text = trafilatura.extract(r.text, url=url)
        if not text or len(text) < 200:
            text = _extract_with_bs4(r.text)

        result = text[:max_chars]
        cache.set(key, result)
        return result
    except Exception as e:
        return f"Could not read URL: {e}"


# ── NSE Corporate Announcements ───────────────────────────────────────────────

def get_announcements(symbol: str | None = None, limit: int = 10) -> list[dict]:
    """Fetch BSE/NSE corporate action announcements from NSE."""
    try:
        from data.market import _nse
        path = "/api/home-corporate-announcements"
        data = _nse.get(path) or []
        results = []
        for ann in data[:limit]:
            if symbol and symbol.upper() not in (ann.get("symbol", "").upper()):
                continue
            results.append({
                "symbol":  ann.get("symbol", ""),
                "subject": ann.get("subject", ""),
                "date":    ann.get("bm_timestamp", ""),
                "type":    ann.get("desc", ""),
            })
        return results
    except Exception:
        return []
