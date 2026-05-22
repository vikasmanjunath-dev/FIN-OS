# FIN-OS — API Reference

All backend APIs run locally. None are deployed to Vercel (which is static-only).

---

## News Intel API — `app.py` (Flask :5000)

### `GET /api/intel`

Returns aggregated financial news from Google News RSS.

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
- `status` — `"online"` always while server is running
- `cached_ago` — seconds since last RSS fetch (cache TTL = 600s)
- `items[].type` — `"stocks"` | `"mutual_funds"` | `"economy"` | `"personal_finance"` | `"crypto"`
- `items[].high_impact` — true if title contains: surge, crash, record, RBI, Fed, crisis, breakout, inflation, rate cut, rate hike, ban, fraud, scam, bubble, correction, rally

**No authentication required.**

```bash
curl http://localhost:5000/api/intel
```

---

## Alert Engine API — `alerts/alert-engine.py` (FastAPI :8001)

All endpoints except `/vapid-public-key` and `/health` require a `user_id` parameter.

### `GET /health`

Engine health check.

```json
{
  "status": "ok",
  "rules_loaded": 10,
  "scheduler_running": true,
  "supabase_connected": true
}
```

### `GET /market`

Nifty 50 live snapshot via yfinance.

```json
{
  "symbol": "^NSEI",
  "price": 22847.50,
  "change": -124.30,
  "change_pct": -0.54,
  "timestamp": 1716000000
}
```

### `GET /alerts/{user_id}`

Fetch alerts for a user.

**Query params:**
- `limit` — default 50, max 200
- `unread_only` — `true` | `false` (default false)

**Response:**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "rule_id": "market_drop",
      "title": "Nifty 50 dropped 3.2%",
      "message": "Nifty 50 fell 3.2% today — from 23,500 to 22,747. Consider reviewing your equity allocation or adding to your SIP at this dip.",
      "priority": "warning",
      "read": false,
      "action_url": "/html/markets.html",
      "created_at": "2026-05-23T09:15:00Z"
    }
  ],
  "unread_count": 3
}
```

### `POST /alerts/{alert_id}/read`

Mark one alert as read.

**Response:** `{ "success": true }`

### `POST /alerts/mark-all-read/{user_id}`

Mark all alerts for a user as read.

**Response:** `{ "success": true, "count": 5 }`

### `POST /alerts/subscribe`

Register a browser for Web Push notifications.

**Request body:**
```json
{
  "user_id": "uuid",
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
}
```

**Response:** `{ "success": true }`

### `DELETE /alerts/subscribe`

Unregister a push subscription.

**Request body:**
```json
{
  "user_id": "uuid",
  "endpoint": "https://fcm.googleapis.com/..."
}
```

### `GET /vapid-public-key`

Returns the VAPID public key for the browser to use when subscribing.

```json
{ "publicKey": "BN..." }
```

### `PUT /alerts/preferences`

Update rule preferences for a user.

**Request body:**
```json
{
  "user_id": "uuid",
  "preferences": {
    "market_drop": { "enabled": true, "channels": { "in_app": true, "push": false } },
    "sip_missed": { "enabled": false }
  }
}
```

### `GET /alerts/preferences/{user_id}`

Get all preferences for a user.

```json
{
  "sip_missed":          { "enabled": true,  "channels": { "in_app": true, "push": true } },
  "salary_credited":     { "enabled": true,  "channels": { "in_app": true, "push": true } },
  "market_drop":         { "enabled": true,  "channels": { "in_app": true, "push": true } },
  "goal_behind":         { "enabled": true,  "channels": { "in_app": true, "push": false } },
  "cc_bill_due":         { "enabled": true,  "channels": { "in_app": true, "push": true } },
  "budget_overrun":      { "enabled": true,  "channels": { "in_app": true, "push": false } },
  "emergency_fund_low":  { "enabled": true,  "channels": { "in_app": true, "push": true } },
  "tax_season":          { "enabled": true,  "channels": { "in_app": true, "push": true } },
  "fno_expiry_week":     { "enabled": true,  "channels": { "in_app": true, "push": false } },
  "net_worth_milestone": { "enabled": true,  "channels": { "in_app": true, "push": true } }
}
```

### `GET /health-score/{user_id}`

Full 6-pillar financial health score.

```json
{
  "score": 62,
  "tier": "GOOD",
  "tier_emoji": "✅",
  "pillars": {
    "emergency_fund": { "score": 12, "max": 20, "label": "Emergency Fund", "detail": "4 months covered, target is 6" },
    "debt_management": { "score": 16, "max": 20, "label": "Debt Management", "detail": "Home loan only, no CC debt" },
    "savings_rate":    { "score": 14, "max": 20, "label": "Savings Rate",    "detail": "22% savings rate, SIP active" },
    "investment":      { "score": 12, "max": 20, "label": "Investment",      "detail": "Diversified, goals underfunded" },
    "insurance":       { "score": 5,  "max": 10, "label": "Insurance",       "detail": "Health cover present, term missing" },
    "tax_efficiency":  { "score": 3,  "max": 10, "label": "Tax Efficiency",  "detail": "80C not maxed, no NPS" }
  },
  "top_advice": [
    "Open a term insurance plan — 1 crore cover costs under ₹12,000/yr at your age",
    "Max your 80C with ELSS — you have ₹60,000 still available"
  ]
}
```

**Tier thresholds:**
| Score | Tier |
|---|---|
| 0–39 | 🚨 DANGER |
| 40–59 | ⚠️ FAIR |
| 60–74 | ✅ GOOD |
| 75–89 | 🌟 GREAT |
| 90–100 | 🏆 ELITE |

### `GET /health-score/{user_id}/summary`

Lightweight version — score + tier + 2 tips only. Used by `finos-health-score.js`.

```json
{
  "score": 62,
  "tier": "GOOD",
  "tier_emoji": "✅",
  "tips": [
    "Open a term insurance plan",
    "Max your 80C this year"
  ]
}
```

### `POST /alerts/run`

Manually trigger one evaluation cycle for all users. Dev/admin use.

**Response:** `{ "triggered": true, "users_processed": 3 }`

---

## Django Budget API — `ExpenseTracker/finos_backend/` (:8000)

Django REST Framework. Requires auth token in `Authorization: Token <token>` header.

### Base URL: `http://localhost:8000/api/`

