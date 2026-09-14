"""
NSE + BSE corporate filing crawler (Phase 23).

NSE: Uses the same `_NSESession` cookie-refresh pattern as arya-ai/data/market.py —
     NSE's site sets session cookies on the homepage; API calls return 401 or HTML
     without them. Endpoint: GET /api/home-corporate-announcements — returns a JSON
     list of recent announcements from all listed companies, each with symbol, subject
     (announcement text), desc (filing category), and bm_timestamp.

BSE: Uses api.bseindia.com's AnnSubCategoryGetData endpoint — no session cookie
     needed, just a Referer header matching www.bseindia.com. Returns JSON with
     HEADLINE, LONGNAME, SCRIP_CD, DT_TM, NEWSSUB fields.

Intentional design choice: announcement headline/subject text, NOT PDF downloads.
Corporate filings PDFs are boilerplate-heavy (cover pages, signatures, headers) and
add noise to the RAG corpus. The subject/headline text is already a dense, factual
summary of what was announced — exactly what retrieval needs. A query like "what did
TCS announce recently?" should return the subject text ("Board approves interim
dividend of ₹10 per share") not 40 pages of PDF boilerplate.
"""
from __future__ import annotations
import re
import time
from dataclasses import dataclass

import httpx

_TIMEOUT  = httpx.Timeout(20.0)
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

NSE_BASE = "https://www.nseindia.com"
BSE_API  = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w"


@dataclass
class CorporateFiling:
    title: str       # brief slug: "{company} — {subject[:80]}"
    detail_url: str  # canonical NSE/BSE URL for citation
    text: str        # formatted chunk text ready for RAG ingestion
    exchange: str    # "NSE" or "BSE"
    company: str     # NSE symbol or BSE company name
    date: str        # YYYY-MM-DD


# ── NSE ──────────────────────────────────────────────────────────────────────

class _NSESession:
    """
    Minimal httpx equivalent of arya-ai's requests-based _NSESession.
    The RAG engine uses httpx (not requests) so this is a parallel implementation
    — same cookie-refresh logic, different underlying library.
    """
    def __init__(self):
        self._client = httpx.Client(
            headers={
                "User-Agent": _UA,
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Referer": f"{NSE_BASE}/",
                "Connection": "keep-alive",
            },
            follow_redirects=True,
            timeout=_TIMEOUT,
        )
        self._last_refresh = 0.0
        self._TTL = 300.0  # re-warm cookies every 5 min

    def _refresh(self):
        try:
            self._client.get(NSE_BASE)
            self._last_refresh = time.time()
        except Exception:
            pass

    def get_json(self, path: str) -> list | dict | None:
        if time.time() - self._last_refresh > self._TTL:
            self._refresh()
        try:
            r = self._client.get(f"{NSE_BASE}{path}")
            if r.status_code == 401:
                self._refresh()
                r = self._client.get(f"{NSE_BASE}{path}")
            r.raise_for_status()
            return r.json()
        except Exception:
            return None


_nse_session: _NSESession | None = None


def _get_nse_session() -> _NSESession:
    global _nse_session
    if _nse_session is None:
        _nse_session = _NSESession()
    return _nse_session


def _nse_date(ts: str) -> str:
    """'2026-07-15T14:30:00' → '2026-07-15'; tolerates missing/malformed input."""
    return ts[:10] if ts and len(ts) >= 10 else ""


def crawl_recent_nse_filings(limit: int = 50) -> list[CorporateFiling]:
    """
    Fetch recent corporate announcements from NSE.
    Endpoint confirmed working in arya-ai/data/news.py (get_announcements()).
    The API returns a flat list; each item's 'subject' is the full announcement
    text — already more useful for retrieval than boilerplate PDF headers.
    """
    session = _get_nse_session()
    data = session.get_json("/api/home-corporate-announcements")
    if not isinstance(data, list) or not data:
        print("[corporate] NSE /api/home-corporate-announcements returned no data")
        return []

    filings: list[CorporateFiling] = []
    for ann in data[:limit]:
        symbol  = (ann.get("symbol") or "").strip()
        subject = (ann.get("subject") or "").strip()
        desc    = (ann.get("desc") or "").strip()      # category/type
        ts      = ann.get("bm_timestamp") or ann.get("an_dt") or ""
        date    = _nse_date(str(ts))

        if not subject or not symbol:
            continue

        text = (
            f"NSE Corporate Filing\n"
            f"Company (NSE symbol): {symbol}\n"
            f"Date: {date}\n"
            f"Category: {desc}\n"
            f"Announcement: {subject}"
        )
        filings.append(CorporateFiling(
            title=f"{symbol} — {subject[:80]}",
            detail_url="https://www.nseindia.com/companies-listing/corporate-filings-announcements",
            text=text,
            exchange="NSE",
            company=symbol,
            date=date,
        ))

    print(f"[corporate] NSE: {len(filings)} filings fetched (limit={limit})")
    return filings


