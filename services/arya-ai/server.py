"""
Arya AI — FastAPI Server  (port 7475)
Standalone for every endpoint except /api/portfolio/summary, which is the one
place this service reads from Supabase (same project the rest of FIN-OS uses)
to look up a user's real holdings — everything else here is public market
data with no user namespace, no auth needed.
Depends only on: Ollama (local), SQLite (local), public free APIs, Supabase
(portfolio endpoint only).

Run:  ./start.sh   OR   uvicorn server:app --host 0.0.0.0 --port 7475 --reload
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))   # allow sibling imports

import time
import json
import hmac
import html as _html
import logging
import re
import asyncio
import threading
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Header, WebSocket, WebSocketDisconnect, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from config import PORT, HOST, CORS_ORIGINS, CORS_LOCAL_REGEX, ADMIN_TOKEN, OLLAMA_BASE, OLLAMA_MODEL, TTL_QUOTE, REPORTS_DIR
from db.store import init_db, delete_stale, get_recent_news
from data.market import (
    get_quote, get_multiple_quotes, get_market_overview, get_sector_overview,
    get_mf_nav, search_mf, get_commodities, get_crypto,
    get_fx_rates, get_historical, get_market_status, get_chart,
    get_fundamentals, get_mf_history, MAX_BULK, _SYMBOL_OK,
)
import data.news as news_mod
from data.news import fetch_news, web_search, read_url, get_announcements
from data.portfolio import get_portfolio_summary
import data.kite as kite
from intelligence.technical import analyze, multi_timeframe_summary
from intelligence.sentiment import aggregate_sentiment
from reports.generator import quote_report, market_overview_report, portfolio_excel
from auth import verify_user_matches, AuthError
from tts import synthesize as tts_synthesize
import data.cache as cache
import ratelimit
from ratelimit import limit
from secmw import SecurityMiddleware

log = logging.getLogger("arya.server")

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Arya AI",
    description="FIN-OS Arya AI backend — real-time Indian market data, web search, TA",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
)

# CORS: an explicit allow-list (config.CORS_ORIGINS, set with ARYA_CORS) plus localhost / 127.0.0.1 on any port for dev servers.
# Never "*" - and no credentials: this API authenticates with an Authorization header, not cookies, so a page on another site
# gains nothing from being allowed to send them. (A "*" with credentials made Starlette echo ANY origin back as allowed.)
_cors_origins = [o for o in CORS_ORIGINS if o != "*"]
if len(_cors_origins) != len(CORS_ORIGINS):
    log.warning("ARYA_CORS contained '*': ignored. List the origins explicitly.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=CORS_LOCAL_REGEX,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Kite-Token", "X-Admin-Token"],
)
# added last = outermost: the size and rate limits apply before anything else (CORS preflights are exempt inside it)
app.add_middleware(SecurityMiddleware)


@app.on_event("startup")
async def startup():
    init_db()
    # Warm cache in background
    threading.Thread(target=_warm_cache, daemon=True).start()
    # Schedule stale-row cleanup every hour (it re-arms itself: it used to run once, an hour after start-up, and never again)
    asyncio.get_event_loop().call_later(3600, _cleanup_stale)


def _warm_cache():
    try:
        get_market_overview()
        fetch_news()
        get_commodities()
    except Exception:
        pass


def _cleanup_stale():
    try:
        delete_stale("news_cache",    86400)
        delete_stale("search_cache",  3600)
        delete_stale("technical_cache", 3600)
        cache.purge(3600)
        _purge_old_reports()
    except Exception:
        pass
    try:
        asyncio.get_event_loop().call_later(3600, _cleanup_stale)
    except Exception:
        pass


def _purge_old_reports(max_age: int = 3600):
    """Generated report files are deleted after they are sent; this removes any that were left behind (a crash, an aborted download)."""
    cutoff = time.time() - max_age
    for f in REPORTS_DIR.glob("*"):
        try:
            if f.is_file() and f.stat().st_mtime < cutoff:
                f.unlink()
        except OSError:
            pass


def _remove_file(path: str):
    try:
        os.remove(path)
    except OSError:
        pass


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "service": "Arya AI", "version": "1.0.0",
            "cache_size": cache.size()}


@app.get("/health")
def health():
    return {"status": "ok", "ts": int(time.time())}


# ── Market status ─────────────────────────────────────────────────────────────

@app.get("/api/market/status")
def market_status():
    return get_market_status()


@app.get("/api/market/overview")
def market_overview():
    return get_market_overview()


@app.get("/api/market/sectors")
def market_sectors():
    """Day change for the main NSE sector indices (live; a sector that can't be fetched is absent, never faked)."""
    return get_sector_overview()


# ── Quotes ────────────────────────────────────────────────────────────────────

@app.get("/api/quote/{symbol}")
def quote(symbol: str, exchange: str = Query("NSE")):
    """Market quote for an NSE/BSE symbol (may be served from the backend quote cache)."""
    return get_quote(symbol.upper(), exchange.upper())


@app.get("/api/quotes")
def bulk_quotes(symbols: str = Query(..., max_length=2000, description="Comma-separated symbols"),
                exchange: str = Query("NSE")):
    """Bulk quotes. e.g. /api/quotes?symbols=RELIANCE,INFY,TCS  (at most MAX_BULK symbols per call; a symbol that cannot be quoted
    comes back as {"error", "symbol"} in its place, never as a made-up price)."""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return {"quotes": get_multiple_quotes(syms[:MAX_BULK], exchange.upper()), "truncated": len(syms) > MAX_BULK}


@app.get("/api/fundamentals/{symbol}")
def fundamentals(symbol: str, exchange: str = Query("NSE")):
    """Trailing P/E, P/B, EPS, market cap and sector from Yahoo's company info (third-party figures, labelled as such).
    Each ratio is None when it is not available or fails a sanity check; the response says why."""
    return get_fundamentals(symbol.upper(), exchange.upper())


# ── Live price WebSocket ──────────────────────────────────────────────────────
# Connect: ws://localhost:7475/ws/prices?symbols=RELIANCE,TCS&exchange=NSE
# Re-subscribe anytime by sending {"symbols": ["INFY","WIPRO"]} as a text frame —
# no need to reconnect. Pushes every TTL_QUOTE seconds (matches get_quote's own
# cache freshness — pushing faster wouldn't return fresher data, just re-serve
# the same cached quote).

WS_MAX_PER_CLIENT = 8          # open price streams per client address
WS_MAX_FRAME = 4096            # a re-subscribe message is a short list of tickers
_ws_open: dict[str, int] = {}


@app.websocket("/ws/prices")
async def ws_prices(websocket: WebSocket,
                    symbols: str = Query("", max_length=2000),
                    exchange: str = Query("NSE", max_length=8)):
    who = ratelimit.client_id(websocket)
    if _ws_open.get(who, 0) >= WS_MAX_PER_CLIENT:
        await websocket.close(code=1008)          # policy violation: too many open streams from one address
        return
    _ws_open[who] = _ws_open.get(who, 0) + 1
    try:
        await _ws_prices_session(websocket, symbols, exchange)
    finally:
        _ws_open[who] = max(0, _ws_open.get(who, 1) - 1)
        if not _ws_open[who]:
            _ws_open.pop(who, None)


async def _ws_prices_session(websocket: WebSocket, symbols: str, exchange: str):
    await websocket.accept()
    watched = [s.strip().upper() for s in symbols.split(",") if s.strip()][:MAX_BULK]
    exch = exchange.upper()

    async def _recv_resubscribe():
        nonlocal watched, exch
        while True:
            raw = await websocket.receive_text()
            if len(raw) > WS_MAX_FRAME:
                continue
            try:
                msg = json.loads(raw)
                new_symbols = msg.get("symbols")
                if isinstance(new_symbols, list):
                    watched = [str(s).strip().upper() for s in new_symbols if str(s).strip()][:MAX_BULK]
                if isinstance(msg.get("exchange"), str):
                    exch = msg["exchange"].upper()[:8]
            except (json.JSONDecodeError, AttributeError):
                pass  # ignore malformed frames rather than dropping the connection

    recv_task = asyncio.create_task(_recv_resubscribe())
    try:
        while True:
            if watched:
                quotes = get_multiple_quotes(watched, exch)
                await websocket.send_json({"type": "tick", "ts": int(time.time()), "quotes": quotes})
            await asyncio.sleep(TTL_QUOTE)
    except WebSocketDisconnect:
        pass
    finally:
        recv_task.cancel()


# ── Historical OHLCV ──────────────────────────────────────────────────────────

@app.get("/api/history/{symbol}")
def history(symbol: str,
            period: str   = Query("1y", description="1d 5d 1mo 3mo 6mo 1y 2y 5y"),
            interval: str = Query("1d", description="1m 5m 15m 1h 1d 1wk 1mo"),
            exchange: str = Query("NSE")):
    out = get_historical(symbol.upper(), period, interval, exchange.upper())
    if isinstance(out.get("error"), str) and out["error"].startswith(("Invalid", "Exchange must")):
        raise HTTPException(status_code=400, detail=out["error"])
    return out


@app.get("/api/chart")
def chart(symbol: str = Query(..., description="Yahoo symbol, e.g. RELIANCE.NS, ^NSEI, GC=F"),
          interval: str = Query("1d", description="1m 5m 15m 30m 60m 1d 5d 1wk 1mo"),
          range: str = Query("3mo", description="1d 5d 1mo 3mo 6mo 1y 2y 5y 10y ytd max")):
    """OHLCV arrays + current price for a Yahoo symbol, served from this machine (replaces the public relay the Trading Brain page used)."""
    out = get_chart(symbol, interval, range)
    if "error" in out:
        raise HTTPException(status_code=400 if out["error"].startswith("Invalid") else 502, detail=out["error"])
    return out


# ── Technical Analysis ────────────────────────────────────────────────────────

@app.get("/api/analyze/{symbol}")
def technical_analysis(symbol: str, exchange: str = Query("NSE")):
    """Full TA: RSI, MACD, Bollinger, EMA, SMA200, ADX, Volume."""
    return analyze(symbol.upper(), exchange.upper())


@app.get("/api/analyze/{symbol}/multi")
def multi_tf_analysis(symbol: str, exchange: str = Query("NSE")):
    """Short / medium / long-term TA summary."""
    return multi_timeframe_summary(symbol.upper(), exchange.upper())


# ── Mutual Funds ──────────────────────────────────────────────────────────────

@app.get("/api/mf/nav/{scheme_code}")
def mf_nav(scheme_code: str):
    return get_mf_nav(scheme_code)


@app.get("/api/mf/search")
def mf_search(q: str = Query(..., max_length=100, description="Fund name or house"), limit: int = Query(10, ge=1, le=100)):
    return {"results": search_mf(q, limit)}


@app.get("/api/mf/history/{scheme_code}")
def mf_history(scheme_code: str, years: float = Query(6, description="How many years back (max 30)")):
    """Daily NAV history of one scheme (AMFI NAVs, served via a public mirror and cross-checked against AMFI's daily file).
    Returns {"history": [[YYYY-MM-DD, nav], ...]} oldest first. No returns are computed here."""
    out = get_mf_history(scheme_code, years)
    if "error" in out:
        raise HTTPException(status_code=400 if out["error"].startswith("Invalid") else 404 if out["error"].startswith("No NAV") else 502,
                            detail=out["error"])
    return out


# ── Commodities & FX ─────────────────────────────────────────────────────────

@app.get("/api/commodities")
def commodities():
    return get_commodities()


def _fx_payload() -> dict:
    """{"USD_INR": rate, ...} for the pairs that could be fetched; {"error": ...} when none could (no rate is ever filled in)."""
    rates = get_fx_rates()
    return rates if rates else {"error": "FX rates unavailable: the rate source could not be reached"}


@app.get("/api/fx")
def fx_rates():
    return _fx_payload()


# ── Crypto ────────────────────────────────────────────────────────────────────

@app.get("/api/crypto")
def crypto(coins: str = Query("bitcoin,ethereum,ripple,dogecoin,matic-network", max_length=600)):
    coin_list = [c.strip() for c in coins.split(",") if c.strip()]
    return get_crypto(coin_list)


# ── News ─────────────────────────────────────────────────────────────────────

@app.get("/api/news")
def news(limit: int = Query(20, ge=1, le=100), force: bool = Query(False)):
    articles = fetch_news(force=force)
    sentiment = aggregate_sentiment(articles)
    return {
        "articles": articles[:limit],
        "sentiment": sentiment,
        "count": len(articles),
        "as_of": int(time.time()),
        # how the sentiment was produced and how many sources answered, so the app can say so instead of implying more
        "sentiment_method": news_mod.SENTIMENT_METHOD,
        "sources": dict(news_mod.last_fetch_status),
    }


@app.get("/api/news/announcements")
def announcements(symbol: Optional[str] = Query(None, max_length=20), limit: int = Query(10, ge=1, le=50)):
    return {"announcements": get_announcements(symbol, limit)}


# ── Web Search ────────────────────────────────────────────────────────────────

@app.get("/api/search", dependencies=[Depends(limit("fetch"))])
def search(q: str = Query(..., max_length=300, description="Search query"),
           max_results: int = Query(5, ge=1, le=10)):
    """DuckDuckGo web search — no API key needed."""
    results = web_search(q, max_results)
    return {"query": q, "results": results}


@app.get("/api/read", dependencies=[Depends(limit("fetch"))])
def read_page(url: str = Query(..., max_length=2048), max_chars: int = Query(3000, ge=200, le=20000)):
    """Extract clean text from a public web page. Used by the agent's read_url tool.
    Only public http(s) hosts are fetched (see netguard.py); localhost, private and link-local addresses are refused."""
    return {"url": url, "content": read_url(url, max_chars)}


# ── Reports ───────────────────────────────────────────────────────────────────
# format=html (default) or format=pdf. PDF needs WeasyPrint + Pango — see
# reports/generator.py's module docstring for the brew install + DYLD_LIBRARY_PATH
# requirement this depends on (start.sh sets it; running uvicorn directly won't).

_REPORT_MEDIA = {"html": "text/html", "pdf": "application/pdf"}


@app.get("/api/report/quote/{symbol}", dependencies=[Depends(limit("report"))])
def report_quote(symbol: str, exchange: str = Query("NSE"), format: str = Query("html")):
    """Generate and return a stock report (HTML or PDF)."""
    fmt = format.lower()
    if fmt not in _REPORT_MEDIA:
        raise HTTPException(status_code=400, detail=f"format must be one of {list(_REPORT_MEDIA)}")
    q  = get_quote(symbol.upper(), exchange.upper())
    if "error" in q:
        raise HTTPException(status_code=404 if not str(q["error"]).startswith(("Invalid", "Exchange")) else 400, detail=q["error"])
    ta = analyze(symbol.upper(), exchange.upper())
    path = quote_report(q, ta, fmt=fmt)
    # the file name is built from the validated symbol (letters, digits, & and -), never from the raw path text; the file is
    # deleted once it has been sent
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", str(q.get("symbol") or "stock"))[:24]
    return FileResponse(path, media_type=_REPORT_MEDIA[fmt], background=BackgroundTask(_remove_file, path),
                        headers={"Content-Disposition": f"inline; filename={safe}_report.{fmt}"})


@app.get("/api/report/market", dependencies=[Depends(limit("report"))])
def report_market(format: str = Query("html")):
    """Generate market overview report (HTML or PDF)."""
    fmt = format.lower()
    if fmt not in _REPORT_MEDIA:
        raise HTTPException(status_code=400, detail=f"format must be one of {list(_REPORT_MEDIA)}")
    ov    = get_market_overview()
    comm  = get_commodities()
    cry   = get_crypto()
    news  = fetch_news()
    path  = market_overview_report(ov, comm, cry, news, fmt=fmt)
    return FileResponse(path, media_type=_REPORT_MEDIA[fmt], background=BackgroundTask(_remove_file, path),
                        headers={"Content-Disposition": f"inline; filename=market_overview.{fmt}"})


# ── Text-to-Speech ──────────────────────────────────────────────────────────────
# Edge Neural voices, not browser speechSynthesis — the same engine
# voiceagent/agent.py already uses, genuinely natural-sounding (Microsoft's
# Azure neural TTS) rather than a robotic OS voice. In-memory bytes, no temp
# file — unlike the report endpoints above, there's nothing here worth
# persisting to disk.
class TTSRequest(BaseModel):
    text: str = Field(..., max_length=20000)
    lang: str = Field("english", max_length=20)


@app.post("/api/tts", dependencies=[Depends(limit("tts"))])
async def text_to_speech(req: TTSRequest):
    text = req.text.strip()[:2000]   # edge-tts has no hard limit, but cap to keep latency sane
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    try:
        audio = await tts_synthesize(text, req.lang)
    except Exception as e:
        log.warning("TTS failed: %s", e)
        raise HTTPException(status_code=502, detail="TTS is unavailable right now")
    return Response(content=audio, media_type="audio/mpeg")


# ── Portfolio (the only endpoint here that touches Supabase / needs auth) ──────

def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization[7:].strip()


@app.get("/api/portfolio/summary", dependencies=[Depends(limit("portfolio"))])
def portfolio_summary(user_id: str = Query(..., max_length=64), authorization: Optional[str] = Header(None)):
    """
    Aggregated portfolio summary for one user — holdings pulled from Supabase,
    share prices refreshed where available, AMFI NAV for funds, and an explicit
    cached-price/cost fallback where a fresh price is unavailable. Requires a Supabase session
    token belonging to user_id — every other endpoint in this file is public
    market data with no namespace, this is the one that needed real auth.
    """
    try:
        verify_user_matches(_bearer_token(authorization), user_id)
    except AuthError as e:
        raise HTTPException(status_code=403, detail=f"unauthorized: {e}")

    result = get_portfolio_summary(user_id, _bearer_token(authorization))
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.get("/api/portfolio/export", dependencies=[Depends(limit("portfolio"))])
def portfolio_export(user_id: str = Query(..., max_length=64), authorization: Optional[str] = Header(None)):
    """
    Same data as /api/portfolio/summary, as a downloadable .xlsx — holdings +
    unrealized P&L. NOT a capital-gains tax computation (no purchase-date
    column exists on holdings anywhere in this codebase to classify STCG vs
    LTCG from — see reports/generator.py's portfolio_excel() docstring).
    """
    try:
        verify_user_matches(_bearer_token(authorization), user_id)
    except AuthError as e:
        raise HTTPException(status_code=403, detail=f"unauthorized: {e}")

    result = get_portfolio_summary(user_id, _bearer_token(authorization))
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])

    path = portfolio_excel(result)
    # holdings are personal data: the generated file is removed as soon as it has been sent
    safe_id = re.sub(r"[^A-Za-z0-9]", "", user_id)[:8]
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        background=BackgroundTask(_remove_file, path),
                        headers={"Content-Disposition": f"attachment; filename=portfolio_{safe_id}.xlsx"})


