"""
NIFTY Universe
==============
Dynamic stock universe loader.
Primary: loads Nifty 500 constituents from NSE's public CSV (refreshed every 24h).
Fallback: built-in 90-stock curated list when NSE CSV is unreachable.
Symbols use yfinance NSE format (.NS).
"""
from __future__ import annotations

import asyncio
import csv
import io
import logging
import time
from typing import Any

import httpx

log = logging.getLogger("stock-engine.universe")

# NSE public Nifty 500 constituent list (refreshed daily by NSE)
_NSE_NIFTY500_URL = (
    "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"
)

# ── Dynamic universe cache ────────────────────────────────────────────────────
_dynamic_universe: list[dict] = []
_universe_loaded_at: float    = 0
_UNIVERSE_CACHE_TTL = 86_400  # 24 hours


# Sector name normaliser (NSE uses verbose names, we want short ones)
_SECTOR_MAP: dict[str, str] = {
    "Information Technology":     "IT",
    "Financial Services":         "Banking",
    "Consumer Goods":             "FMCG",
    "Automobile":                 "Auto",
    "Pharmaceuticals":            "Pharma",
    "Oil & Gas":                  "Energy",
    "Metals":                     "Metals",
    "Construction":               "Infrastructure",
    "Power":                      "Power",
    "Telecom":                    "Telecom",
    "Healthcare":                 "Healthcare",
    "Fast Moving Consumer Goods": "FMCG",
    "Consumer Services":          "Consumer",
    "Capital Goods":              "Capital Goods",
    "Chemicals":                  "Chemicals",
    "Realty":                     "Real Estate",
    "Diversified":                "Diversified",
    "Services":                   "Services",
    "Textiles":                   "Textiles",
    "Media & Entertainment":      "Media",
    "Cement & Cement Products":   "Cement",
    "Insurance":                  "Insurance",
    "Fertilisers & Agrochemicals":"Agro",
}


def _normalise_sector(raw: str) -> str:
    raw = raw.strip()
    return _SECTOR_MAP.get(raw, raw.title()[:20] if raw else "Other")


async def _fetch_nifty500() -> list[dict]:
    """Download and parse NSE Nifty 500 CSV. Returns list of stock dicts."""
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as c:
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; FIN-OS/2.0)",
                "Accept":     "text/csv,*/*",
            }
            r = await c.get(_NSE_NIFTY500_URL, headers=headers)
            r.raise_for_status()
        reader  = csv.DictReader(io.StringIO(r.text))
        stocks  = []
        for row in reader:
            # NSE CSV columns: Company Name, Industry, Symbol, Series, ISIN Code
            symbol = str(row.get("Symbol", "")).strip()
            name   = str(row.get("Company Name", "")).strip()
            sector = str(row.get("Industry", "")).strip()
            if not symbol or not name:
                continue
            stocks.append({
                "symbol": f"{symbol}.NS",
                "name":   name,
                "sector": _normalise_sector(sector),
                "cap":    "large",   # Nifty 500 caps assigned below
                "isin":   str(row.get("ISIN Code", "")).strip(),
            })
        log.info("Nifty 500 universe loaded: %d stocks from NSE CSV", len(stocks))
        return stocks
    except Exception as e:
        log.warning("NSE CSV fetch failed (%s) — falling back to built-in universe", e)
        return []


def _refresh_universe_sync() -> None:
    """Synchronous wrapper — called from startup lifespan."""
    import asyncio as _asyncio
    try:
        loop = _asyncio.get_event_loop()
        if loop.is_running():
            _asyncio.ensure_future(_refresh_universe())
        else:
            loop.run_until_complete(_refresh_universe())
    except Exception:
        pass


async def _refresh_universe() -> None:
    global _dynamic_universe, _universe_loaded_at
    fetched = await _fetch_nifty500()
    if fetched:
        _dynamic_universe   = fetched
        _universe_loaded_at = time.time()


def get_universe() -> list[dict]:
    """
    Return current universe. Auto-triggers async refresh if stale.
    Returns Nifty 500 (dynamic) if loaded, else built-in 90-stock fallback.
    """
    global _dynamic_universe, _universe_loaded_at
    now = time.time()
    # Schedule background refresh if cache is stale
    if now - _universe_loaded_at > _UNIVERSE_CACHE_TTL:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(_refresh_universe())
        except Exception:
            pass
    return _dynamic_universe if _dynamic_universe else NIFTY_UNIVERSE

