# FIN-OS Quantum Stock Engine

> FastAPI · yfinance · numpy · WebSocket ticks  
> **Port:** 8002 | **Version:** v1 | **Updated:** July 2026

Full-featured stock data and technical analysis API with real-time WebSocket price streaming. Powers `stock-platform.html` and `options-intelligence.html`.

---

## Folder Structure

```
stock-engine/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             ← FastAPI entry point — routes + WebSocket
│       ├── cache.py            ← In-memory TTL cache (async-safe)
│       └── services/
│           ├── market_data.py  ← yfinance async wrapper (spot, history, fundamentals)
│           ├── indicators.py   ← IndicatorEngine: RSI, MACD, BB, ATR, EMA, SMA
│           ├── insights.py     ← Rule-based trading insights (buy/sell signals)
│           ├── screener.py     ← NL natural-language stock screener
│           ├── earnings.py     ← Earnings calendar + surprise analysis
│           └── market_data.py  ← Universe: NIFTY 500 + US stocks search
└── frontend/
    └── src/                    ← (React frontend, if present)
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Service status |
| GET | `/api/stock/{symbol}` | Full quote: price, change, 52w, volume, market cap |
| GET | `/api/history/{symbol}` | OHLCV bars (configurable range + interval) |
| GET | `/api/indicators/{symbol}` | All technical indicators for a symbol |
| GET | `/api/insights/{symbol}` | Rule-based signals (buy/sell/hold + reasoning) |
| GET | `/api/depth/{symbol}` | Order book depth (bid/ask levels) |
| GET | `/api/fundamentals/{symbol}` | P/E, P/B, ROE, EPS, margins, D/E, dividend |
| GET | `/api/sectors` | Sector breakdown of Nifty 500 universe |
| GET | `/api/search?q=...` | Ticker / company name autocomplete |
| WS | `/ws/ticks` | Real-time price stream |

### GET /api/history/{symbol}

```
GET /api/history/RELIANCE.NS?interval=1d&range=1y
```

| Parameter | Options |
|---|---|
| `interval` | `1m`, `5m`, `15m`, `30m`, `1h`, `1d`, `1wk`, `1mo` |
| `range` | `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y` |

### WS /ws/ticks

```javascript
const ws = new WebSocket('ws://localhost:8002/ws/ticks');

// Subscribe to symbols
ws.send(JSON.stringify({ symbols: ['RELIANCE.NS', 'TCS.NS'] }));

// Receive ticks
ws.onmessage = (e) => {
  const tick = JSON.parse(e.data);
  // { symbol, price, change, change_pct, volume, timestamp }
};
```

Ticks are pushed every `TTL_QUOTE` seconds (default: 10s). Resubscribe anytime by sending a new `{ symbols: [...] }` frame — no reconnect needed.

---

## Technical Indicators (indicators.py)

All indicators are vectorised with numpy. Input: list of OHLCV bars. Output: aligned arrays.

| Indicator | Function | Parameters |
|---|---|---|
| SMA | `sma(values, period)` | Default: 20, 50, 200 |
| EMA | `ema(values, period)` | Default: 12, 26 |
| RSI | `rsi(closes, period=14)` | 14-period Wilder RSI |
| MACD | `macd(closes)` | 12/26 EMA diff + 9-period signal |
| Bollinger Bands | `bollinger(closes, period=20)` | Upper / middle / lower + % B |
| ATR | `atr(highs, lows, closes, period=14)` | Average True Range |

---

## Trading Insights (insights.py)

Rule-based signal engine. Each insight has:
- `signal`: `BUY` / `SELL` / `HOLD` / `WATCH`
- `confidence`: 0.0 – 1.0
- `reason`: human-readable explanation
- `timeframe`: `intraday` / `swing` / `positional`

Example signals:
- RSI < 30 + price at 52w support → BUY (oversold at support)
- MACD crossover + volume spike → BUY (momentum confirmation)
- Price > upper Bollinger + RSI > 75 → SELL (overbought)
- ADX > 25 + price above EMA200 → HOLD (strong uptrend, ride it)

---

## Natural Language Screener (screener.py)

```
POST /api/screen
{ "query": "show me IT stocks with PE below 20 and positive momentum" }
```

`NLScreener` parses plain English criteria and filters the Nifty 500 universe.

---

## Caching (cache.py)

Async-safe TTL cache using `asyncio.Lock`:

| Data | TTL |
|---|---|
| Spot price | 10 seconds |
| History (1d+) | 5 minutes |
| Fundamentals | 6 hours |
| Universe / sectors | 24 hours |

---

## Setup

```bash
cd stock-engine/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8002
# API at http://localhost:8002
# Docs at http://localhost:8002/docs
```

## Docker

```bash
docker build -t finos-stock-engine .
docker run -p 8002:8002 finos-stock-engine
```

---

## Dependencies

```
fastapi, uvicorn    — API server
yfinance            — NSE/BSE/US price + fundamentals
pandas, numpy       — Data processing + indicator math
websockets          — WebSocket tick streaming
httpx               — Async HTTP
```