# ── Agent Tool Gateway ────────────────────────────────────────────────────────
# Single endpoint: arya-sidebar-panel.js calls POST /api/tool with {name, args}
# This decouples the JS agent from knowing each individual endpoint.

class ToolCall(BaseModel):
    name: str = Field(..., max_length=64)
    args: dict = Field(default_factory=dict)

# tools that cost more than a cached market lookup are counted against the stricter route groups as well
_TOOL_GROUPS = {"read_url": "fetch", "search_web": "fetch", "generate_report": "report"}

_TOOL_MAP = {
    "get_quote":        lambda a: get_quote(a.get("symbol","NIFTY"), a.get("exchange","NSE")),
    "get_quotes":       lambda a: {"quotes": get_multiple_quotes(
                                       a.get("symbols",[]), a.get("exchange","NSE"))},
    "get_market":       lambda a: get_market_overview(),
    "get_commodities":  lambda a: get_commodities(),
    "get_crypto":       lambda a: get_crypto(a.get("coins")),
    "get_fx":           lambda a: _fx_payload(),
    "get_mf_nav":       lambda a: get_mf_nav(a.get("scheme_code","")),
    "search_mf":        lambda a: {"results": search_mf(a.get("query",""), a.get("limit",10))},
    "get_history":      lambda a: get_historical(
                                       a.get("symbol",""), a.get("period","1y"),
                                       a.get("interval","1d"), a.get("exchange","NSE")),
    "analyze_stock":    lambda a: analyze(a.get("symbol",""), a.get("exchange","NSE")),
    "multi_tf":         lambda a: multi_timeframe_summary(a.get("symbol",""), a.get("exchange","NSE")),
    "get_news":         lambda a: {"articles": fetch_news()[:a.get("limit",15)],
                                   "sentiment": aggregate_sentiment(fetch_news())},
    "search_web":       lambda a: {"results": web_search(a.get("query",""), a.get("max",5))},
    "read_url":         lambda a: {"content": read_url(a.get("url",""), a.get("max_chars",3000))},
    "get_announcements":lambda a: {"announcements": get_announcements(
                                       a.get("symbol"), a.get("limit",10))},
    "market_status":    lambda a: get_market_status(),
    "generate_report":  lambda a: _generate_report_tool(a),
}


