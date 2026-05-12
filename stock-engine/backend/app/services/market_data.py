"""
MarketData
==========
Thin async wrapper around `yfinance`. yfinance itself is sync, so we offload to
a thread pool. Heavy caching keeps Yahoo's rate limits happy.
"""
from __future__ import annotations

import asyncio
import math
import random
from typing import Any

import pandas as pd
import yfinance as yf

from ..cache import cache


def _to_native(v: Any) -> Any:
    """Numpy/pandas types are not JSON-serialisable. Convert."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if hasattr(v, "item"):
        try:
            return v.item()
        except Exception:
            pass
    return v


class MarketData:
    # ---------------- Spot ----------------
    async def spot(self, symbol: str) -> dict:
        ck = f"spot:{symbol}"
        cached = await cache.get(ck)
        if cached:
            return cached

        def fetch() -> dict:
            t = yf.Ticker(symbol)
            info = getattr(t, "fast_info", None) or {}
            full = {}
            try:
                full = t.info or {}
            except Exception:
                pass

            price = _to_native(info.get("last_price")) or _to_native(full.get("regularMarketPrice")) or 0.0
            prev = _to_native(info.get("previous_close")) or _to_native(full.get("previousClose")) or price
            change = price - prev if price and prev else 0.0
            change_pct = (change / prev * 100.0) if prev else 0.0

            return {
                "symbol": symbol,
                "name": full.get("longName") or full.get("shortName") or symbol,
                "exchange": "NSE" if symbol.endswith(".NS") else "BSE" if symbol.endswith(".BO") else "—",
                "price": round(float(price), 2),
                "previous_close": round(float(prev), 2),
                "change": round(float(change), 2),
                "change_pct": round(float(change_pct), 2),
                "volume": _to_native(info.get("last_volume")) or _to_native(full.get("regularMarketVolume")) or 0,
                "market_cap": _to_native(full.get("marketCap")) or 0,
                "pe": _to_native(full.get("trailingPE")),
                "high_52w": _to_native(full.get("fiftyTwoWeekHigh")),
                "low_52w": _to_native(full.get("fiftyTwoWeekLow")),
                "currency": full.get("currency", "INR"),
                "sector": full.get("sector"),
                "industry": full.get("industry"),
            }

        data = await asyncio.to_thread(fetch)
        await cache.set(ck, data, ttl=10)
        return data

    # ---------------- History ----------------
    async def history(self, symbol: str, *, interval: str = "1d", range_: str = "1y") -> dict:
        ck = f"hist:{symbol}:{interval}:{range_}"
        cached = await cache.get(ck)
        if cached:
            return cached

        def fetch() -> dict:
            t = yf.Ticker(symbol)
            df: pd.DataFrame = t.history(period=range_, interval=interval, auto_adjust=False)
            if df.empty:
                return {"symbol": symbol, "interval": interval, "range": range_, "candles": []}
            df = df.reset_index()
            ts_col = "Datetime" if "Datetime" in df.columns else "Date"
            candles = []
            for _, row in df.iterrows():
                ts = row[ts_col]
                if hasattr(ts, "to_pydatetime"):
                    ts = ts.to_pydatetime()
                ms = int(ts.timestamp() * 1000)
                candles.append({
                    "t": ms,
                    "o": _to_native(row.get("Open")) or 0.0,
                    "h": _to_native(row.get("High")) or 0.0,
                    "l": _to_native(row.get("Low")) or 0.0,
                    "c": _to_native(row.get("Close")) or 0.0,
                    "v": int(_to_native(row.get("Volume")) or 0),
                })
            return {"symbol": symbol, "interval": interval, "range": range_, "candles": candles}

        data = await asyncio.to_thread(fetch)
        ttl = 30 if interval in ("1m", "2m", "5m") else 300
        await cache.set(ck, data, ttl=ttl)
        return data

    # ---------------- Fundamentals ----------------
    async def fundamentals(self, symbol: str) -> dict:
        ck = f"fund:{symbol}"
        cached = await cache.get(ck)
        if cached:
            return cached

        def fetch() -> dict:
            t = yf.Ticker(symbol)
            i = {}
            try:
                i = t.info or {}
            except Exception:
                pass
            return {
                "symbol": symbol,
                "market_cap": _to_native(i.get("marketCap")),
                "pe_ttm": _to_native(i.get("trailingPE")),
                "pe_fwd": _to_native(i.get("forwardPE")),
                "eps_ttm": _to_native(i.get("trailingEps")),
                "pb": _to_native(i.get("priceToBook")),
                "roe": _to_native(i.get("returnOnEquity")),
                "debt_to_equity": _to_native(i.get("debtToEquity")),
                "profit_margin": _to_native(i.get("profitMargins")),
                "operating_margin": _to_native(i.get("operatingMargins")),
                "revenue_growth": _to_native(i.get("revenueGrowth")),
                "earnings_growth": _to_native(i.get("earningsGrowth")),
                "dividend_yield": _to_native(i.get("dividendYield")),
                "beta": _to_native(i.get("beta")),
                "high_52w": _to_native(i.get("fiftyTwoWeekHigh")),
                "low_52w": _to_native(i.get("fiftyTwoWeekLow")),
                "sector": i.get("sector"),
                "industry": i.get("industry"),
            }

        data = await asyncio.to_thread(fetch)
        await cache.set(ck, data, ttl=900)
        return data

    # ---------------- Bulk ticks (websocket) ----------------
    async def bulk_ticks(self, symbols: list[str]) -> list[dict]:
        async def one(s: str):
            try:
                spot = await self.spot(s)
                return {"symbol": s, "price": spot["price"], "change_pct": spot["change_pct"]}
            except Exception:
                return None

        results = await asyncio.gather(*(one(s) for s in symbols))
        return [r for r in results if r]

    # ---------------- Simulated depth ----------------
    @staticmethod
    def simulate_depth(symbol: str, last_price: float) -> dict:
        if not last_price:
            return {"symbol": symbol, "bids": [], "asks": []}
        tick = 0.5 if last_price > 1000 else (0.1 if last_price > 200 else 0.05)
        rnd = random.Random(hash(symbol) & 0xFFFFFFFF)
        bids, asks = [], []
        for i in range(1, 6):
            bids.append({"price": round(last_price - i * tick, 2), "qty": rnd.randint(120, 4800)})
            asks.append({"price": round(last_price + i * tick, 2), "qty": rnd.randint(120, 4800)})
        return {"symbol": symbol, "bids": bids, "asks": asks}
