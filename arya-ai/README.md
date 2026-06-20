# Arya AI — Backend Engine

Standalone Python backend for the Arya AI financial assistant.
**Zero dependency on voice AI, alerts, document-AI, or any other FIN-OS module.**

## Folder Structure

```
arya-ai/
├── server.py           ← FastAPI entry point (port 7475). Start here.
├── config.py           ← All settings. Override via .env
├── start.sh            ← One-command startup
├── requirements.txt    ← Python dependencies
├── .env.example        ← Copy to .env and configure
│
├── data/
│   ├── market.py       ← NSE/BSE quotes, AMFI NAVs, gold, crypto, FX
│   ├── news.py         ← RSS news scraper + DuckDuckGo search + URL reader
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
    ├── generator.py    ← HTML stock + market overview report builder
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
- Cloud: **none** — 100% local

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
| `GET /api/report/quote/{symbol}` | HTML stock report |
| `POST /api/tool` | Universal tool gateway (used by JS agent) |

## Tool Gateway

The JS agent (`arya-sidebar-panel.js`) calls this single endpoint:

```js
POST /api/tool
Body: { "name": "get_quote", "args": { "symbol": "RELIANCE" } }
```

Available tool names: `get_quote`, `get_quotes`, `get_market`, `get_commodities`,
`get_crypto`, `get_fx`, `get_mf_nav`, `search_mf`, `get_history`, `analyze_stock`,
`multi_tf`, `get_news`, `search_web`, `read_url`, `get_announcements`, `market_status`

## Cache Strategy

| Layer | Store | TTL |
|-------|-------|-----|
| L1 | In-memory (dict) | Per config (10s quotes) |
| L2 | SQLite (arya.db) | Per config (longer) |
| L3 | Live fetch | On cache miss |