# ── BSE ──────────────────────────────────────────────────────────────────────

_BSE_HEADERS = {
    "User-Agent": _UA,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.bseindia.com/",
    "Origin":  "https://www.bseindia.com",
}


def _bse_date(dt_tm: str) -> str:
    """
    Normalise BSE's various timestamp formats to YYYY-MM-DD.
    Observed formats: '20260715143000', '2026-07-15T14:30:00', '15/07/2026 14:30:00'.
    Strategy: strip non-digits, take first 8 digits as YYYYMMDD.
    """
    if not dt_tm:
        return ""
    digits = re.sub(r"\D", "", str(dt_tm))[:8]
    if len(digits) == 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    return str(dt_tm)[:10]


def crawl_recent_bse_filings(limit: int = 50) -> list[CorporateFiling]:
    """
    Fetch recent corporate announcements from BSE's AnnSubCategoryGetData endpoint.
    No session cookie required — just a Referer header matching bseindia.com.
    Uses a 7-day rolling window so each run picks up this week's filings.
    """
    today         = time.strftime("%Y%m%d")
    seven_ago     = time.strftime("%Y%m%d", time.localtime(time.time() - 7 * 86400))
    params = {
        "strCat":       "Corp",
        "strPrevDate":  seven_ago,
        "strToDate":    today,
        "strType":      "C",
        "pageno":       "1",
        "subcategory":  "-1",
        "strScripCode": "",
        "strSearch":    "",
    }

    try:
        r = httpx.get(BSE_API, params=params, headers=_BSE_HEADERS, timeout=_TIMEOUT)
        r.raise_for_status()
        payload = r.json()
    except Exception as exc:
        print(f"[corporate] BSE API fetch failed: {exc}")
        return []

    # BSE wraps rows under "Table" key; fall back to raw list if already bare
    rows: list[dict] = (
        payload.get("Table") or payload.get("table") or
        (payload if isinstance(payload, list) else [])
    )
    if not rows:
        print("[corporate] BSE returned empty Table")
        return []

    filings: list[CorporateFiling] = []
    for row in rows[:limit]:
        headline = (row.get("HEADLINE") or row.get("NEWSSUB") or "").strip()
        company  = (row.get("LONGNAME") or row.get("scrip_name") or "").strip()
        scrip    = str(row.get("SCRIP_CD") or row.get("scrip_cd") or "").strip()
        dt_tm    = str(row.get("DT_TM")   or row.get("NEWS_DT")  or "")
        cat      = (row.get("NEWSSUB")    or row.get("CATEGORYNAME") or "").strip()
        date     = _bse_date(dt_tm)

        if not headline or not company:
            continue

        detail_url = (
            f"https://www.bseindia.com/corporates/ann.html"
            f"?expandable=0&scripcd={scrip}&anntp=MAN"
            if scrip else "https://www.bseindia.com/corporates/ann.html"
        )
        bse_tag = f" (BSE: {scrip})" if scrip else ""
        text = (
            f"BSE Corporate Filing\n"
            f"Company: {company}{bse_tag}\n"
            f"Date: {date}\n"
            f"Category: {cat}\n"
            f"Announcement: {headline}"
        )
        filings.append(CorporateFiling(
            title=f"{company} — {headline[:80]}",
            detail_url=detail_url,
            text=text,
            exchange="BSE",
            company=company,
            date=date,
        ))

    print(f"[corporate] BSE: {len(filings)} filings fetched (limit={limit})")
    return filings
