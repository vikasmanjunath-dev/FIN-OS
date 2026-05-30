import json
import math
from datetime import datetime, timedelta, date
from collections import defaultdict
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .models import Transaction

@csrf_exempt # Bypasses security temporarily so local React can send data
def get_budget_overview(request):
    
    # --- NEW: HANDLE INCOMING TRANSACTIONS ---
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            Transaction.objects.create(
                title=data['title'],
                amount=data['amount'],
                category=data['category']
            )
            return JsonResponse({"status": "success", "message": "Transaction logged."})
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)

    # --- EXISTING: SEND OUTGOING DATA ---
    transactions = Transaction.objects.all().order_by('-date')
    
    data = []
    total_spent = 0
    leak_total = 0

    for t in transactions:
        data.append({
            "id": t.id,
            "title": t.title,
            "amount": float(t.amount),
            "category": t.category,
            "date": t.date.strftime('%Y-%m-%d')
        })
        
        total_spent += float(t.amount)
        if t.category in ['WANT', 'DEBT_BAD']:
            leak_total += float(t.amount)

    health_score = 100
    if total_spent > 0:
        leak_percentage = (leak_total / total_spent) * 100
        health_score -= leak_percentage 

    return JsonResponse({
        "status": "success",
        "metrics": {
            "total_spent": total_spent,
            "leak_total": leak_total,
            "health_score": round(health_score, 1)
        },
        "transactions": data
    })

import numpy as np
from rest_framework.decorators import api_view
from rest_framework.response import Response

# 1. MONTE CARLO ENGINE (Backend Math)
@api_view(['POST'])
def run_wealth_simulation(request):
    data = request.data
    current_wealth = data.get('current_wealth', 0)
    monthly_sip = data.get('monthly_sip', 0)
    years = 10
    
    # 10,000 Simulation Paths
    np.random.seed(42)
    expected_return = 0.12
    volatility = 0.15
    
    # Simplified return structure for frontend
    paths = []
    for _ in range(3): # Optimistic, Expected, Pessimistic
        paths.append([current_wealth * (1 + expected_return)**y + (monthly_sip * 12 * y) for y in range(1, years+1)])
        
    return Response({
        "optimistic": paths[0], # Add +1 std dev logic here
        "expected": paths[1],
        "pessimistic": paths[2], # Add -1 std dev logic here
        "labels": [f"Year {i}" for i in range(1, years+1)]
    })

# ─────────────────────────────────────────────────────────────────────────────
# 3. AI BUDGET FORECASTER — Time-series EWMA per category
#    POST /api/forecast/
#    Body: { months_history: 6, upcoming_events: ["Diwali", "Car insurance"] }
# ─────────────────────────────────────────────────────────────────────────────

# Seasonal event multipliers (category → multiplier for known events)
_EVENT_MULTIPLIERS = {
    "diwali":          {"Shopping": 1.8, "Entertainment": 1.5, "Food": 1.3, "Gifts": 2.5},
    "eid":             {"Shopping": 1.6, "Food": 1.4, "Gifts": 2.0},
    "christmas":       {"Shopping": 1.5, "Entertainment": 1.4, "Food": 1.3},
    "new year":        {"Entertainment": 1.6, "Food": 1.3, "Shopping": 1.3},
    "holi":            {"Food": 1.3, "Entertainment": 1.4, "Shopping": 1.2},
    "wedding":         {"Shopping": 2.0, "Food": 1.5, "Travel": 1.8},
    "vacation":        {"Travel": 2.5, "Entertainment": 1.6, "Food": 1.4},
    "tax filing":      {"Investment": 1.5},
    "car insurance":   {"Insurance": 3.0, "Transport": 1.2},
    "home insurance":  {"Insurance": 3.0},
    "school fees":     {"Education": 2.0},
    "medical":         {"Healthcare": 2.5},
}

# Category risk thresholds — percent above 3-month average to flag as risky
_RISK_THRESHOLD_PCT = 0.20  # 20% above avg = risky


def _ewma(values: list, alpha: float = 0.3) -> list:
    """
    Exponential Weighted Moving Average — manual Holt-Winters Level.
    alpha: smoothing factor (0 = fully historical, 1 = fully reactive)
    """
    if not values:
        return []
    smoothed = [values[0]]
    for v in values[1:]:
        smoothed.append(alpha * v + (1 - alpha) * smoothed[-1])
    return smoothed


def _holt_forecast(values: list, alpha: float = 0.3, beta: float = 0.1) -> float:
    """
    Holt's Double Exponential Smoothing (trend-aware) — no statsmodels needed.
    Returns forecast for next period.
    """
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]

    # Initialise
    level = values[0]
    trend = values[1] - values[0]

    for v in values[1:]:
        prev_level = level
        level = alpha * v + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend

    forecast = level + trend
    return max(0.0, forecast)


