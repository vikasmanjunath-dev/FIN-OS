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

- Data: **none** — NSE, AMFI (daily NAV file, plus the api.mfapi.in mirror for NAV history), Yahoo Finance (quotes, FX, commodities, company fundamentals), CoinGecko and public news RSS feeds are free public endpoints. The RBI reference rate is **not** used: FX comes from Yahoo Finance.
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
| `GET /api/quote/{symbol}` | Live NSE/BSE quote. `pe_ratio` and `price_to_book` are `null` here (the quote source has neither); use `/api/fundamentals`. |
| `GET /api/quotes?symbols=A,B,C` | Bulk quotes, at most 60 symbols per call (`truncated: true` when more were sent). A symbol that cannot be quoted comes back as `{error, symbol}`, never a made-up price. |
| `GET /api/fundamentals/{symbol}?exchange=NSE` | Company info from Yahoo: `pe_ratio` (trailing, cross-checked against price / EPS within 15%, else `null` with `pe_note`), `price_to_book`, `eps_ttm`, `market_cap`, `sector`, `industry`, `name`. Third-party figures; every field is `null` when unavailable. Returns `{error}` when nothing is available. |
| `GET /api/market/status` | Whether the Indian market is open now |
| `GET /api/market/overview` | Nifty, Sensex, Bank Nifty and other indices: `price`, `change`, `change_pct` (`null` when no previous close), year high/low, index P/E, P/B, dividend yield where NSE supplies them, `as_of`. An empty answer is never cached. |
| `GET /api/market/sectors` | Day change for the main NSE sector indices (a sector that cannot be fetched is absent) |
| `GET /api/history/{symbol}?period=&interval=` | OHLCV rows |
| `GET /api/chart?symbol=&interval=&range=` | OHLCV arrays for any Yahoo symbol (`RELIANCE.NS`, `^NSEI`, `GC=F`); `closes`, `opens`, `highs`, `lows`, `volumes` and `dates` (one per close, same order: `YYYY-MM-DD` for daily and longer intervals, an ISO timestamp for intraday; `[]` when the source gave no usable dates) |
| `GET /api/mf/nav/{scheme_code}` | Mutual fund NAV (AMFI daily file) |
| `GET /api/mf/search?q=...&limit=10` | Scheme search; every word of `q` must match the scheme name, house, plan or option, in any order. Returns `{results: [...]}`. |
| `GET /api/mf/history/{scheme_code}?years=6` | Daily NAV history, oldest first: `{history: [[YYYY-MM-DD, nav], ...], first_date, last_date, earliest_available, amfi_check, source, as_of}`. NAVs are AMFI's, served through the public mirror api.mfapi.in (backend only; the scheme code is the only thing sent) and checked against AMFI's own daily file (`amfi_check`). `years` is capped at 30. No returns are computed here. Errors: 400 invalid code, 404 no NAV data, 502 source unreachable. |
| `GET /api/commodities` | `{commodities, unavailable, as_of}`. Keys: `GOLD (10g, global equiv.)` (₹/10g), `SILVER (1kg, global equiv.)` (₹/kg), `CRUDE OIL (bbl)` (USD/bbl), `NATURAL GAS` (USD/MMBtu). Gold and silver are **world futures prices converted to rupees at the live USD/INR rate, not MCX quotes**; each carries `price_usd`, `usd_inr`, `price_date`, `change_pct` (`null` when unknown). With no USD/INR rate they move to `unavailable` (with the USD price) rather than use a guessed rate. A partial answer is returned but not cached. FX is not in this response. |
| `GET /api/fx` | `{USD_INR, EUR_INR, GBP_INR, JPY_INR, AED_INR}` for the pairs that could be fetched (Yahoo Finance market rates, **not** the RBI reference rate), or `{error}` when none could; a rate that could not be fetched is absent, never filled in. |
| `GET /api/crypto?coins=bitcoin,ethereum` | Prices in INR and USD with 24 h change, from CoinGecko; ids are validated; `{error}` when the source is unreachable (retried after 30 s) |
| `GET /api/news?limit=20&force=false` | Headlines from public RSS feeds fetched in parallel with timeouts, newest first (`published_ts`), plus `sentiment` (whole-word keyword rules on headline + summary, `sentiment_method` says so), `count`, `as_of` and `sources` (`feeds_ok`, `feeds_failed`, `feeds_total`, `at`: how many feeds answered). Some publishers refuse the backend; the answer still arrives from the others. |
| `GET /api/news/announcements?symbol=` | Corporate announcements |
| `GET /api/search?q=...` | DuckDuckGo web search |
| `GET /api/analyze/{symbol}` | Full technical analysis |
| `GET /api/analyze/{symbol}/multi` | Short / medium / long-term summary |
| `GET /api/report/quote/{symbol}?format=html\|pdf` | Stock report, HTML or PDF |
| `GET /api/report/market?format=html\|pdf` | Market overview report, HTML or PDF |
| `GET /api/portfolio/summary?user_id=...` | **Requires `Authorization: Bearer <supabase_token>`.** Live-valued holdings summary — see Auth below. |
| `GET /api/portfolio/export?user_id=...` | **Same auth.** Downloads the summary as `.xlsx` — holdings + unrealized P&L, two sheets (Holdings, Notes). Not a tax/capital-gains computation, see caveat in Auth section below. |
| `WS /ws/prices?symbols=...&exchange=NSE` | Live tick stream, pushes every `TTL_QUOTE` seconds. Resubscribe anytime by sending `{"symbols":[...]}` as a text frame, no reconnect needed. |
| `POST /api/tool` | Universal tool gateway (used by JS agent) |
| `GET /api/read?url=&max_chars=` | Clean text extracted from a URL (the agent's `read_url` tool) |
| `POST /api/chat` | Streams a reply from the local Ollama model, with optional profile `context` |
| `POST /api/tts` | Text to speech (MP3) for the voice features |
| `GET /api/kite/status`, `/login`, `/callback`, `/holdings`, `/positions`, `/orders`, `/margins` | Optional Zerodha Kite connection (needs `KITE_API_KEY` / `KITE_API_SECRET` in `.env`); read-only, no orders are placed |
| `POST /api/cache/clear`, `GET /api/cache/stats` | In-memory cache housekeeping |
| `GET /health` | Liveness: `{status, ts}` |

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
