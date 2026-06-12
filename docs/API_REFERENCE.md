# FIN-OS — API Reference

> Version: 1.3 | Date: June 10, 2026  
> All APIs run locally. None are deployed to Vercel (static-only).

---

## Arya AI API — `Porfolio Analyser/server.py` (HTTP :8766)

Arya AI backend for Portfolio.AI (`portfolio-analyser-v10.html`). Local only — NOT deployed to Vercel.

### Server configuration

| Parameter | Value |
|---|---|
| Port | **8766** |
| Protocol | HTTP (plain) |
| Analysis model | `llama3.1:latest` (8B) |
| Analysis num_ctx | **2560** |
| Analysis temperature | **0.25** |
| Chat model | `llama3.2:3b` (fast follow-ups) |
| Chat num_ctx | **1536** |
| Chat temperature | **0.45** |
| Client max_tokens (analysis) | **700** |
| Client max_tokens (chat) | **300** |

### `POST /arya`

Non-streaming analysis. Returns a complete JSON response.

```bash
curl -X POST http://localhost:8766/arya \
  -H "Content-Type: application/json" \
  -d '{
    "page": "overview",
    "prompt": "Analyse my portfolio health",
    "context": "Portfolio value ₹8.5L, CAGR 14.2%, health score 72/100, Kelly f*=0.28",
    "type": "analysis"
  }'
```

**Response:**
```json
{
  "response": "VERDICT: Your portfolio is in GOOD health (72/100) with a 14.2% CAGR...\n\n**Strengths**\n...\n\n**Risks**\n...\n\n**Action**\n...\n\n⚡ ARYA'S CALL: NSE:RELIANCE — HOLD ₹0 · High conviction · Top holding, strong moat, fairly valued"
}
```

### `POST /arya/stream`

SSE streaming analysis. Returns `text/event-stream` — each event is a token chunk.

```bash
curl -X POST http://localhost:8766/arya/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "page": "equity",
    "prompt": "Which stocks should I trim?",
    "context": "...",
    "type": "analysis"
  }'
```

**Stream events:**
```
data: {"token": "VERDICT: "}
data: {"token": "Trim "}
data: {"token": "HDFC Bank "}
...
data: {"done": true}
```

### Request body fields

| Field | Type | Description |
|---|---|---|
| `page` | string | Current page: `overview`, `equity`, `sectors`, `insights`, `tax`, `rebalance`, `analytics`, `quant`, `research`, `watchlist` |
| `prompt` | string | User's question or page auto-prompt |
| `context` | string | Pre-computed signals injected by JS (Kelly, G-Sec spread, Health Score, cross-page facts, etc.) |
| `type` | string | `analysis` (llama3.1, slower) or `chat` (llama3.2:3b, fast follow-up) |

---

## News Intel API — `app.py` (Flask :5000)

### `GET /api/intel`

Returns aggregated financial news from Google News RSS.

```bash
curl http://localhost:5000/api/intel
```

**Response:**
```json
{
  "status": "online",
  "cached_ago": 120,
  "items": [
    {
      "id": "India_0",
      "title": "Sensex surges 400 points on FII buying",
      "link": "https://...",
      "source": "Economic Times",
      "type": "stocks",
      "high_impact": true,
      "region": "India",
      "timestamp": 1716000000
    }
  ]
}
```

**Fields:**
- `cached_ago` — seconds since last RSS fetch (TTL: 600s)
- `type` — `stocks` | `mutual_funds` | `economy` | `personal_finance` | `crypto`
- `high_impact` — true if title contains: surge, crash, record, RBI, Fed, crisis, rally, correction, inflation, rate cut/hike, ban, fraud, scam, bubble

No authentication required.

---

## Alert Engine API — `alerts/alert-engine.py` (FastAPI :8001)

All endpoints except `/health` and `/vapid-public-key` require a `user_id` parameter.

### `GET /health`

Engine health check.

```bash
curl http://localhost:8001/health
```
```json
{
  "status": "ok",
  "rules_loaded": 10,
  "scheduler_running": true,
  "supabase_connected": true
}
```

### `GET /vapid-public-key`

Returns the VAPID public key for Web Push subscription.

```bash
curl http://localhost:8001/vapid-public-key
```
```json
{ "public_key": "BNtq..." }
```

### `POST /subscribe`

Registers a push subscription for the user.

```bash
curl -X POST http://localhost:8001/subscribe \
  -H "Content-Type: application/json" \
  -d '{"user_id": "uuid", "subscription": {"endpoint": "...", "keys": {"p256dh": "...", "auth": "..."}}}'
```
```json
{ "status": "subscribed" }
```

### `GET /alerts?user_id=<uuid>&limit=20`

Returns the last `limit` alerts for the user.

```bash
curl "http://localhost:8001/alerts?user_id=abc123&limit=10"
```
```json
{
  "alerts": [
    {
      "id": "uuid",
      "rule_id": "sip_missed",
      "title": "SIP not invested this month",
      "message": "Your monthly SIP of INR 10,000 was not detected...",
      "priority": "warning",
      "triggered_at": "2026-06-05T10:30:00Z",
      "read_at": null
    }
  ]
}
```

### `POST /alerts/<id>/read`

