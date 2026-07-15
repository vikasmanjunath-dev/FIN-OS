# Arya AI — Backend Engine

Standalone Python backend for the Arya AI financial assistant.
**No dependency on voice AI, alerts, document-AI, or any other FIN-OS module —
except `/api/portfolio/summary`, the one endpoint that reads Supabase.** Every
other endpoint here is public market data with no user namespace and no auth.

## Folder Structure

```
arya-ai/
├── server.py           ← FastAPI entry point (port 7475). Start here.
├── config.py           ← All settings. Override via .env
├── auth.py             ← Supabase session-token verification (portfolio endpoint only)
├── start.sh            ← One-command startup
├── requirements.txt    ← Python dependencies
├── .env.example        ← Copy to .env and configure
│
├── data/
│   ├── market.py       ← NSE/BSE quotes, AMFI NAVs, gold, crypto, FX
│   ├── news.py         ← RSS news scraper + DuckDuckGo search + URL reader
│   │                     (trafilatura primary extractor, BS4 heuristic fallback)
│   ├── portfolio.py    ← Supabase holdings lookup + live price refresh
│   └── cache.py        ← In-memory TTL cache (L1, sits above SQLite L2)
│
├── intelligence/
│   ├── technical.py    ← TA engine: RSI, MACD, BB, EMA, SMA200, ADX
│   └── sentiment.py    ← Rule-based financial sentiment (-1.0 to +1.0)
│
├── db/
│   ├── schema.sql      ← SQLite table definitions
│   └── store.py        ← Thread-safe read/write helpers
│
└── reports/
    ├── generator.py    ← HTML/PDF stock + market reports, portfolio Excel export
    └── output/         ← Generated report files (gitignored)
```

## Start

```bash
cd arya-ai
./start.sh          # dev mode (auto-reload)
./start.sh --prod   # production (2 workers)
```

API docs: http://localhost:7475/docs

## Dependencies

- Data: **none** — NSE, AMFI, CoinGecko, RBI all have free public endpoints
- AI: **none** — Ollama runs separately; this backend only handles data
- Cloud: **Supabase, portfolio endpoints only** — same project the rest of FIN-OS
  uses; set `SUPABASE_URL`/`SUPABASE_ANON_KEY` in `.env` (see `.env.example`).
  Everything else stays 100% local with zero cloud calls.
- System libraries: **Pango**, for PDF export only (`brew install pango`) —
  not pip-installable, and on Apple Silicon you also need
  `DYLD_LIBRARY_PATH=/opt/homebrew/lib` for WeasyPrint to find it at runtime.
  `start.sh` sets this for you; running uvicorn directly won't.

## Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/quote/{symbol}` | Live NSE/BSE quote |
| `GET /api/market/overview` | Nifty, Sensex, Bank Nifty indices |
| `GET /api/mf/nav/{scheme_code}` | Mutual fund NAV (AMFI) |
| `GET /api/commodities` | Gold, silver, crude, FX rates |
| `GET /api/crypto` | Bitcoin, ETH, XRP in INR |
| `GET /api/news` | Financial news + sentiment |
| `GET /api/search?q=...` | DuckDuckGo web search |
| `GET /api/analyze/{symbol}` | Full technical analysis |
| `GET /api/report/quote/{symbol}?format=html\|pdf` | Stock report, HTML or PDF |
| `GET /api/report/market?format=html\|pdf` | Market overview report, HTML or PDF |
| `GET /api/portfolio/summary?user_id=...` | **Requires `Authorization: Bearer <supabase_token>`.** Live-valued holdings summary — see Auth below. |
| `GET /api/portfolio/export?user_id=...` | **Same auth.** Downloads the summary as `.xlsx` — holdings + unrealized P&L, two sheets (Holdings, Notes). Not a tax/capital-gains computation, see caveat in Auth section below. |
| `WS /ws/prices?symbols=...&exchange=NSE` | Live tick stream, pushes every `TTL_QUOTE` seconds. Resubscribe anytime by sending `{"symbols":[...]}` as a text frame, no reconnect needed. |
| `POST /api/tool` | Universal tool gateway (used by JS agent) |

## Auth (portfolio endpoints only)

`GET /api/portfolio/summary` and `GET /api/portfolio/export` are the only
endpoints here that aren't public. Both require a real Supabase session token
for the `user_id` being requested:

```bash
curl -H "Authorization: Bearer <supabase_access_token>" \
  "http://localhost:7475/api/portfolio/summary?user_id=<the same user's id>"
```

Verification calls Supabase's own `GET /auth/v1/user` (same pattern as
`rag-engine/storage/auth.py`) — no JWT secret needed, just the anon key. A
missing/garbage/mismatched token returns `403`. If Supabase itself is
unreachable or the holdings query fails, returns `502` with the real error
message, not a silent empty result.

**The Excel export is holdings + unrealized P&L, not a capital-gains tax
computation.** STCG (<12mo) vs LTCG (≥12mo) classification needs a lot-level
purchase date, and no `holdings` row anywhere in this codebase has one
(checked `js/finos-context.js`, `alerts/alert-engine.py` — both only select
`symbol/quantity/avg_price/current_price/asset_type`). Faking a date split
would produce a wrong tax number, which is worse than the feature not
existing — so it doesn't, and the exported file says so on its Notes sheet.

## Tool Gateway

The JS agent (`arya-sidebar-panel.js`) calls this single endpoint:

```js
POST /api/tool
Body: { "name": "get_quote", "args": { "symbol": "RELIANCE" } }
```

Available tool names: `get_quote`, `get_quotes`, `get_market`, `get_commodities`,
`get_crypto`, `get_fx`, `get_mf_nav`, `search_mf`, `get_history`, `analyze_stock`,
`multi_tf`, `get_news`, `search_web`, `read_url`, `get_announcements`, `market_status`,
`generate_report`

**`show_chart` is not in this list** — it's a *frontend-only* tool (lives in
`js/arya-sidebar-panel.js`, not here), since it renders a live candlestick +
volume chart directly in the Arya panel using Lightweight Charts (MIT,
TradingView) rather than returning JSON through this gateway. It calls this
backend's `/api/tool` → `get_history` under the hood for OHLCV data, same as
everything else here — the chart itself just isn't a `_TOOL_MAP` entry because
there's nothing for a backend tool to compute; the rendering happens entirely
client-side.

## Cache Strategy

| Layer | Store | TTL |
|-------|-------|-----|
| L1 | In-memory (dict) | Per config (10s quotes) |
| L2 | SQLite (arya.db) | Per config (longer) |
| L3 | Live fetch | On cache miss |
