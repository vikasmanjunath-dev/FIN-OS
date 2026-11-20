"""
Natural Language Stock Screener
================================
POST /screen/natural   { "query": "midcap debt-free ROE 20+ under ₹500" }

Pipeline:
  1. Parse NL → structured filters (Ollama qwen3:14b or keyword fallback)
  2. Pre-filter universe by cap / sector (zero API calls)
  3. Batch-fetch fundamentals for candidates via yfinance (async, 8-second timeout)
  4. Apply numeric filters
  5. Return top 10 matches + per-stock AI reasoning (streamed via /screen/natural/stream)

Filter schema (all optional):
  price_max, price_min, cap: large|mid|small,
  sector: str, pe_max, pe_min, roe_min, debt_max,
  revenue_growth_min, profit_margin_min
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

import httpx
import yfinance as yf

from ..cache import cache
from .universe import get_universe

OLLAMA_URL   = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen3:14b"

# ── Keyword → filter extraction fallback ────────────────────────────────────
_CAP_KW = {
    "large": ["large", "largecap", "large-cap", "nifty50"],
    "mid":   ["mid",   "midcap",   "mid-cap",   "midsize"],
    "small": ["small", "smallcap", "small-cap", "smallsize"],
}
_SECTOR_KW = {
    "IT": ["it", "software", "tech", "technology"],
    "Banking": ["bank", "banking", "lender"],
    "Pharma": ["pharma", "pharmaceutical", "drug", "medicine"],
    "FMCG": ["fmcg", "consumer goods", "fmcg"],
    "Auto": ["auto", "automobile", "car", "vehicle", "ev"],
    "Energy": ["energy", "oil", "gas", "petroleum", "refinery"],
    "Capital Goods": ["capital goods", "engineering", "machinery"],
    "Metals": ["metal", "steel", "aluminium", "mining"],
    "Infrastructure": ["infra", "infrastructure", "construction"],
    "Defence": ["defence", "defense", "military"],
    "Chemicals": ["chemical", "specialty chemical", "paint"],
    "Healthcare": ["hospital", "healthcare", "diagnostic"],
}

def _keyword_parse(query: str) -> dict:
    q  = query.lower()
    f: dict[str, Any] = {}

    # Cap category
    for cap, words in _CAP_KW.items():
        if any(w in q for w in words):
            f["cap"] = cap
            break

    # Sector
    for sector, words in _SECTOR_KW.items():
        if any(w in q for w in words):
            f["sector"] = sector
            break

    # Price
    m = re.search(r"(?:below|under|<|price[^\d]*)\s*₹?\s*(\d[\d,]*)", q)
    if m:
        f["price_max"] = float(m.group(1).replace(",", ""))

    m = re.search(r"(?:above|over|>|min price)\s*₹?\s*(\d[\d,]*)", q)
    if m:
        f["price_min"] = float(m.group(1).replace(",", ""))

    # ROE
    m = re.search(r"roe\s*(?:>|above|min|of)?\s*(\d+)", q)
    if m:
        f["roe_min"] = float(m.group(1))

    # Debt-free / low debt
    if any(w in q for w in ["debt free", "debt-free", "zero debt", "no debt"]):
        f["debt_max"] = 0.1

    m = re.search(r"d[/\s]?e\s*(?:below|under|<|less than)\s*(\d+\.?\d*)", q)
    if m:
        f["debt_max"] = float(m.group(1))

    # P/E
    m = re.search(r"pe?\s*(?:below|under|<)\s*(\d+)", q)
    if m:
        f["pe_max"] = float(m.group(1))

    # Profit margin
    m = re.search(r"(?:margin|profit margin)\s*(?:above|>|min)?\s*(\d+)\s*%", q)
    if m:
        f["profit_margin_min"] = float(m.group(1)) / 100

    # Revenue growth
    m = re.search(r"(?:revenue|sales)\s*growth\s*(?:above|>|min)?\s*(\d+)\s*%", q)
    if m:
        f["revenue_growth_min"] = float(m.group(1)) / 100

    return f


async def _ollama_parse(query: str) -> dict | None:
    """Ask Ollama to extract structured filters. Returns None on any failure."""
    system_prompt = (
        "You are a stock screener query parser for Indian stocks (NSE). "
        "Extract filter criteria from the user query and return ONLY a JSON object. "
        "JSON keys (all optional): "
        "price_max (float), price_min (float), cap (large|mid|small), "
        "sector (exact string from: IT/Banking/Pharma/FMCG/Auto/Energy/Capital Goods/Metals), "
        "pe_max (float), roe_min (float, as percent e.g. 20 for 20%), "
        "debt_max (float, debt-to-equity ratio e.g. 0.1 for near debt-free), "
        "revenue_growth_min (float, as decimal e.g. 0.15 for 15%), "
        "profit_margin_min (float, as decimal). "
        "Return {} if no criteria found. Return ONLY JSON, no explanation."
    )
    prompt = f"Query: {query}\n\nJSON:"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(OLLAMA_URL, json={
                "model": OLLAMA_MODEL, "prompt": prompt,
                "system": system_prompt, "stream": False,
                "options": {"temperature": 0.1, "num_predict": 200},
            })
            if resp.status_code == 200:
                raw = resp.json().get("response", "")
                # Strip <think> blocks from qwen3
                raw = re.sub(r"<think>[\s\S]*?</think>", "", raw).strip()
                # Extract JSON object
                m = re.search(r"\{[\s\S]*\}", raw)
                if m:
                    return json.loads(m.group())
    except Exception:
        pass
    return None


def _to_native(v: Any) -> float | None:
    """Convert numpy / nan values to float or None."""
    import math
    if v is None:
        return None
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return None


def _fetch_fundamentals(symbol: str) -> dict | None:
    """Synchronous yfinance call — run in thread pool."""
    try:
        t = yf.Ticker(symbol)
        i = t.info or {}
        price = _to_native(i.get("regularMarketPrice")) or _to_native(i.get("currentPrice"))
        if not price:
            return None
        mc = _to_native(i.get("marketCap")) or 0
        return {
            "symbol":         symbol,
            "name":           i.get("longName") or i.get("shortName") or symbol,
            "price":          price,
            "market_cap":     mc,
            "pe":             _to_native(i.get("trailingPE")),
            "pb":             _to_native(i.get("priceToBook")),
            "roe":            _to_native(i.get("returnOnEquity")),       # decimal (e.g. 0.25 = 25%)
            "debt_to_equity": _to_native(i.get("debtToEquity")),         # ratio
            "profit_margin":  _to_native(i.get("profitMargins")),        # decimal
            "revenue_growth": _to_native(i.get("revenueGrowth")),        # decimal
            "sector":         i.get("sector") or "",
        }
    except Exception:
        return None


def _apply_filters(stock: dict, meta: dict, f: dict) -> bool:
    """Return True if stock passes all criteria."""
    price = stock.get("price") or 0
    roe   = stock.get("roe")          # decimal
    debt  = stock.get("debt_to_equity")
    pe    = stock.get("pe")
    pm    = stock.get("profit_margin")
    rg    = stock.get("revenue_growth")

    if "price_max" in f and price > f["price_max"]:
        return False
    if "price_min" in f and price < f["price_min"]:
        return False
    if "pe_max" in f and (pe is None or pe > f["pe_max"]):
        return False
    if "pe_min" in f and (pe is None or pe < f["pe_min"]):
        return False
    if "roe_min" in f:
        if roe is None:
            return False
        roe_pct = roe * 100 if abs(roe) < 2 else roe   # normalise decimal → percent
        if roe_pct < f["roe_min"]:
            return False
    if "debt_max" in f and debt is not None and debt > f["debt_max"]:
        return False
    if "profit_margin_min" in f and (pm is None or pm < f["profit_margin_min"]):
        return False
    if "revenue_growth_min" in f and (rg is None or rg < f["revenue_growth_min"]):
        return False
    return True


def _score(stock: dict) -> float:
    """Simple quality score for ranking: ROE + margin - debt."""
    roe  = (stock.get("roe") or 0)
    roe_pct = roe * 100 if abs(roe) < 2 else roe
    pm   = (stock.get("profit_margin") or 0) * 100
    debt = (stock.get("debt_to_equity") or 0)
    return roe_pct + pm - debt * 0.1


class NLScreener:
    async def screen(self, query: str) -> dict:
        """Main entry point. Returns structured results."""
        # 1. Parse filters
        ai_filters = await _ollama_parse(query)
        filters    = ai_filters if ai_filters is not None else _keyword_parse(query)
        used_ai    = ai_filters is not None

        # 2. Pre-filter universe by cap / sector (no API calls)
        candidates = get_universe()[:]
        if "cap" in filters:
            candidates = [s for s in candidates if s["cap"] == filters["cap"]]
        if "sector" in filters and filters["sector"]:
            sec = filters["sector"].lower()
            candidates = [s for s in candidates if sec in s["sector"].lower()]

        # Limit parallel fetches (rate-limit protection)
        candidates = candidates[:30]

        if not candidates:
            return {
                "query": query, "filters": filters, "used_ai_parser": used_ai,
                "results": [], "count": 0,
                "message": "No stocks in universe match the cap/sector criteria.",
            }

        # 3. Fetch fundamentals in parallel with 12-second per-stock timeout
        async def fetch_one(meta: dict) -> dict | None:
            ck = f"fund_screen:{meta['symbol']}"
            cached = await cache.get(ck)
            if cached:
                return cached
            try:
                data = await asyncio.wait_for(
                    asyncio.to_thread(_fetch_fundamentals, meta["symbol"]),
                    timeout=12.0,
                )
            except asyncio.TimeoutError:
                data = None
            if data:
                data["cap_meta"]    = meta["cap"]
                data["sector_meta"] = meta["sector"]
                await cache.set(ck, data, ttl=900)
            return data

        sem = asyncio.Semaphore(5)
        async def fetch_one_limited(meta):
            async with sem:
                return await fetch_one(meta)
        raw = await asyncio.gather(*(fetch_one_limited(m) for m in candidates))
        fetched = [r for r in raw if r]

        # 4. Apply filters
        matched = [s for s in fetched if _apply_filters(s, {}, filters)]
        matched.sort(key=_score, reverse=True)
        matched = matched[:10]

        # 5. Per-stock reasoning from Ollama (non-blocking, best-effort)
        async def add_reason(s: dict) -> dict:
            s = dict(s)
            reason = await _stock_reason(s, filters)
            s["ai_reason"] = reason
            return s

        results = await asyncio.gather(*(add_reason(s) for s in matched))

        return {
            "query":         query,
            "filters":       filters,
            "used_ai_parser": used_ai,
            "count":         len(results),
            "results":       list(results),
        }


async def _stock_reason(stock: dict, filters: dict) -> str:
    """One-line Arya reasoning for why this stock matches. Fallback to rule-based."""
    roe_raw = stock.get("roe") or 0
    roe_pct = round(roe_raw * 100 if abs(roe_raw) < 2 else roe_raw, 1)
    de      = stock.get("debt_to_equity")
    pe      = stock.get("pe")
    pm      = round((stock.get("profit_margin") or 0) * 100, 1)

    facts = []
    if roe_pct > 15:
        facts.append(f"ROE {roe_pct}%")
    if de is not None and de < 10:
        facts.append("near debt-free" if de < 5 else f"low D/E {de:.0f}%")
    if pe and pe < 25:
        facts.append(f"reasonable P/E {pe:.0f}×")
    if pm > 10:
        facts.append(f"healthy {pm}% margin")

    rule_reason = f"{stock.get('name', stock['symbol'])} — {', '.join(facts)}." if facts else ""

    prompt = (
        f"Stock: {stock.get('name')} ({stock['symbol']})\n"
        f"Price: ₹{stock.get('price')}, ROE: {roe_pct}%, D/E: {de}, P/E: {pe}, Margin: {pm}%\n"
        f"Screener query context: {filters}\n\n"
        "Write ONE sentence (max 18 words) in Hinglish explaining why this stock matches the screener query. "
        "Be specific. No preamble."
    )
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(OLLAMA_URL, json={
                "model": OLLAMA_MODEL, "prompt": prompt,
                "stream": False, "options": {"temperature": 0.5, "num_predict": 50},
            })
            if resp.status_code == 200:
                raw = resp.json().get("response", "").strip()
                raw = re.sub(r"<think>[\s\S]*?</think>", "", raw).strip()
                if raw and len(raw) > 5:
                    return raw
    except Exception:
        pass
    return rule_reason
