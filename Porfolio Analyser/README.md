# Portfolio.AI — Real-Time Fundamentals Backend

> FastAPI · NSE India · yfinance · Screener.in  
> **Port:** 8766 | **Version:** v2.0 | **Updated:** July 2026

The backend that powers `portfolio-analyser-v10.html` — the flagship Portfolio.AI page. Provides live prices, fundamentals, batch quotes, and price history for NSE / BSE stocks via three parallel data sources.

---

## Folder Structure

```
Porfolio Analyser/
├── server.py                   ← FastAPI server (entry point)
├── portfolio-analyser-v10.html ← Current production UI (21,691 lines)
├── portfolio-analyser-v9.html  ← Previous version (archived)
└── server.log                  ← Runtime log file
```

---

## Data Sources (fetched in parallel per request)

| Source | Data | TTL |
|---|---|---|
| NSE India official API | Live price, O/H/L, 52-week range, delivery %, circuit limits | 60 seconds |
| yfinance quoteSummary | P/E, P/B, ROE, EV/EBITDA, margins, EPS, market cap, beta | 6 hours |
| Screener.in (scraper) | D/E ratio, current ratio, ROCE — cross-check fallback | 6 hours |

Three sources run concurrently via `asyncio.gather`. If yfinance fails, Screener.in values are used. If both fail, NSE price data alone is returned.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Server status + cache stats (hit rate, size) |
| GET | `/quote/{symbol}` | Full live quote + fundamentals for one stock |
| GET | `/bulk?symbols=A,B,C` | Batch up to 50 symbols in parallel |
| GET | `/history/{symbol}` | OHLCV price history |

### GET /quote/{symbol}

```
GET /quote/RELIANCE
```

Response:
```json
{
  "symbol": "RELIANCE",
  "price": 2943.50,
  "change": 12.30,
  "change_pct": 0.42,
  "high": 2951.00,
  "low": 2928.00,
  "52w_high": 3217.90,
  "52w_low": 2220.00,
  "pe": 23.4,
  "pb": 2.1,
  "roe": 14.8,
  "market_cap": 1987432000000,
  "beta": 0.82,
  "delivery_pct": 61.2,
  "circuit_up": 3237.85,
  "circuit_down": 2649.15
}
```

### GET /bulk?symbols=

```
GET /bulk?symbols=RELIANCE,TCS,INFY,HDFCBANK,WIPRO
```

Returns an array of quote objects. Up to 50 symbols per request, all fetched concurrently (max 20 parallel connections).

### GET /history/{symbol}

```
GET /history/RELIANCE?period=1y&interval=1d
```

| Parameter | Options | Default |
|---|---|---|
| `period` | `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y` | `1y` |
| `interval` | `1m`, `5m`, `15m`, `30m`, `1h`, `1d`, `1wk`, `1mo` | `1d` |

---

## Caching

| Cache | TTL | Purpose |
|---|---|---|
| Price cache | 60 seconds | Live market hours accuracy |
| Fundamentals cache | 6 hours | P/E, ROE don't change minute-to-minute |
| History cache | 5 minutes | OHLCV data for charts |

All caches are in-memory (`cachetools.TTLCache`) — reset on server restart.

---

## Features (portfolio-analyser-v10.html)

The v10 frontend (21,691 lines) has 30+ features including:

| Feature | Description |
|---|---|
| Live portfolio overview | Cards with current P&L, XIRR, allocation |
| News Feed + AI Sentiment | Financial news with sentiment scoring per holding |
| Peer Comparison Table | Side-by-side fundamentals vs sector peers |
| Promoter Holding Trend | Quarterly promoter stake change chart |
| Watchlist & Screener | Custom watchlist + rule-based screener |
| Command Palette (⌘K) | Quick-jump to any stock or feature |
| Drag & Drop Overview | Rearrange portfolio cards |
| Share Link | Shareable portfolio snapshot URL |
| 4-Theme System | Dark / Light / Bloomberg / Saffron |

---

## Setup

```bash
cd "Porfolio Analyser"
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn yfinance pandas httpx cachetools

python server.py
# → http://localhost:8766
# Swagger docs at http://localhost:8766/docs
```

---

## Port Note

Port 8766 was chosen to avoid conflict with:
- `voiceagent/agent.py` → ws://127.0.0.1:8765 (WebSocket)
- `arya-ai/server.py` → http://localhost:7475
- `rag-engine/server.py` → http://localhost:7476

The frontend page connects to `http://127.0.0.1:8766` hardcoded in `portfolio-analyser-v10.html`.

---

## Dependencies

```
fastapi, uvicorn    — API server
yfinance            — Fundamentals + OHLCV history
pandas              — Data processing
httpx               — Async NSE API + Screener.in scraping
cachetools          — TTL in-memory cache
```
