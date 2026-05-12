"""
Quantum Stock Engine — FastAPI core
====================================
NSE / BSE pricing, indicator engine, rule-based insights, WebSocket ticks.

Run:
    uvicorn app.main:app --reload --port 8000

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
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .services.market_data import MarketData
from .services.indicators import IndicatorEngine
from .services.insights import InsightsEngine
from .services.universe import NIFTY_UNIVERSE, search_universe, sector_breakdown
from .cache import cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up the universe so the first /api/search is instant
    await cache.set("universe", NIFTY_UNIVERSE, ttl=3600)
    yield


app = FastAPI(
    title="Quantum Stock Engine",
    description="Bloomberg-grade retail platform for Indian markets — NSE/BSE.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

market = MarketData()
indicators = IndicatorEngine()
insights = InsightsEngine()


# ---------------------------------------------------------------------------
# REST
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "quantum-stock-engine", "version": "1.0.0"}


@app.get("/api/stock/{symbol}")
async def stock(symbol: str):
    try:
        return await market.spot(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Quote fetch failed: {e}")


@app.get("/api/history/{symbol}")
async def history(
    symbol: str,
    interval: str = Query("1d", regex="^(1m|2m|5m|15m|30m|60m|1h|1d|5d|1wk|1mo)$"),
    range: str = Query("1y", regex="^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$"),
):
    try:
        return await market.history(symbol.upper(), interval=interval, range_=range)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"History fetch failed: {e}")


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
                    await ws.send_text(json.dumps({"event": "tick", **t}))
        except WebSocketDisconnect:
            pass

    await asyncio.gather(reader(), writer())


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def universal_exception(request, exc):
    return JSONResponse(status_code=500, content={"error": str(exc)})