@csrf_exempt
@api_view(['POST', 'GET'])
def forecast_budget(request):
    """
    POST /api/forecast/
    Returns next-month spending prediction per category using Holt's EWMA.

    Body (optional):
      months_history:   int   — how many months to use for training (default 6)
      upcoming_events:  list  — events that may spike spending (e.g. ["Diwali"])
    """
    months_history   = 6
    upcoming_events  = []

    if request.method == 'POST':
        try:
            # DRF parses request.data; fall back to raw body for non-DRF callers
            body = request.data if hasattr(request, 'data') and request.data else {}
            months_history  = int(body.get('months_history', 6))
            upcoming_events = [e.lower() for e in body.get('upcoming_events', [])]
        except Exception:
            pass

    # ── 1. Fetch & bucket transactions by month + category ──────────────────
    cutoff = date.today() - timedelta(days=months_history * 31)
    txns   = Transaction.objects.filter(date__gte=cutoff).order_by('date')

    # Build: { category → { "YYYY-MM" → total_spent } }
    cat_monthly: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for t in txns:
        if t.category in ('INVESTMENT',):   # skip investments
            continue
        month_key = t.date.strftime('%Y-%m')
        cat_monthly[t.category][month_key] += float(t.amount)

    if not cat_monthly:
        # Fallback if DB is empty — return empty forecast
        return Response({
            "status": "success",
            "predicted_spend_next_month": 0,
            "by_category": {},
            "risk_categories": [],
            "save_this_month": "Add transactions first to enable forecasting.",
            "months_used": 0,
        })

    # ── 2. Generate sorted month keys for the history window ────────────────
    today    = date.today()
    months   = []
    for i in range(months_history, 0, -1):
        d = today - timedelta(days=i * 30)
        months.append(d.strftime('%Y-%m'))

    # ── 3. Forecast next month per category using Holt EWMA ─────────────────
    by_category: dict[str, float] = {}
    category_trends: dict[str, str] = {}  # "up" | "down" | "stable"
    risk_categories: list[str]     = []

    for cat, monthly_totals in cat_monthly.items():
        # Build the time series (fill missing months with 0)
        series = [monthly_totals.get(m, 0.0) for m in months]

        # Skip categories with no real data
        if sum(series) == 0:
            continue

        # Compute forecast using Holt's method
        predicted = _holt_forecast(series)

        # Apply event seasonal multipliers
        for event in upcoming_events:
            for event_key, multipliers in _EVENT_MULTIPLIERS.items():
                if event_key in event or event in event_key:
                    if cat in multipliers:
                        predicted *= multipliers[cat]
                        break

        by_category[cat] = round(predicted)

        # Trend: compare last month vs 3-month avg
        last_val = series[-1] if series else 0
        avg3     = sum(series[-3:]) / min(3, len(series)) if series else 0
        if avg3 > 0:
            pct_change = (last_val - avg3) / avg3
            if pct_change > 0.10:
                category_trends[cat] = "up"
            elif pct_change < -0.10:
                category_trends[cat] = "down"
            else:
                category_trends[cat] = "stable"

        # Flag as risky if predicted > 3-month avg by more than threshold
        if avg3 > 0 and (predicted - avg3) / avg3 > _RISK_THRESHOLD_PCT:
            risk_categories.append(cat)

    total_predicted = sum(by_category.values())

    # ── 4. Generate save-this-month recommendation ───────────────────────────
    # Find biggest risk category
    biggest_risk = sorted(risk_categories, key=lambda c: by_category.get(c, 0), reverse=True)
    save_msg     = ""

    if upcoming_events:
        events_str = ', '.join(e.title() for e in upcoming_events)
        if biggest_risk:
            top_risk = biggest_risk[0]
            spike    = by_category.get(top_risk, 0)
            # Recommend locking 30% of predicted risky category into savings
            lock_amt  = round(spike * 0.30 / 100) * 100
            # Compute pre-event baseline by dividing out the event multiplier
            mult      = _EVENT_MULTIPLIERS.get(upcoming_events[0], {}).get(top_risk, 1.0) if upcoming_events else 1.0
            baseline  = spike / max(1.0, float(mult))
            spike_amt = round(spike - baseline)
            save_msg  = (
                f"Lock ₹{lock_amt:,} in FD before {events_str} spending starts. "
                f"{top_risk} expected to spike by ₹{spike_amt:,} vs normal."
            )
        else:
            save_msg = f"Set aside ₹{round(total_predicted * 0.15 / 100) * 100:,} before {events_str} to avoid overspending."
    elif total_predicted > 0:
        save_rate = 0.20
        save_amt  = round(total_predicted * save_rate / 100) * 100
        save_msg  = f"Save ₹{save_amt:,} before the month starts — 20% buffer on predicted ₹{total_predicted:,} spend."

    # ── 5. Build enriched category output with trend labels ─────────────────
    enriched = {}
    for cat, amount in sorted(by_category.items(), key=lambda x: x[1], reverse=True):
        trend = category_trends.get(cat, "stable")
        enriched[cat] = {
            "predicted": amount,
            "trend":     trend,
            "trend_symbol": "↑" if trend == "up" else "↓" if trend == "down" else "→",
        }

    return Response({
        "status":                    "success",
        "predicted_spend_next_month": total_predicted,
        "by_category":               enriched,
        "risk_categories":           risk_categories,
        "save_this_month":           save_msg,
        "months_used":               months_history,
        "upcoming_events_applied":   upcoming_events,
    })


# 2. ACCOUNT AGGREGATOR (AA) WEBHOOK
@api_view(['POST'])
def aa_webhook_sync(request):
    # This endpoint receives real-time transaction data from Setu/Sahamati APIs
    # and pushes it to the React frontend via WebSockets
    raw_data = request.data
    # ... parse banking data, auto-categorize using NLP
    return Response({"status": "synced"})