def _generate_report_tool(args: dict) -> dict:
    """
    Returns a report URL for the frontend to open in a new tab (per the
    original spec: "opens in new tab or downloads") rather than streaming file
    bytes through this JSON gateway — the actual generation+serving already
    works via the REST endpoints below, this just points at them.
    Scoped to "quote" and "market" only — both are public data, no auth. A
    "portfolio" report type is deliberately NOT exposed here: that data is
    per-user and the real endpoint requires a verified Supabase token this
    generic, unauthenticated tool gateway has no way to carry. Use
    GET /api/portfolio/export directly (with the user's own auth) for that.
    """
    report_type = args.get("type", "")
    fmt = args.get("format", "html")
    if fmt not in ("html", "pdf"):
        return {"error": f"format must be html or pdf, got {fmt!r}"}

    base = f"http://localhost:{PORT}"
    if report_type == "quote":
        symbol = args.get("symbol")
        if not symbol:
            return {"error": "type=quote requires a symbol"}
        symbol = str(symbol).strip().upper()
        if not _SYMBOL_OK.match(symbol):          # the symbol is put into a URL below
            return {"error": "Invalid symbol"}
        url = f"{base}/api/report/quote/{symbol}?format={fmt}"
    elif report_type == "market":
        url = f"{base}/api/report/market?format={fmt}"
    else:
        return {"error": f"type must be 'quote' or 'market', got {report_type!r}"}

    return {"report_url": url, "opens_in": "new_tab", "format": fmt}

