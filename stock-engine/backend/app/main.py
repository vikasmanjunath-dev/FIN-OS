"""
Quantum Stock Engine — FastAPI core
====================================
NSE / BSE pricing, indicator engine, rule-based insights, WebSocket ticks.

Run:
    uvicorn app.main:app --reload --port 8002

Endpoints:
    GET  /api/stock/{symbol}
    GET  /api/history/{symbol}?interval=1d&range=1y
    GET  /api/indicators/{symbol}
    GET  /api/insights/{symbol}
    GET  /api/depth/{symbol}
    GET  /api/fundamentals/{symbol}
    GET  /api/sectors
    GET  /api/search?q=...
    GET  /api/health
    WS   /ws/ticks
"""

from __future__ import annotations

import asyncio
import json
import os
import re as _re
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .services.market_data import MarketData
from .services.indicators import IndicatorEngine
from .services.insights import InsightsEngine
from .services.universe import NIFTY_UNIVERSE, search_universe, sector_breakdown, get_universe, _refresh_universe
from .services.screener import NLScreener
from .services.earnings import EarningsAnalyser
from .cache import cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load Nifty 500 from NSE CSV on startup (falls back to built-in 90 if offline)
    await _refresh_universe()
    live = get_universe()
    await cache.set("universe", live, ttl=86400)  # 24h cache
    import logging
    logging.getLogger("stock-engine").info(
        "Universe ready: %d stocks loaded", len(live)
    )
    yield


app = FastAPI(
    title="Quantum Stock Engine",
    description="Bloomberg-grade retail platform for Indian markets — NSE/BSE.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5500").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

market   = MarketData()
indicators = IndicatorEngine()
insights   = InsightsEngine()
screener   = NLScreener()
earnings   = EarningsAnalyser()


class ScreenQuery(BaseModel):
    query: str


# ---------------------------------------------------------------------------
# REST
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "quantum-stock-engine", "version": "1.0.0"}


_SYMBOL_RE = _re.compile(r'^[A-Z0-9\-&]{1,15}(\.NS|\.BO)?$')

@app.get("/api/stock/{symbol}")
async def stock(symbol: str):
    if not _SYMBOL_RE.match(symbol.upper()):
        raise HTTPException(status_code=400, detail="Invalid symbol format")
    try:
        return await market.spot(symbol.upper())
    except Exception:
        raise HTTPException(status_code=502, detail="Market data unavailable")


@app.get("/api/history/{symbol}")
async def history(
    symbol: str,
    interval: str = Query("1d", regex="^(1m|2m|5m|15m|30m|60m|1h|1d|5d|1wk|1mo)$"),
    range: str = Query("1y", regex="^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$"),
):
    if not _SYMBOL_RE.match(symbol.upper()):
        raise HTTPException(status_code=400, detail="Invalid symbol format")
    try:
        return await market.history(symbol.upper(), interval=interval, range_=range)
    except Exception:
        raise HTTPException(status_code=502, detail="Market data unavailable")


@app.get("/api/indicators/{symbol}")
async def indicators_endpoint(symbol: str, range: str = "1y"):
    bars = await market.history(symbol.upper(), interval="1d", range_=range)
    return indicators.compute_all(bars["candles"])


@app.get("/api/insights/{symbol}")
async def insights_endpoint(symbol: str):
    spot = await market.spot(symbol.upper())
    bars = await market.history(symbol.upper(), interval="1d", range_="1y")
    ind = indicators.compute_all(bars["candles"])
    signals = insights.generate(symbol.upper(), spot, bars["candles"], ind)
    return {"symbol": symbol.upper(), "signals": signals}


@app.get("/api/depth/{symbol}")
async def depth(symbol: str):
    spot = await market.spot(symbol.upper())
    return market.simulate_depth(symbol.upper(), spot["price"])


@app.get("/api/fundamentals/{symbol}")
async def fundamentals(symbol: str):
    try:
        return await market.fundamentals(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Fundamentals fetch failed: {e}")


@app.get("/api/sectors")
async def sectors():
    return await sector_breakdown(market)


@app.get("/api/search")
async def search(q: str = Query(..., min_length=1, max_length=32)):
    return {"results": search_universe(q)[:12]}


# ---------------------------------------------------------------------------
# AI Stock Screener — Natural Language Query
# ---------------------------------------------------------------------------

@app.post("/screen/natural")
async def screen_natural(body: ScreenQuery):
    """
    POST /screen/natural
    Body: { "query": "midcap debt-free ROE 20+ under ₹500" }

    1. Ollama (or keyword fallback) extracts structured filters from NL query
    2. Universe pre-filtered by cap/sector  (zero API calls)
    3. yfinance fundamentals fetched in parallel for candidates
    4. Filters applied → top 10 matches returned with AI reasoning
    """
    if not body.query or not body.query.strip():
        raise HTTPException(status_code=400, detail="query must not be empty")
    try:
        result = await screener.screen(body.query.strip())
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Screener error: {e}")


# ---------------------------------------------------------------------------
# Earnings Call Analyser
# ---------------------------------------------------------------------------

@app.get("/api/earnings/{symbol}")
async def earnings_analysis(symbol: str):
    """
    GET /api/earnings/TCS.NS

    Returns quarterly financials, EPS beat/miss history, trend analysis,
    bull/bear case generated by Ollama, and an Arya voice notification alert.
    """
    try:
        result = await earnings.analyse(symbol.upper())
        if "error" in result:
            raise HTTPException(status_code=502, detail=result["error"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Earnings analysis failed: {e}")


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws/ticks")
async def ws_ticks(ws: WebSocket):
    """
    Client connects with: ws://host/ws/ticks
    Send `{"subscribe": ["RELIANCE.NS", "TCS.NS"]}` to set the watch list.
    Server emits a tick frame every 3-5 seconds:
        {"symbol": "RELIANCE.NS", "price": 2841.05, "ts": 1714305000}
    """
    await ws.accept()
    subs: set[str] = set()

    async def reader():
        nonlocal subs
        try:
            while True:
                raw = await ws.receive_text()
                msg = json.loads(raw)
                if "subscribe" in msg:
                    subs = {s.upper() for s in msg["subscribe"]}
                    await ws.send_text(json.dumps({"event": "subscribed", "symbols": sorted(subs)}))
        except WebSocketDisconnect:
            pass

    async def writer():
        try:
            while True:
                await asyncio.sleep(4.0)
                if not subs:
                    continue
                ticks = await market.bulk_ticks(list(subs))
                for t in ticks:
                    try:
                        await asyncio.wait_for(
                            ws.send_text(json.dumps({"event": "tick", **t})),
                            timeout=5.0
                        )
                    except asyncio.TimeoutError:
                        return
        except WebSocketDisconnect:
            pass

    await asyncio.gather(reader(), writer())


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def universal_exception(request, exc):
    return JSONResponse(status_code=500, content={"error": str(exc)})