# ---------------------------------------------------------------------------
# Universe definition  (symbol, display-name, sector, cap-category)
# ---------------------------------------------------------------------------
NIFTY_UNIVERSE: list[dict] = [
    # ── LARGE CAPS (Nifty 50) ──────────────────────────────────────────────
    {"symbol": "RELIANCE.NS",    "name": "Reliance Industries",         "sector": "Energy",       "cap": "large"},
    {"symbol": "TCS.NS",         "name": "Tata Consultancy Services",   "sector": "IT",           "cap": "large"},
    {"symbol": "HDFCBANK.NS",    "name": "HDFC Bank",                   "sector": "Banking",      "cap": "large"},
    {"symbol": "INFY.NS",        "name": "Infosys",                     "sector": "IT",           "cap": "large"},
    {"symbol": "ICICIBANK.NS",   "name": "ICICI Bank",                  "sector": "Banking",      "cap": "large"},
    {"symbol": "HINDUNILVR.NS",  "name": "Hindustan Unilever",          "sector": "FMCG",         "cap": "large"},
    {"symbol": "ITC.NS",         "name": "ITC",                         "sector": "FMCG",         "cap": "large"},
    {"symbol": "SBIN.NS",        "name": "State Bank of India",         "sector": "Banking",      "cap": "large"},
    {"symbol": "BHARTIARTL.NS",  "name": "Bharti Airtel",               "sector": "Telecom",      "cap": "large"},
    {"symbol": "KOTAKBANK.NS",   "name": "Kotak Mahindra Bank",         "sector": "Banking",      "cap": "large"},
    {"symbol": "LT.NS",          "name": "Larsen & Toubro",             "sector": "Infrastructure","cap": "large"},
    {"symbol": "AXISBANK.NS",    "name": "Axis Bank",                   "sector": "Banking",      "cap": "large"},
    {"symbol": "ASIANPAINT.NS",  "name": "Asian Paints",                "sector": "Chemicals",    "cap": "large"},
    {"symbol": "MARUTI.NS",      "name": "Maruti Suzuki",               "sector": "Auto",         "cap": "large"},
    {"symbol": "HCLTECH.NS",     "name": "HCL Technologies",            "sector": "IT",           "cap": "large"},
    {"symbol": "SUNPHARMA.NS",   "name": "Sun Pharmaceutical",          "sector": "Pharma",       "cap": "large"},
    {"symbol": "TITAN.NS",       "name": "Titan Company",               "sector": "Consumer",     "cap": "large"},
    {"symbol": "ULTRACEMCO.NS",  "name": "UltraTech Cement",            "sector": "Cement",       "cap": "large"},
    {"symbol": "WIPRO.NS",       "name": "Wipro",                       "sector": "IT",           "cap": "large"},
    {"symbol": "BAJFINANCE.NS",  "name": "Bajaj Finance",               "sector": "NBFC",         "cap": "large"},
    {"symbol": "BAJAJFINSV.NS",  "name": "Bajaj Finserv",               "sector": "NBFC",         "cap": "large"},
    {"symbol": "NESTLEIND.NS",   "name": "Nestle India",                "sector": "FMCG",         "cap": "large"},
    {"symbol": "POWERGRID.NS",   "name": "Power Grid Corporation",      "sector": "Power",        "cap": "large"},
    {"symbol": "NTPC.NS",        "name": "NTPC",                        "sector": "Power",        "cap": "large"},
    {"symbol": "COALINDIA.NS",   "name": "Coal India",                  "sector": "Mining",       "cap": "large"},
    {"symbol": "ONGC.NS",        "name": "ONGC",                        "sector": "Energy",       "cap": "large"},
    {"symbol": "TATAMOTORS.NS",  "name": "Tata Motors",                 "sector": "Auto",         "cap": "large"},
    {"symbol": "TATASTEEL.NS",   "name": "Tata Steel",                  "sector": "Metals",       "cap": "large"},
    {"symbol": "JSWSTEEL.NS",    "name": "JSW Steel",                   "sector": "Metals",       "cap": "large"},
    {"symbol": "CIPLA.NS",       "name": "Cipla",                       "sector": "Pharma",       "cap": "large"},
    {"symbol": "DRREDDY.NS",     "name": "Dr Reddy's Laboratories",     "sector": "Pharma",       "cap": "large"},
    {"symbol": "DIVISLAB.NS",    "name": "Divi's Laboratories",         "sector": "Pharma",       "cap": "large"},
    {"symbol": "APOLLOHOSP.NS",  "name": "Apollo Hospitals",            "sector": "Healthcare",   "cap": "large"},
    {"symbol": "BPCL.NS",        "name": "BPCL",                        "sector": "Energy",       "cap": "large"},
    {"symbol": "GRASIM.NS",      "name": "Grasim Industries",           "sector": "Cement",       "cap": "large"},
    {"symbol": "HINDALCO.NS",    "name": "Hindalco Industries",         "sector": "Metals",       "cap": "large"},
    {"symbol": "EICHERMOT.NS",   "name": "Eicher Motors",               "sector": "Auto",         "cap": "large"},
    {"symbol": "BRITANNIA.NS",   "name": "Britannia Industries",        "sector": "FMCG",         "cap": "large"},
    {"symbol": "HEROMOTOCO.NS",  "name": "Hero MotoCorp",               "sector": "Auto",         "cap": "large"},
    {"symbol": "TECHM.NS",       "name": "Tech Mahindra",               "sector": "IT",           "cap": "large"},
    {"symbol": "ADANIPORTS.NS",  "name": "Adani Ports",                 "sector": "Infrastructure","cap": "large"},
    {"symbol": "LTIM.NS",        "name": "LTIMindtree",                 "sector": "IT",           "cap": "large"},
    {"symbol": "TRENT.NS",       "name": "Trent",                       "sector": "Retail",       "cap": "large"},
    {"symbol": "BEL.NS",         "name": "Bharat Electronics",          "sector": "Defence",      "cap": "large"},
    {"symbol": "PIDILITIND.NS",  "name": "Pidilite Industries",         "sector": "Chemicals",    "cap": "large"},
    {"symbol": "HAVELLS.NS",     "name": "Havells India",               "sector": "Consumer",     "cap": "large"},
    {"symbol": "DMART.NS",       "name": "D-Mart (Avenue Supermarts)",  "sector": "Retail",       "cap": "large"},
    {"symbol": "SIEMENS.NS",     "name": "Siemens India",               "sector": "Capital Goods","cap": "large"},
    {"symbol": "ABB.NS",         "name": "ABB India",                   "sector": "Capital Goods","cap": "large"},
    {"symbol": "CUMMINSIND.NS",  "name": "Cummins India",               "sector": "Capital Goods","cap": "large"},

    # ── MID CAPS (Nifty Next 50 + Midcap 100 samples) ─────────────────────
    {"symbol": "IRCTC.NS",       "name": "IRCTC",                       "sector": "Transport",    "cap": "mid"},
    {"symbol": "PERSISTENT.NS",  "name": "Persistent Systems",          "sector": "IT",           "cap": "mid"},
    {"symbol": "COFORGE.NS",     "name": "Coforge",                     "sector": "IT",           "cap": "mid"},
    {"symbol": "KPITTECH.NS",    "name": "KPIT Technologies",           "sector": "IT",           "cap": "mid"},
    {"symbol": "LTTS.NS",        "name": "L&T Technology Services",     "sector": "IT",           "cap": "mid"},
    {"symbol": "MPHASIS.NS",     "name": "Mphasis",                     "sector": "IT",           "cap": "mid"},
    {"symbol": "TATACOMM.NS",    "name": "Tata Communications",         "sector": "Telecom",      "cap": "mid"},
    {"symbol": "POLYCAB.NS",     "name": "Polycab India",               "sector": "Capital Goods","cap": "mid"},
    {"symbol": "ASTRAL.NS",      "name": "Astral",                      "sector": "Chemicals",    "cap": "mid"},
    {"symbol": "THERMAX.NS",     "name": "Thermax",                     "sector": "Capital Goods","cap": "mid"},
    {"symbol": "PIIND.NS",       "name": "PI Industries",               "sector": "Chemicals",    "cap": "mid"},
    {"symbol": "SYNGENE.NS",     "name": "Syngene International",       "sector": "Pharma",       "cap": "mid"},
    {"symbol": "LALPATHLAB.NS",  "name": "Dr Lal PathLabs",             "sector": "Healthcare",   "cap": "mid"},
    {"symbol": "METROPOLIS.NS",  "name": "Metropolis Healthcare",       "sector": "Healthcare",   "cap": "mid"},
    {"symbol": "AAVAS.NS",       "name": "Aavas Financiers",            "sector": "NBFC",         "cap": "mid"},
    {"symbol": "FIVESTAR.NS",    "name": "Five-Star Business Finance",  "sector": "NBFC",         "cap": "mid"},
    {"symbol": "NAUKRI.NS",      "name": "Info Edge (Naukri)",          "sector": "Internet",     "cap": "mid"},
    {"symbol": "POLICYBZR.NS",   "name": "PB Fintech (Policybazaar)",   "sector": "Fintech",      "cap": "mid"},
    {"symbol": "MAPMYINDIA.NS",  "name": "MapMyIndia",                  "sector": "Internet",     "cap": "mid"},
    {"symbol": "CAMPUS.NS",      "name": "Campus Activewear",           "sector": "Consumer",     "cap": "mid"},
    {"symbol": "DELHIVERY.NS",   "name": "Delhivery",                   "sector": "Logistics",    "cap": "mid"},
    {"symbol": "CONCOR.NS",      "name": "Container Corporation",       "sector": "Logistics",    "cap": "mid"},
    {"symbol": "APLAPOLLO.NS",   "name": "APL Apollo Tubes",            "sector": "Metals",       "cap": "mid"},
    {"symbol": "JYOTHYLAB.NS",   "name": "Jyothy Labs",                 "sector": "FMCG",         "cap": "mid"},
    {"symbol": "ZYDUSLIFE.NS",   "name": "Zydus Lifesciences",          "sector": "Pharma",       "cap": "mid"},
    {"symbol": "ALKEM.NS",       "name": "Alkem Laboratories",          "sector": "Pharma",       "cap": "mid"},
    {"symbol": "IIFL.NS",        "name": "IIFL Finance",                "sector": "NBFC",         "cap": "mid"},
    {"symbol": "MFSL.NS",        "name": "Max Financial Services",      "sector": "Insurance",    "cap": "mid"},
    {"symbol": "ANGELONE.NS",    "name": "Angel One",                   "sector": "Fintech",      "cap": "mid"},

    # ── SMALL CAPS (selected quality names) ───────────────────────────────
    {"symbol": "TANLA.NS",       "name": "Tanla Platforms",             "sector": "IT",           "cap": "small"},
    {"symbol": "ROUTE.NS",       "name": "Route Mobile",                "sector": "IT",           "cap": "small"},
    {"symbol": "TARSONS.NS",     "name": "Tarsons Products",            "sector": "Pharma",       "cap": "small"},
    {"symbol": "UGROCAP.NS",     "name": "UGRO Capital",                "sector": "NBFC",         "cap": "small"},
    {"symbol": "HLEGLAS.NS",     "name": "HLE Glascoat",                "sector": "Capital Goods","cap": "small"},
    {"symbol": "CSBBANK.NS",     "name": "CSB Bank",                    "sector": "Banking",      "cap": "small"},
    {"symbol": "EQUITASBNK.NS",  "name": "Equitas Small Finance Bank",  "sector": "Banking",      "cap": "small"},
    {"symbol": "KRBL.NS",        "name": "KRBL (India Gate Rice)",      "sector": "FMCG",         "cap": "small"},
    {"symbol": "WESTLIFE.NS",    "name": "Westlife Foodworld (McD)",    "sector": "Consumer",     "cap": "small"},
    {"symbol": "INOXWIND.NS",    "name": "Inox Wind",                   "sector": "Renewable",    "cap": "small"},
]

# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------
def search_universe(query: str) -> list[dict]:
    """Case-insensitive fuzzy search by name or symbol across full universe."""
    universe = get_universe()
    q        = query.lower().strip()
    if not q:
        return universe[:20]
    exact   = [s for s in universe if q == s["symbol"].lower().replace(".ns", "")]
    starts  = [s for s in universe if s["symbol"].lower().startswith(q) and s not in exact]
    by_name = [s for s in universe if q in s["name"].lower() and s not in exact and s not in starts]
    return (exact + starts + by_name)[:15]


# ---------------------------------------------------------------------------
# Sector breakdown  (async — calls yfinance for each sector representative)
# ---------------------------------------------------------------------------
_SECTOR_REPS: dict[str, str] = {
    "IT":           "TCS.NS",
    "Banking":      "HDFCBANK.NS",
    "Energy":       "RELIANCE.NS",
    "Pharma":       "SUNPHARMA.NS",
    "Auto":         "MARUTI.NS",
    "FMCG":         "HINDUNILVR.NS",
    "Capital Goods":"SIEMENS.NS",
    "Metals":       "TATASTEEL.NS",
    "Infrastructure":"LT.NS",
    "Telecom":      "BHARTIARTL.NS",
}


async def sector_breakdown(market) -> dict:
    """Returns a lightweight sector summary (representative stock per sector)."""
    async def one(sector: str, sym: str) -> dict:
        try:
            spot = await market.spot(sym)
            return {
                "sector": sector,
                "symbol": sym,
                "change_pct": spot.get("change_pct", 0),
                "price": spot.get("price", 0),
            }
        except Exception:
            return {"sector": sector, "symbol": sym, "change_pct": 0, "price": 0}

    results = await asyncio.gather(*(one(s, sym) for s, sym in _SECTOR_REPS.items()))
    return {"sectors": list(results)}