@app.post("/api/tool")
def tool_gateway(call: ToolCall, request: Request):
    """
    Universal tool gateway for arya-sidebar-panel.js agent.
    POST /api/tool  body: {"name": "get_quote", "args": {"symbol": "RELIANCE"}}
    """
    fn = _TOOL_MAP.get(call.name)
    if not fn:
        raise HTTPException(status_code=404, detail="Unknown tool")
    ratelimit.enforce("tool", request)
    if call.name in _TOOL_GROUPS:
        ratelimit.enforce(_TOOL_GROUPS[call.name], request)
    try:
        result = fn(call.args)
        return {"tool": call.name, "result": result, "ts": int(time.time())}
    except Exception as e:
        # the exception text can carry internal detail (hosts, paths, library messages): log it, return its type only
        log.warning("tool %s failed: %s", call.name, e)
        return {"tool": call.name, "error": f"Tool failed ({type(e).__name__})", "ts": int(time.time())}


# ── Chat (streaming) — used by the mobile app ─────────────────────────────────
# POST /api/chat  body: {"message": "...", "context": {...optional FIN-OS profile...}}
# Streams Server-Sent Events:  data: {"text": "<token>"}\n\n  ...  data: [DONE]\n\n

_ARYA_SYSTEM = (
    "You are Arya, the financial advisor inside FIN-OS, a personal finance app for India. "
    "Answer concisely in plain language with Indian context: rupees (₹, lakh/crore), SIP/ELSS/PPF/NPS/EPF, "
    "old vs new tax regime, SEBI/RBI rules. Use the user's profile below when relevant. "
    "You are not a licensed advisor — for specific buy/sell calls, remind the user to verify with a SEBI-registered advisor."
)