### `GET /api/transactions/`

List transactions for authenticated user.

**Query params:** `month`, `year`, `category`, `type`

### `POST /api/transactions/`

Create transaction.

**Request:**
```json
{
  "amount": 5000,
  "type": "expense",
  "category": "food",
  "note": "Grocery run",
  "date": "2026-05-15"
}
```

### `GET /api/budgets/`

List budgets for current month.

### `POST /api/budgets/`

Set category budget.

```json
{
  "month": 5,
  "year": 2026,
  "category": "food",
  "limit_amount": 8000
}
```

### `GET /api/goals/`

List all goals.

### `POST /api/goals/`

Create goal.

```json
{
  "name": "Emergency Fund",
  "target_amount": 300000,
  "current_amount": 120000,
  "target_date": "2026-12-31",
  "category": "emergency"
}
```

---

## Stock Engine API — `stock-engine/backend/` (FastAPI, port varies)

### `GET /stock/{symbol}`

Stock data + technical indicators.

**Response:**
```json
{
  "symbol": "RELIANCE.NS",
  "price": 2847.50,
  "change_pct": 1.2,
  "indicators": {
    "rsi": 58.4,
    "macd": { "macd": 12.3, "signal": 8.7, "histogram": 3.6 },
    "bb": { "upper": 2910, "middle": 2840, "lower": 2770 }
  },
  "cached_at": 1716000000
}
```

### `GET /market/overview`

Nifty 50 snapshot + sector performance.

---

## Market Intelligence API — `market intelligence/` (Flask, port varies)

### `GET /signals/intraday`

Intraday trade signals (VWAP, RSI, Bollinger Bands).

### `GET /signals/swing`

Swing trade setups (EMA crossovers, MACD, volume surge).

### `GET /signals/fundamental`

Value/growth screening (P/E, P/B, ROE, D/E).

### `GET /signals/long`

Long-term signals (CAGR trends, sector momentum).

---

## Stock Dashboard API — `stock-dashboard/app.py` (Flask :5001)

### `GET /api/stock/<symbol>`

Basic stock data via yfinance.

### `GET /api/market`

Market overview.
