"""
NIFTY Universe
==============
Pre-defined stock universe for screening. Covers Nifty 50, Nifty Next 50,
and selected Nifty Midcap 100 names.  Symbols use yfinance NSE format (.NS).
"""
from __future__ import annotations

import asyncio
from typing import Any

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
    """Case-insensitive fuzzy search by name or symbol."""
    q = query.lower().strip()
    exact   = [s for s in NIFTY_UNIVERSE if q == s["symbol"].lower().replace(".ns", "")]
    starts  = [s for s in NIFTY_UNIVERSE if s["symbol"].lower().startswith(q) and s not in exact]
    by_name = [s for s in NIFTY_UNIVERSE if q in s["name"].lower() and s not in exact and s not in starts]
    return (exact + starts + by_name)[:12]


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