_chat_slots = threading.BoundedSemaphore(max(1, int(os.getenv("ARYA_CHAT_CONCURRENCY", "4"))))
CHAT_MAX_MESSAGE = 4000          # characters
CHAT_MAX_CONTEXT_KEYS = 40
CHAT_MAX_CONTEXT_VALUE = 200     # characters per profile value


class ChatRequest(BaseModel):
    message: str = Field(..., max_length=CHAT_MAX_MESSAGE)
    context: Optional[dict] = None
    stream: bool = True


def _clean_context(ctx: Optional[dict]) -> str:
    """The optional profile the app sends is pasted into the system prompt, so it is reduced to short 'key: value' facts:
    at most 40 keys, simple keys, scalar values only, no line breaks (a value must not be able to start a new instruction line)."""
    if not isinstance(ctx, dict):
        return ""
    facts = []
    for k, v in list(ctx.items())[:CHAT_MAX_CONTEXT_KEYS]:
        if v in (None, "", 0) or isinstance(v, (dict, list, tuple, set)):
            continue
        key = re.sub(r"[^A-Za-z0-9_ ]", "", str(k))[:40].strip()
        val = re.sub(r"\s+", " ", str(v))[:CHAT_MAX_CONTEXT_VALUE].strip()
        if key and val:
            facts.append(f"{key}: {val}")
    return "; ".join(facts)


