# FIN-OS Alert Engine

> FastAPI · APScheduler · Web Push · Prometheus  
> **Port:** 8001 | **Version:** v1 | **Updated:** July 2026

Proactive financial intelligence service — watches every user's money 24/7 and fires actionable alerts via browser push notifications.

---

## What It Does

| Capability | Detail |
|---|---|
| 10 alert rules | Evaluated per user every 15 minutes |
| Web Push notifications | VAPID-signed push to browser (works when tab is closed) |
| Financial Health Score | 0–100 score computed from profile + transactions |
| Market refresh | Nifty / Sensex cached and refreshed every 60 minutes |
| Morning brief | Sent at 8:30am IST daily to all push subscribers |
| Prometheus metrics | Exported at `/metrics` for Grafana monitoring |

---

## Folder Structure

```
alerts/
├── alert-engine.py     ← FastAPI server (entry point)
├── rules.py            ← 10 alert rule classes
├── health_score.py     ← Financial Health Score computation (0–100)
├── schema.sql          ← Supabase tables: alerts, push_subscriptions, alert_preferences
├── requirements.txt    ← Python dependencies
└── Dockerfile          ← Container build
```

---

## Alert Rules (rules.py)

| Rule ID | Trigger | Priority |
|---|---|---|
| `SIP_MISSED` | SIP date passed without a matching transaction | WARNING |
| `SALARY_CREDITED` | Large income detected → prompts budget allocation | INFO |
| `MARKET_DROP` | Nifty falls ≥ 3% → shows portfolio impact estimate | WARNING |
| `GOAL_BEHIND` | Monthly savings insufficient to hit goal deadline | WARNING |
| `CC_BILL_DUE` | Credit card bill due in ≤ 3 days | CRITICAL |
| `BUDGET_OVERRUN` | Monthly spend > 90% of budget in any category | WARNING |
| `EMERGENCY_FUND_LOW` | Emergency fund < 3 months of expenses | CRITICAL |
| `TAX_SEASON` | March/April/July ITR + 80C reminders | INFO |
| `FNO_EXPIRY_WEEK` | Last Thursday of the month (for F&O users) | INFO |
| `NETWORTH_MILESTONE` | Reaches ₹1L / ₹5L / ₹10L / ₹25L / ₹50L / ₹1Cr | CELEBRATION |

All rules extend `Rule` base class. Each has:
- `evaluate(user_data) → Alert | None`
- `cooldown_hours` (minimum 12h — so 15-min polling can't over-notify)
- `priority` (critical / warning / info / celebration)

---

## Health Score (health_score.py)

A 0–100 composite score computed from 6 weighted pillars:

| Pillar | Weight | What it measures |
|---|---|---|
| Emergency Fund | 25% | Months of expenses in liquid savings (target: 6 months) |
| Savings Rate | 20% | Monthly savings ÷ income (target: ≥ 20%) |
| Debt Burden | 20% | Total EMI ÷ income (target: < 40%) |
| Investment Rate | 15% | SIP + investment ÷ income (target: ≥ 15%) |
| Goal Progress | 10% | Average progress across all active goals |
| Insurance Coverage | 10% | Term + health insurance present |

Score bands: 🔴 0–40 Critical · 🟡 41–60 Fair · 🟢 61–80 Good · 💚 81–100 Excellent

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service status + scheduler state |
| GET | `/alerts/{user_id}` | Unread alerts for a user |
| POST | `/alerts/subscribe` | Register a Web Push subscription |
| POST | `/alerts/dismiss/{alert_id}` | Mark alert as dismissed |
| GET | `/health-score/{user_id}` | Compute and return health score |
| GET | `/metrics` | Prometheus metrics export |

---

## Setup

### 1. Install dependencies

```bash
cd alerts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Generate VAPID keys

```bash
python3 -c "
from py_vapid import Vapid01
v = Vapid01()
v.generate_keys()
print('PRIVATE:', v.private_pem().decode())
print('PUBLIC:', v.public_pem().decode())
"
```

### 3. Environment variables

```bash
cp .env.example .env
# Fill in:
SUPABASE_URL=https://oeapcyucnduhwpgxfknb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
VAPID_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----...
VAPID_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...
VAPID_CLAIMS_EMAIL=your@email.com
```

### 4. Create Supabase tables

Run `schema.sql` in the Supabase SQL Editor:
- `alerts` — triggered alert history
- `push_subscriptions` — browser VAPID registrations
- `alert_preferences` — per-user rule opt-in/out

### 5. Start

```bash
uvicorn alert-engine:app --host 0.0.0.0 --port 8001
```

---

## Scheduled Jobs (APScheduler, IST timezone)

| Job | Schedule | Action |
|---|---|---|
| `alert_check` | Every 15 minutes | Evaluates all 10 rules for every user |
| `market_refresh` | Every 60 minutes | Refreshes Nifty / Sensex from yfinance |
| `morning_brief` | 8:30am IST daily | Sends market-wide brief to all push subscribers |

> **Why 15-min polling?** All rule cooldowns are ≥ 12 hours, so finer polling cannot notify any faster — 15 minutes is the minimum meaningful granularity.

---

## Docker

```bash
docker build -t finos-alerts .
docker run -p 8001:8001 --env-file .env finos-alerts
```

---

## Dependencies

```
fastapi, uvicorn       — API server
apscheduler            — Cron-style job scheduler
supabase               — User data access
pywebpush              — VAPID Web Push sending
yfinance               — Nifty/Sensex market data
httpx                  — Async HTTP client
python-dotenv          — .env loading
prometheus-client      — /metrics export
slowapi                — Rate limiting
cachetools             — TTL in-memory cache (market data)
```
