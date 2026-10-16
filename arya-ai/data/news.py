"""
Arya AI — News & Web Search Layer
RSS scraping, DuckDuckGo search, URL content extraction.
No dependency on voice AI or other FIN-OS modules.
"""
import time
import html
import hashlib
import re
import concurrent.futures
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser
import requests
from bs4 import BeautifulSoup

import data.cache as cache
from db.store import cache_news, get_recent_news, cache_search, get_search_cached
from config import NEWS_FEEDS, DDGO_URL, SEARCH_TIMEOUT, TTL_NEWS, TTL_SEARCH
from intelligence.sentiment import score_headline  # noqa: F401  (kept importable; score_text() below is what headlines use)

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

FEED_TIMEOUT = 8

# What the last live fetch did, so the API can say "3 of 5 sources answered" instead of a silent shorter list.
last_fetch_status: dict = {"at": None, "feeds_ok": 0, "feeds_failed": 0, "feeds_total": 0}

SENTIMENT_METHOD = ("Keyword rules applied to the headline and summary (not an AI model and not a reading of the full "
                    "article). It can misread context, sarcasm and negation.")


def _is_finance_relevant(title: str, summary: str = "") -> bool:
    text = (title + " " + summary).lower()
    return any(kw in text for kw in _FINANCE_KEYWORDS)


def _article_id(url: str, title: str) -> str:
    return hashlib.md5((url + title).encode()).hexdigest()[:16]


# ── Whole-word keyword matching ───────────────────────────────────────────────
# The word lists in intelligence/sentiment.py are matched there as plain substrings, so "ban" fires inside "bank", "lose" inside
# "close", "bull" inside "bullion", "rise" inside "enterprise". Headlines here are scored with the same lists and weights, but a
# keyword only counts as a whole word (plus a plural / past-tense ending).

_PATTERNS: dict[str, "re.Pattern"] = {}


def _word_re(word: str):
    """The word as a whole word, allowing the usual endings: surge / surges / surged / surging, drop / dropped / dropping."""
    pat = _PATTERNS.get(word)
    if pat is None:
        if word.endswith("e"):
            body = re.escape(word[:-1]) + r"(?:e|es|ed|ing)"
        else:
            last = re.escape(word[-1])
            body = re.escape(word) + r"(?:s|es|ed|ing|" + last + "ed|" + last + "ing)?"
        pat = _PATTERNS[word] = re.compile(r"(?<![a-z0-9])" + body + r"(?![a-z0-9])")
    return pat


def score_text(text: str) -> tuple[str, float]:
    """(sentiment, score) like intelligence.sentiment.score_headline, with whole-word matching."""
    from intelligence.sentiment import _BULLISH, _BEARISH, _WEIGHT
    tl = (text or "").lower()
    score, hits = 0.0, 0
    for word in _BULLISH:
        if _word_re(word).search(tl):
            score += _WEIGHT.get(word, 0.5)
            hits += 1
    for word in _BEARISH:
        if _word_re(word).search(tl):
            score -= _WEIGHT.get(word, 0.5)
            hits += 1
    if hits == 0:
        return "neutral", 0.0
    normalised = max(-1.0, min(1.0, score / hits))
    if normalised > 0.15:
        return "bullish", round(normalised, 3)
    if normalised < -0.15:
        return "bearish", round(normalised, 3)
    return "neutral", round(normalised, 3)


def _published_ts(published) -> int | None:
    """RSS dates ('Tue, 13 Oct 2026 10:00:00 +0530') or ISO dates -> epoch seconds. None if unreadable."""
    if not published:
        return None
    text = str(published).strip()
    try:
        dt = parsedate_to_datetime(text)
    except (TypeError, ValueError):
        dt = None
    if dt is None:
        try:
            dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _with_time(rows: list[dict]) -> list[dict]:
    """Adds published_ts and orders newest first (the raw `published` strings sort by weekday name, not by time)."""
    out = []
    for a in rows:
        a = dict(a)
        a["published_ts"] = a.get("published_ts") or _published_ts(a.get("published"))
        out.append(a)
    out.sort(key=lambda a: a.get("published_ts") or 0, reverse=True)
    return out


def _fetch_feed(feed_info: dict) -> list[dict]:
    r = requests.get(feed_info["url"], headers=_HEADERS, timeout=FEED_TIMEOUT)
    r.raise_for_status()
    feed = feedparser.parse(r.content)
    articles = []
    for entry in feed.entries[:15]:
        title   = html.unescape(entry.get("title", "")).strip()       # feeds send "&amp;" etc. inside titles
        url     = entry.get("link", "")
        summary = BeautifulSoup(entry.get("summary", ""), "lxml").get_text(" ", strip=True)[:400]
        published = entry.get("published", entry.get("updated", ""))
        if not title or not url:
            continue
        if not _is_finance_relevant(title, summary):
            continue
        sentiment, score = score_text(title + " " + summary)
        articles.append({
            "id":              _article_id(url, title),
            "title":           title,
            "summary":         summary,
            "url":             url,
            "source":          feed_info["name"],
            "sentiment":       sentiment,
            "sentiment_score": score,
            "tags":            _extract_tags(title + " " + summary),
            "published":       published,
            "published_ts":    _published_ts(published),
        })
    return articles


def fetch_news(force: bool = False) -> list[dict]:
    """
    Fetch and return recent financial news articles, newest first.
    Uses L1 memory cache → L2 SQLite cache → live RSS fetch.
    """
    key = "news:feed"
    if not force:
        cached = cache.get(key, TTL_NEWS)
        if cached:
            return cached
        db_rows = get_recent_news(limit=40, ttl=TTL_NEWS)
        if db_rows:
            db_rows = _with_time(db_rows)
            cache.set(key, db_rows)
            return db_rows

    articles = []
    seen_ids = set()
    ok = failed = 0

    # the sources are independent: fetched together, each with its own timeout
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(NEWS_FEEDS))) as pool:
        futures = [pool.submit(_fetch_feed, f) for f in NEWS_FEEDS]
        for fut in futures:
            try:
                got = fut.result()
                ok += 1
            except Exception:
                failed += 1
                continue
            for a in got:
                if a["id"] in seen_ids:
                    continue
                seen_ids.add(a["id"])
                articles.append(a)

    last_fetch_status.update({"at": int(time.time()), "feeds_ok": ok, "feeds_failed": failed, "feeds_total": len(NEWS_FEEDS)})
    articles = _with_time(articles)

    if articles:
        cache_news(articles)
        cache.set(key, articles[:40])

    return articles[:40]


_TAG_PATTERNS = [
    ("NIFTY", r"nifty"), ("SENSEX", r"sensex"), ("RBI", r"rbi|reserve bank"), ("SEBI", r"sebi"),
    ("IPO", r"ipos?"), ("MF", r"mutual funds?"), ("GOLD", r"gold"), ("OIL", r"crude"),
    ("INR", r"rupee"), ("INFLATION", r"inflation"), ("RATES", r"interest rates?|repo rate"),
    ("FII", r"fiis?|fpis?"), ("DII", r"diis?"), ("BUDGET", r"budget"), ("TAX", r"tax(?:es|ation)?"),
]
_TAG_RES = [(tag, re.compile(r"(?<![a-z0-9])(?:" + pat + r")(?![a-z0-9])")) for tag, pat in _TAG_PATTERNS]


def _extract_tags(text: str) -> list[str]:
    """Topic tags by whole-word match (the old substring match tagged "ipo" inside other words and "fii" inside "fiid...")."""
    tl = (text or "").lower()
    return [tag for tag, rx in _TAG_RES if rx.search(tl)][:5]


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
