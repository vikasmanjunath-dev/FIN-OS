"""
Earnings Call Analyser
=======================
GET /api/earnings/{symbol}

Pipeline:
  1. Fetch quarterly financials + earnings history via yfinance
  2. Compute QoQ and YoY growth, beat/miss streaks
  3. Build bull/bear case via Ollama
  4. Return structured analysis card

Output schema:
  symbol, name, last_updated,
  quarterly: [ { quarter, revenue, net_income, eps, qoq_rev_pct, yoy_rev_pct, beat } ],
  trend: { revenue: up|down|mixed, profit: up|down|mixed, consecutive_beats: int },
  guidance_risk: low|medium|high,
  bull_case, bear_case,
  arya_alert: str (voice notification text)
"""
from __future__ import annotations

import asyncio
import re
from typing import Any

import httpx
import yfinance as yf

from ..cache import cache

OLLAMA_URL   = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen3:14b"


def _safe_float(v: Any) -> float | None:
    import math
    if v is None:
        return None
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return None


def _pct_change(old: float | None, new: float | None) -> float | None:
    if old is None or new is None or old == 0:
        return None
    return round((new - old) / abs(old) * 100, 1)


def _fetch_earnings_data(symbol: str) -> dict:
    """Synchronous yfinance fetch — runs in thread pool."""
    t = yf.Ticker(symbol)

    # Basic info
    info = {}
    try:
        info = t.info or {}
    except Exception:
        pass

    name      = info.get("longName") or info.get("shortName") or symbol
    price     = _safe_float(info.get("regularMarketPrice") or info.get("currentPrice"))
    sector    = info.get("sector") or ""
    industry  = info.get("industry") or ""

    # Quarterly financials
    quarterly: list[dict] = []
    try:
        qf = t.quarterly_financials
        if qf is not None and not qf.empty:
            rev_row    = None
            profit_row = None
            for row_name in qf.index:
                rn = str(row_name).lower()
                if "total revenue" in rn:
                    rev_row = row_name
                if "net income" in rn:
                    profit_row = row_name

            cols = list(qf.columns)[:8]  # up to 8 quarters
            revs  = [_safe_float(qf.loc[rev_row,    c]) if rev_row    else None for c in cols]
            profs = [_safe_float(qf.loc[profit_row, c]) if profit_row else None for c in cols]

            for i, col in enumerate(cols):
                dt     = col
                label  = dt.strftime("Q%m'%y") if hasattr(dt, "strftime") else str(dt)[:7]
                rev    = revs[i]
                prof   = profs[i]
                qoq_r  = _pct_change(revs[i + 1],   rev)  if i + 1 < len(revs)   else None
                yoy_r  = _pct_change(revs[i + 4],   rev)  if i + 4 < len(revs)   else None
                qoq_p  = _pct_change(profs[i + 1],  prof) if i + 1 < len(profs)  else None
                yoy_p  = _pct_change(profs[i + 4],  prof) if i + 4 < len(profs)  else None
                quarterly.append({
                    "quarter":    label,
                    "revenue":    round(rev  / 1e7, 2) if rev  is not None else None,  # crores
                    "net_income": round(prof / 1e7, 2) if prof is not None else None,
                    "qoq_rev_pct": qoq_r, "yoy_rev_pct": yoy_r,
                    "qoq_profit_pct": qoq_p, "yoy_profit_pct": yoy_p,
                })
    except Exception:
        pass

    # EPS beat/miss history
    beat_count  = 0
    miss_count  = 0
    consecutive_beats = 0
    try:
        eh = t.earnings_history
        if eh is not None and not eh.empty:
            for _, row in eh.iterrows():
                est = _safe_float(row.get("epsEstimate"))
                act = _safe_float(row.get("epsActual"))
                if est is not None and act is not None:
                    if act >= est:
                        beat_count += 1
                    else:
                        miss_count += 1
            # Consecutive beats from most recent
            for _, row in eh.head(8).iterrows():
                est = _safe_float(row.get("epsEstimate"))
                act = _safe_float(row.get("epsActual"))
                if est is not None and act is not None and act >= est:
                    consecutive_beats += 1
                else:
                    break
    except Exception:
        pass

    # Next earnings date
    next_earnings = None
    try:
        cal = t.calendar
        if cal is not None and not cal.empty:
            nd = cal.get("Earnings Date")
            if nd is not None and len(nd) > 0:
                next_earnings = str(nd.iloc[0])[:10]
    except Exception:
        pass

    # Revenue trend
    rev_trend = "insufficient data"
    if len(quarterly) >= 3:
        revs = [q["revenue"] for q in quarterly[:4] if q["revenue"] is not None]
        if len(revs) >= 3:
            ups = sum(1 for i in range(1, len(revs)) if revs[i] < revs[i - 1])  # quarterly cols are newest first
            if ups >= len(revs) - 1:
                rev_trend = "up"
            elif ups == 0:
                rev_trend = "down"
            else:
                rev_trend = "mixed"

    prof_trend = "insufficient data"
    if len(quarterly) >= 3:
        profs = [q["net_income"] for q in quarterly[:4] if q["net_income"] is not None]
        if len(profs) >= 3:
            ups = sum(1 for i in range(1, len(profs)) if profs[i] < profs[i - 1])
            if ups >= len(profs) - 1:
                prof_trend = "up"
            elif ups == 0:
                prof_trend = "down"
            else:
                prof_trend = "mixed"

    # Guidance risk (heuristic)
    total_beats = beat_count + miss_count
    beat_rate   = beat_count / total_beats if total_beats > 0 else 0.5
    guidance_risk = "low" if beat_rate > 0.7 else ("high" if beat_rate < 0.4 else "medium")

    return {
        "symbol":          symbol,
        "name":            name,
        "price":           price,
        "sector":          sector,
        "industry":        industry,
        "quarterly":       quarterly[:6],   # last 6 quarters
        "trend":           {"revenue": rev_trend, "profit": prof_trend,
                            "consecutive_beats": consecutive_beats},
        "beat_rate_pct":   round(beat_rate * 100),
        "guidance_risk":   guidance_risk,
        "next_earnings":   next_earnings,
        "beat_count":      beat_count,
        "miss_count":      miss_count,
    }