def _pick_ollama_model() -> str:
    """Configured model if installed, else the first installed one."""
    import requests
    try:
        names = [m["name"] for m in requests.get(f"{OLLAMA_BASE}/api/tags", timeout=3).json().get("models", [])]
    except Exception:
        return OLLAMA_MODEL
    if OLLAMA_MODEL in names or not names:
        return OLLAMA_MODEL
    return names[0]


@app.post("/api/chat", dependencies=[Depends(limit("chat"))])
def chat(req: ChatRequest):
    import requests
    from fastapi.responses import StreamingResponse

    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    system = _ARYA_SYSTEM
    facts = _clean_context(req.context)
    if facts:
        system += f"\nUser profile — {facts}."

    payload = {
        "model": _pick_ollama_model(),
        "stream": True,
        "think": False,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": message}],
    }

    def sse(obj) -> str:
        return f"data: {json.dumps(obj) if not isinstance(obj, str) else obj}\n\n"

    def gen():
        # At most a few model generations at once on this machine, whoever asks; taken here (not in the route) so a client that
        # disconnects before the stream starts cannot leave a slot held.
        if not _chat_slots.acquire(blocking=False):
            yield sse({"text": "Arya is busy with other requests. Please try again in a moment."})
            yield sse("[DONE]")
            return
        try:
            with requests.post(f"{OLLAMA_BASE}/api/chat", json=payload, stream=True, timeout=(5, 120)) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if not line:
                        continue
                    part = json.loads(line)
                    tok = part.get("message", {}).get("content", "")
                    if tok:
                        yield sse({"text": tok})
                    if part.get("done"):
                        break
        except Exception as e:
            # not the exception text: it names the model host and port
            log.warning("chat stream failed: %s", e)
            yield sse({"text": "\n\n[Arya is offline: the local model could not be reached]"})
        finally:
            _chat_slots.release()
        yield sse("[DONE]")

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# ── Cache management ──────────────────────────────────────────────────────────