Marks an alert as read.

```bash
curl -X POST http://localhost:8001/alerts/uuid/read
```
```json
{ "status": "ok" }
```

### `GET /health-score?user_id=<uuid>`

Returns the user's current financial health score.

```bash
curl "http://localhost:8001/health-score?user_id=abc123"
```
```json
{
  "score": 72,
  "pillars": {
    "emergency_fund": 85,
    "debt_load": 60,
    "investment_rate": 75,
    "insurance_cover": 80,
    "net_worth_growth": 65,
    "expense_discipline": 70
  },
  "grade": "B",
  "last_calculated": "2026-06-05T10:30:00Z"
}
```

Grades: `A` (≥80) · `B` (60–79) · `C` (40–59) · `D` (<40)

---

## Chatbot Brain API — `chatbot/brain.py` (Python :8000)

### `POST /chat`

Processes a text message through the QFT (Quantified Financial Thinking) engine.

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Should I invest in FD or mutual funds?", "user_id": "uuid"}'
```
```json
{
  "response": "For a 3-year horizon with moderate risk tolerance, index mutual funds historically outperform FDs...",
  "intent": "investment_comparison",
  "sources": ["FD 7%", "Nifty 12% CAGR 20Y average"]
}
```

---

## Stock Engine API — `stock-engine/` (FastAPI, 6 services)

All services are accessible under a common gateway or individually by port.

### Service Map

| Service | Port | Purpose |
|---|---|---|
| `market_data` | varies | Live and historical OHLCV |
| `indicators` | varies | Technical indicators (RSI, MACD, etc.) |
| `insights` | varies | AI-generated stock insights |
| `universe` | varies | Stock universe (NSE 500) |
| `screener` | varies | Natural language screener |
| `earnings` | varies | Earnings calendar and surprises |

### `GET /market-data/{symbol}`

```bash
curl "http://localhost:<port>/market-data/RELIANCE?period=1y&interval=1d"
```
```json
{
  "symbol": "RELIANCE",
  "period": "1y",
  "data": [
    { "date": "2025-06-05", "open": 2950, "high": 2980, "low": 2940, "close": 2965, "volume": 12400000 }
  ]
}
```

### `GET /indicators/{symbol}`

```bash
curl "http://localhost:<port>/indicators/RELIANCE"
```
```json
{
  "symbol": "RELIANCE",
  "rsi_14": 58.3,
  "macd": { "macd": 12.5, "signal": 10.2, "histogram": 2.3 },
  "sma_50": 2930,
  "sma_200": 2750,
  "signal": "bullish"
}
```

### `POST /screener/natural-language`

```bash
curl -X POST http://localhost:<port>/screener/natural-language \
  -H "Content-Type: application/json" \
  -d '{"query": "large cap IT stocks with P/E below 25 and positive earnings growth"}'
```
```json
{
  "results": [
    { "symbol": "TCS", "pe": 22.1, "earnings_growth": 12.5, "market_cap": "large" },
    { "symbol": "INFOSYS", "pe": 20.8, "earnings_growth": 9.2, "market_cap": "large" }
  ]
}
```

---

## Stock Dashboard API — `stock-dashboard/app.py` (Flask :5001)

### `GET /api/stock/{symbol}`

```bash
curl "http://localhost:5001/api/stock/RELIANCE"
```
```json
{
  "symbol": "RELIANCE",
  "name": "Reliance Industries Ltd",
  "price": 2965.50,
  "change": 12.30,
  "change_pct": 0.42,
  "volume": 12400000,
  "pe": 28.4,
  "market_cap": 2000000000000,
  "52w_high": 3200,
  "52w_low": 2650
}
```

---

## Budget Backend API — `ExpenseTracker/finos_backend/` (Django REST :8000)

### `GET /api/transactions/`

Returns paginated transactions for authenticated user.

**Authentication:** DRF Token or Supabase JWT via middleware.

```bash
curl http://localhost:8000/api/transactions/ \
  -H "Authorization: Token <token>"
```
```json
{
  "count": 128,
  "next": "http://localhost:8000/api/transactions/?page=2",
  "results": [
    {
      "id": 1,
      "amount": "50000.00",
      "type": "income",
      "category": "salary",
      "note": "June salary",
      "date": "2026-06-01"
    }
  ]
}
```

### `POST /api/transactions/`

Create a new transaction.

```bash
curl -X POST http://localhost:8000/api/transactions/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Token <token>" \
  -d '{"amount": "1200", "type": "expense", "category": "food", "date": "2026-06-05"}'
```

### `GET /api/summary/`

Returns income, expense, and savings totals for the current month.

```bash
curl http://localhost:8000/api/summary/ -H "Authorization: Token <token>"
```
```json
{
  "month": "2026-06",
  "income": 85000,
  "expense": 52000,
  "savings": 33000,
  "savings_rate": 38.8
}
```

---

## Error Format (all APIs)

All APIs return errors in this format:

```json
{
  "error": "user_not_found",
  "message": "No profile found for user_id: abc123",
  "status": 404
}
```

Common status codes:
- `200` — success
- `400` — bad request (missing or invalid params)
- `404` — resource not found
- `422` — validation error (FastAPI)
- `500` — server error