async def _generate_bull_bear(data: dict) -> tuple[str, str]:
    """Ask Ollama for bull / bear case. Fallback to rule-based text."""
    q = data.get("quarterly", [])
    latest = q[0] if q else {}
    trend  = data.get("trend", {})
    beats  = data.get("beat_count", 0)
    misses = data.get("miss_count", 0)

    prompt = (
        f"Stock: {data['name']} ({data['symbol']}) — {data['sector']}\n"
        f"Revenue trend: {trend.get('revenue')} | Profit trend: {trend.get('profit')}\n"
        f"EPS beats: {beats}, misses: {misses} (last 8 quarters)\n"
        f"Consecutive beats: {trend.get('consecutive_beats')}\n"
        f"Latest quarter revenue: ₹{latest.get('revenue')} Cr, "
        f"Net income: ₹{latest.get('net_income')} Cr\n"
        f"YoY revenue growth: {latest.get('yoy_rev_pct')}%\n\n"
        "Give TWO things — no headings, just:\n"
        "BULL: [one sentence bull case — specific catalyst, max 20 words]\n"
        "BEAR: [one sentence bear case — specific risk, max 20 words]\n"
        "Hinglish tone. Specific. No generic statements."
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(OLLAMA_URL, json={
                "model": OLLAMA_MODEL, "prompt": prompt,
                "stream": False, "options": {"temperature": 0.6, "num_predict": 120},
            })
            if resp.status_code == 200:
                raw = resp.json().get("response", "")
                raw = re.sub(r"<think>[\s\S]*?</think>", "", raw).strip()
                bull_m = re.search(r"BULL[:\s]+(.+)", raw, re.IGNORECASE)
                bear_m = re.search(r"BEAR[:\s]+(.+)", raw, re.IGNORECASE)
                bull = bull_m.group(1).strip() if bull_m else ""
                bear = bear_m.group(1).strip() if bear_m else ""
                if bull and bear:
                    return bull, bear
    except Exception:
        pass

    # Rule-based fallback
    rev_t  = trend.get("revenue", "mixed")
    prof_t = trend.get("profit", "mixed")
    bull = (
        f"Revenue {rev_t} + {beats} consecutive EPS beats signal strong execution momentum."
        if rev_t == "up" else f"Strong brand + sector tailwinds could drive re-rating."
    )
    bear = (
        f"Profit trend {prof_t} and {misses} EPS misses suggest execution risk ahead."
        if misses > 2 else f"High valuation leaves little room for a guidance miss."
    )
    return bull, bear


async def _generate_arya_alert(data: dict, bull: str, bear: str) -> str:
    """Short voice notification Arya will speak."""
    q          = data.get("quarterly", [])
    latest     = q[0] if q else {}
    next_date  = data.get("next_earnings") or "soon"
    guidance   = data.get("guidance_risk", "medium")
    consec     = data.get("trend", {}).get("consecutive_beats", 0)
    name       = data.get("name") or data["symbol"]
    yoy        = latest.get("yoy_rev_pct")

    yoy_str = f"{yoy:+.0f}% YoY revenue" if yoy is not None else "recent earnings"
    beat_str = f"{consec} baar beat kar chuke hain consecutively" if consec > 2 else "mixed track record hai"
    risk_str = {"low": "risk low lag raha hai", "medium": "medium risk hai", "high": "high risk hai — careful"}[guidance]

    return (
        f"{name} ke earnings {next_date} ko aane wale hain. "
        f"Last quarter {yoy_str} tha. Ye log {beat_str}. "
        f"Guidance {risk_str}. "
        f"Bull: {bull[:60]}. Bear: {bear[:60]}."
    )


class EarningsAnalyser:
    async def analyse(self, symbol: str) -> dict:
        ck = f"earnings:{symbol}"
        cached = await cache.get(ck)
        if cached:
            return cached

        # Fetch raw data in thread
        try:
            data = await asyncio.wait_for(
                asyncio.to_thread(_fetch_earnings_data, symbol),
                timeout=20.0,
            )
        except asyncio.TimeoutError:
            return {"error": "yfinance timeout — try again", "symbol": symbol}
        except Exception as e:
            return {"error": str(e), "symbol": symbol}

        # AI analysis (async, non-blocking)
        bull, bear = await _generate_bull_bear(data)
        arya_alert = await _generate_arya_alert(data, bull, bear)

        result = {**data, "bull_case": bull, "bear_case": bear, "arya_alert": arya_alert}

        # Cache for 15 minutes (earnings data doesn't change that fast)
        await cache.set(ck, result, ttl=900)
        return result