# ── Zerodha Kite Connect — Phase 19 ──────────────────────────────────────────
# Credentials (KITE_API_KEY / KITE_API_SECRET) live in .env.
# The browser stores the per-day access_token in localStorage and passes it
# via the X-Kite-Token header on every /api/kite/* call.

def _js_json(obj) -> str:
    """JSON that is safe to put inside an inline <script>: '<' (so '</script>' cannot appear) and the two JS line separators are escaped."""
    return json.dumps(obj).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


# The popup hands the access token to the page that opened it. postMessage with target "*" would deliver it to whatever page
# opened the popup; instead it is sent to each origin this server trusts: config.CORS_ORIGINS plus localhost / 127.0.0.1 on the
# usual dev-server ports (ARYA_KITE_OPENER_PORTS). A message to an origin that is not the opener's is dropped by the browser.
_KITE_OPENER_PORTS = [p.strip() for p in os.getenv("ARYA_KITE_OPENER_PORTS", "3000,5173,7474,8000,8080,8081,8082").split(",") if p.strip().isdigit()]


def _kite_opener_origins() -> list:
    out = [o for o in CORS_ORIGINS if o != "*"]
    out += [f"http://{h}:{p}" for h in ("localhost", "127.0.0.1") for p in _KITE_OPENER_PORTS]
    return list(dict.fromkeys(out))


_POST_TO_OPENER = """
  if (window.opener) {
    const targets = %s;
    targets.forEach(function (o) { try { window.opener.postMessage(payload, o); } catch (e) {} });
  }""" % _js_json(_kite_opener_origins())

_KITE_PAGE_HEADERS = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff"}


def _kite_token(x_kite_token: Optional[str] = Header(None)) -> str:
    if not x_kite_token:
        raise HTTPException(status_code=401, detail="Missing X-Kite-Token header. Connect Zerodha first.")
    return x_kite_token


@app.get("/api/kite/status")
def kite_status():
    """Check whether Kite credentials are configured in .env."""
    return {
        "configured": kite.credentials_configured(),
        "login_url": kite.get_login_url() if kite.credentials_configured() else None,
        "message": (
            "Ready — open login_url to authenticate."
            if kite.credentials_configured()
            else "KITE_API_KEY and KITE_API_SECRET not set in .env. "
                 "Create an app at https://developers.kite.trade/ and add the credentials."
        ),
    }


