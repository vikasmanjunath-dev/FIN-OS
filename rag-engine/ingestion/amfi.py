"""
AMFI NAV data — live mutual fund Net Asset Values (July 2026).

Phase 3 documented this as the right approach: AMFI's `NAVAll.txt` is a
real, working, unauthenticated flat-file endpoint (1.6MB, thousands of
schemes) updated every trading day. Structured tabular data — looked up by
fund name, not chunked into the document-RAG pipeline.

Endpoint: https://www.amfiindia.com/spages/NAVAll.txt
Format: semicolon-delimited rows, header line every AMC block, data rows:
  SchemeCode;ISINDivPayout;ISINGrowth;SchemeName;NAV;Date

Usage:
  results = search_nav("sbi bluechip")
  results = search_nav("hdfc top 100")
"""
from __future__ import annotations
import re
import time
from dataclasses import dataclass
from difflib import SequenceMatcher

import httpx

AMFI_NAV_URL = "https://www.amfiindia.com/spages/NAVAll.txt"
_TIMEOUT = httpx.Timeout(10.0)
_CACHE_TTL = 3600  # refresh once per hour; NAV updates once daily

_cache_data: list[dict] | None = None
_cache_ts: float = 0.0


@dataclass
class NAVResult:
    scheme_code: str
    scheme_name: str
    nav: str
    date: str
    isin_growth: str
    isin_div: str
    score: float  # fuzzy match score


def _fetch_and_parse() -> list[dict]:
    """Fetch NAVAll.txt and parse into a list of dicts. Cached for 1h."""
    global _cache_data, _cache_ts
    if _cache_data and time.time() - _cache_ts < _CACHE_TTL:
        return _cache_data

    resp = httpx.get(AMFI_NAV_URL, timeout=_TIMEOUT, follow_redirects=True)
    resp.raise_for_status()

    records: list[dict] = []
    for line in resp.text.splitlines():
        parts = line.split(";")
        # Data rows have exactly 6 fields and start with a numeric scheme code
        if len(parts) != 6 or not parts[0].strip().isdigit():
            continue
        nav_val = parts[4].strip()
        if not nav_val or nav_val == "N.A.":
            continue
        records.append({
            "scheme_code": parts[0].strip(),
            "isin_div":    parts[1].strip(),
            "isin_growth": parts[2].strip(),
            "scheme_name": parts[3].strip(),
            "nav":         nav_val,
            "date":        parts[5].strip(),
            # Pre-compute lowercase name once for fast fuzzy search
            "_name_lower": parts[3].strip().lower(),
        })

    _cache_data = records
    _cache_ts   = time.time()
    return records


def _fuzzy_score(name_lower: str, query_lower: str) -> float:
    """Combined: word-overlap ratio + SequenceMatcher ratio."""
    q_words = set(query_lower.split())
    n_words = set(name_lower.split())
    word_overlap = len(q_words & n_words) / max(len(q_words), 1)
    seq_ratio    = SequenceMatcher(None, query_lower, name_lower).ratio()
    return 0.6 * word_overlap + 0.4 * seq_ratio


def search_nav(query: str, top_k: int = 5) -> list[NAVResult]:
    """Search AMFI NAV data by fund name. Returns up to `top_k` best matches."""
    if not query or not query.strip():
        return []

    q = re.sub(r"[^a-z0-9 ]", " ", query.lower()).strip()
    records = _fetch_and_parse()

    scored = []
    for r in records:
        score = _fuzzy_score(r["_name_lower"], q)
        if score > 0.15:  # skip clear misses early
            scored.append((score, r))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [
        NAVResult(
            scheme_code=r["scheme_code"],
            scheme_name=r["scheme_name"],
            nav=r["nav"],
            date=r["date"],
            isin_growth=r["isin_growth"],
            isin_div=r["isin_div"],
            score=round(score, 3),
        )
        for score, r in scored[:top_k]
    ]