@app.get("/api/kite/login")
def kite_login():
    """Return the Zerodha OAuth login URL. Frontend opens this in a popup."""
    if not kite.credentials_configured():
        raise HTTPException(status_code=503, detail="Kite credentials not configured in .env.")
    return {"login_url": kite.get_login_url()}


@app.get("/api/kite/callback")
def kite_callback(request_token: str = Query(...)):
    """
    OAuth callback endpoint — Zerodha redirects here after login.
    Exchanges request_token for access_token and returns an HTML page
    that postMessages the token back to window.opener (the FIN-OS popup caller).

    Set this URL as the redirect_uri in your Kite Connect app dashboard:
        http://localhost:7475/api/kite/callback
    """
    if not kite.credentials_configured():
        raise HTTPException(status_code=503, detail="Kite credentials not configured.")

    try:
        session_data = kite.exchange_token(request_token)
    except Exception as exc:
        log.warning("Kite token exchange failed: %s", exc)
        message = "Zerodha login could not be completed"
        html_error = f"""<!doctype html><html><body>
<script>
  const payload = {_js_json({"type": "kite_auth_error", "error": message})};
  {_POST_TO_OPENER}
  window.close();
</script>
<p>{_html.escape(message)}. You can close this window.</p>
</body></html>"""
        return Response(content=html_error, media_type="text/html", headers=_KITE_PAGE_HEADERS)

    access_token  = session_data.get("access_token", "")
    user_name     = session_data.get("user_name", "")
    user_shortname = session_data.get("user_shortname", "")
    email         = session_data.get("email", "")
    login_time    = session_data.get("login_time", "")

    # Return a mini HTML page that sends the token back and closes the popup.
    html = f"""<!doctype html>
<html>
<head><title>Zerodha Connected</title></head>
<body style="margin:0;background:#080B14;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
<div style="text-align:center;color:#F5F7FA;">
  <div style="font-size:48px;margin-bottom:16px;">✅</div>
  <div style="font-size:20px;font-weight:700;margin-bottom:8px;">Connected!</div>
  <div style="font-size:14px;color:#8892A4;">Welcome, {_html.escape(str(user_name or user_shortname))}. Closing window…</div>
</div>
<script>
  const payload = {_js_json({"type": "kite_auth_success", "access_token": access_token, "user_name": user_name,
                             "email": email, "login_time": login_time})};
  {_POST_TO_OPENER}
  setTimeout(() => window.close(), 1200);
</script>
</body>
</html>"""
    return Response(content=html, media_type="text/html", headers=_KITE_PAGE_HEADERS)


@app.get("/api/kite/holdings")
def kite_holdings(token: str = Depends(_kite_token)):
    """
    Returns the authenticated user's Demat equity holdings.
    Requires X-Kite-Token: <access_token> header.
    """
    try:
        holdings = kite.get_holdings(token)
        return {"status": "success", "data": holdings, "count": len(holdings)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Kite API error: {exc}")


@app.get("/api/kite/positions")
def kite_positions(token: str = Depends(_kite_token)):
    """Returns today's net and day positions."""
    try:
        positions = kite.get_positions(token)
        return {"status": "success", "data": positions}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Kite API error: {exc}")


@app.get("/api/kite/orders")
def kite_orders(token: str = Depends(_kite_token)):
    """Returns all orders placed today."""
    try:
        orders = kite.get_orders(token)
        return {"status": "success", "data": orders, "count": len(orders)}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Kite API error: {exc}")


@app.get("/api/kite/margins")
def kite_margins(token: str = Depends(_kite_token)):
    """Returns available fund margins (equity + commodity segments)."""
    try:
        margins = kite.get_margins(token)
        return {"status": "success", "data": margins}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Kite API error: {exc}")


@app.post("/api/cache/clear")
def clear_cache(x_admin_token: Optional[str] = Header(None)):
    """Empties the in-memory cache. Operator-only: every following request goes back to the upstream data sources, so an
    anonymous caller could use this to multiply the load on them. Disabled unless ARYA_ADMIN_TOKEN is set."""
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Disabled: set ARYA_ADMIN_TOKEN to enable cache clearing")
    if not x_admin_token or not hmac.compare_digest(x_admin_token.encode(), ADMIN_TOKEN.encode()):
        raise HTTPException(status_code=403, detail="Forbidden")
    cache.purge(0)
    return {"cleared": True}


@app.get("/api/cache/stats")
def cache_stats():
    return {"memory_entries": cache.size()}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host=HOST, port=PORT, reload=True, log_level="info")
