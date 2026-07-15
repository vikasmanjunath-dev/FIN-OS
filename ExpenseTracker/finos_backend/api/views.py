# ─────────────────────────────────────────────────────────────────────────────
# api/views.py — API View Functions (Expense Tracker Backend)
# ─────────────────────────────────────────────────────────────────────────────
# This file is the CORE LOGIC ENGINE of the Expense Tracker backend.
# It contains 4 view functions (+ 2 helper functions) that power:
#
#   1. get_budget_overview()      → Log transactions + compute financial health
#   2. run_wealth_simulation()    → Monte Carlo 10-year wealth projection
#   3. _holt_forecast()           → Holt's Double Exponential Smoothing (pure Python)
#   4. _holt_winters_forecast()   → Holt-Winters Triple Exponential Smoothing (statsmodels)
#   5. forecast_budget()          → AI-powered next-month spending forecast
#   6. aa_webhook_sync()          → Account Aggregator banking data receiver (stub)
#
# DJANGO VIEW vs DRF API VIEW:
#   Plain Django view:  Function + returns JsonResponse or HttpResponse
#   DRF API view:       @api_view(['POST']) decorator + returns Response object
#
#   The difference:
#     Plain: you call json.loads(request.body) manually; return JsonResponse({})
#     DRF:   request.data is already parsed; return Response({}) with auto-serialisation
#     DRF also adds: HTTP method enforcement, content negotiation (JSON/XML/HTML),
#     the browsable API, authentication integration.
#
# TWO PATTERNS MIXED HERE (intentionally for learning):
#   get_budget_overview() → plain Django (manual json.loads, JsonResponse)
#   run_wealth_simulation() / forecast_budget() → DRF (@api_view, Response)
#   The DRF pattern is preferred for new endpoints.
# ─────────────────────────────────────────────────────────────────────────────

# ── STANDARD LIBRARY IMPORTS ─────────────────────────────────────────────────
import json                             # Parse raw JSON from request body (non-DRF views)
import math                             # Imported but not currently used (available for future calculations)
from datetime import datetime, timedelta, date  # Date arithmetic for history windows
from collections import defaultdict    # Auto-initialising dict (no KeyError on new keys)

# ── DJANGO IMPORTS ────────────────────────────────────────────────────────────
from django.http import JsonResponse           # Returns HTTP response with JSON body
from django.views.decorators.csrf import csrf_exempt  # Bypass CSRF for React API calls
from .models import Transaction                # Our database model (from api/models.py)

# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 1: Budget Overview
# GET  /api/budget/overview/ → returns all transactions + health metrics
# POST /api/budget/overview/ → creates a new transaction
# ─────────────────────────────────────────────────────────────────────────────

@csrf_exempt # Bypasses security temporarily so local React can send data
def get_budget_overview(request):
    # WHY @csrf_exempt HERE?
    # Django's CSRF protection works by setting a cookie on the first page load.
    # The React app (http://localhost:5173) doesn't load Django pages, so it
    # never receives the CSRF cookie. Without @csrf_exempt, every POST from
    # React would get a 403 Forbidden response.
    # PRODUCTION FIX: Remove @csrf_exempt and use DRF TokenAuthentication instead:
    #   - React sends "Authorization: Token abc123" header
    #   - DRF validates the token and identifies the user
    #   - More secure because tokens can be revoked

    # ── POST BRANCH: Accept and store a new transaction ──────────────────────
    # --- NEW: HANDLE INCOMING TRANSACTIONS ---
    if request.method == 'POST':
        try:
            # request.body contains the raw bytes of the HTTP request body.
            # json.loads() decodes UTF-8 bytes then parses JSON → Python dict.
            # Example: b'{"title": "Swiggy", "amount": 450, "category": "WANT"}'
            #       → {'title': 'Swiggy', 'amount': 450, 'category': 'WANT'}
            data = json.loads(request.body)

            # Django ORM INSERT — creates a new row in api_transaction table.
            # Note: 'date' is NOT passed here — it's auto-set by auto_now_add=True.
            # Django generates: INSERT INTO api_transaction (title, amount, category, date)
            #                   VALUES ('Swiggy', 450, 'WANT', '2026-07-15')
            Transaction.objects.create(
                title=data['title'],
                amount=data['amount'],
                category=data['category']
            )

            # Return 200 OK with success confirmation.
            # JsonResponse() serialises the dict to JSON and sets:
            #   Content-Type: application/json
            #   HTTP Status: 200 (default)
            return JsonResponse({"status": "success", "message": "Transaction logged."})
        except Exception as e:
            # Catches: KeyError (missing field), json.JSONDecodeError (bad JSON),
            # IntegrityError (constraint violation), etc.
            # str(e) gives the raw exception message — fine for dev, too verbose for prod.
            return JsonResponse({"status": "error", "message": str(e)}, status=400)

    # ── GET BRANCH: Return all transactions + computed health metrics ─────────
    # --- EXISTING: SEND OUTGOING DATA ---

    # Django ORM SELECT: fetches ALL rows from api_transaction, ordered newest first.
    # '-date' = ORDER BY date DESC (the minus prefix means descending).
    # This returns a QuerySet — lazy, not yet executed (no DB hit yet).
    transactions = Transaction.objects.all().order_by('-date')

    data = []          # Will hold the list of transaction dicts for the response
    total_spent = 0    # Running total of ALL transactions (₹)
    leak_total = 0     # Running total of WANT + DEBT_BAD transactions (₹ "leaked")

    # Iterate the QuerySet — THIS is when the SQL SELECT is actually executed.
    for t in transactions:
        # Build a plain dict for each transaction.
        # We use float(t.amount) because:
        #   - t.amount is a decimal.Decimal (exact but JSON can't serialise it)
        #   - float() converts to a JSON-serialisable number
        #   - Small precision loss is acceptable for display (₹450.75 stays ₹450.75)
        data.append({
            "id": t.id,                              # Integer primary key
            "title": t.title,                        # "Swiggy dinner"
            "amount": float(t.amount),               # Decimal → float for JSON
            "category": t.category,                  # "WANT" (short code)
            "date": t.date.strftime('%Y-%m-%d')      # Date object → "2026-07-15" string
        })

        # Accumulate total spending across ALL categories
        total_spent += float(t.amount)

        # Accumulate the "wealth leak" — money that didn't build assets.
        # WANT = lifestyle spending (eating out, entertainment, shopping)
        # DEBT_BAD = bad debt interest payments (credit card interest, personal loans)
        # These two categories drag down financial health.
        if t.category in ['WANT', 'DEBT_BAD']:
            leak_total += float(t.amount)

    # ── FINANCIAL HEALTH SCORE CALCULATION ───────────────────────────────────
    # Score formula: Health = 100 − (leak_total / total_spent × 100)
    #
    # Interpretation:
    #   100 = Perfect: zero WANT + zero DEBT_BAD spending (no wealth leaks)
    #   80  = Good: 20% of spending goes to lifestyle/bad debt
    #   50  = Average: half your money is wealth-neutral or destructive
    #   0   = Crisis: everything spent on wants and bad debt
    #
    # Edge case: if total_spent == 0 (no transactions yet), skip the division
    # to avoid ZeroDivisionError. Score stays at 100.
    health_score = 100
    if total_spent > 0:
        leak_percentage = (leak_total / total_spent) * 100
        health_score -= leak_percentage

    # Return the complete budget dashboard data as JSON.
    # round(health_score, 1) → show one decimal: 72.8 instead of 72.80000001
    return JsonResponse({
        "status": "success",
        "metrics": {
            "total_spent": total_spent,
            "leak_total": leak_total,
            "health_score": round(health_score, 1)
        },
        "transactions": data
    })

# ── DRF IMPORTS ───────────────────────────────────────────────────────────────
import numpy as np                                         # Numerical computing for Monte Carlo
from rest_framework.decorators import api_view            # DRF view decorator
from rest_framework.response import Response              # DRF auto-serialising response

# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 2: Monte Carlo Wealth Simulation
# POST /api/budget/wealth-sim/
# ─────────────────────────────────────────────────────────────────────────────

# 1. MONTE CARLO ENGINE (Backend Math)
@api_view(['POST'])
def run_wealth_simulation(request):
    # @api_view(['POST']) does several things:
    #   1. Wraps the function in DRF's APIView infrastructure
    #   2. Only allows POST — returns 405 Method Not Allowed for GET/PUT/etc.
    #   3. Converts the raw Django HttpRequest into a DRF Request object
    #   4. Makes request.data available (auto-parsed JSON body)
    #   5. Enables DRF's authentication and permission checks

    # request.data is the parsed request body — a Python dict.
    # DRF reads the Content-Type header to decide how to parse:
    #   Content-Type: application/json → json.loads(request.body)
    #   Content-Type: multipart/form-data → parse form fields
    # .get() with defaults: if 'current_wealth' isn't in the body, use 0
    data = request.data
    current_wealth = data.get('current_wealth', 0)  # Starting lump sum in ₹
    monthly_sip = data.get('monthly_sip', 0)        # Monthly SIP amount in ₹
    years = 10                                        # Fixed 10-year projection horizon

    # 10,000 Simulation Paths
    # Seed the random number generator with 42 (a convention).
    # This ensures identical inputs → identical outputs (reproducible results).
    # Without seeding, each API call would produce different random paths.
    # For a TRUE Monte Carlo, run without seeding and vary the random draws.
    np.random.seed(42)
    expected_return = 0.12    # 12% annual return — approximate Nifty 50 long-term average
    volatility = 0.15         # 15% annual standard deviation — typical for equity

    # Note: The comment says "10,000 Simulation Paths" but currently only
    # 3 paths are generated. The real Monte Carlo implementation would be:
    #   np.random.normal(expected_return, volatility, (10000, years))
    # Each row would be one simulation; take percentiles for optimistic/pessimistic.

    # Simplified return structure for frontend
    # Generate 3 paths using a list comprehension:
    #   For y in [1, 2, ..., 10]:
    #     wealth = current_wealth × (1 + 12%)^year + (monthly_sip × 12 × year)
    # This is a simplified growth formula (no volatility applied yet).
    # current_wealth × (1 + r)^y = compound growth of the initial lump sum
    # monthly_sip × 12 × y = linear accumulation of SIP contributions
    paths = []
    for _ in range(3): # Optimistic, Expected, Pessimistic
        paths.append([current_wealth * (1 + expected_return)**y + (monthly_sip * 12 * y) for y in range(1, years+1)])

    # Response() is DRF's response class — it auto-serialises the dict to JSON.
    # Equivalent to JsonResponse but works with DRF's content negotiation.
    # The React frontend reads:
    #   response.optimistic  → array of 10 wealth values (₹) for years 1-10
    #   response.expected    → same values (TODO: add ±1σ differentiation)
    #   response.pessimistic → same values
    #   response.labels      → ["Year 1", "Year 2", ..., "Year 10"]
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

# ── SEASONAL EVENT MULTIPLIERS ────────────────────────────────────────────────
# Maps event names (lowercase) to category spending multipliers.
# When an event is flagged as "upcoming", the forecast for affected categories
# is multiplied by these factors.
#
# Examples of how these were derived:
#   Diwali → Shopping ×1.8: Diwali shopping spends typically 80% more than
#             average because of gifts, new clothes, home decor, electronics.
#   Car insurance → Insurance ×3.0: Annual premium is 3× a typical month's
#             insurance outlay (covers the whole year in one payment).
#   Vacation → Travel ×2.5: Holiday travel costs 2.5× normal commute spending.
#
# The 'category' keys here match the CATEGORY_CHOICES short codes in models.py
# (NEED, WANT, INVESTMENT, DEBT_GOOD, DEBT_BAD) BUT ALSO include sub-categories
# like 'Shopping', 'Food', 'Travel'. Those sub-categories would need to be
# added to CATEGORY_CHOICES or derived from transaction titles via NLP
# to make this multiplier logic fully functional.
#
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

# Threshold: a category is "risky" if its predicted spend exceeds the
# 3-month average by more than this percentage.
# 0.20 = 20% above recent average → flag as a risk category
# Category risk thresholds — percent above 3-month average to flag as risky
_RISK_THRESHOLD_PCT = 0.20  # 20% above avg = risky


# ─────────────────────────────────────────────────────────────────────────────
# HELPER FUNCTION 1: Holt's Double Exponential Smoothing
# ─────────────────────────────────────────────────────────────────────────────
def _holt_forecast(values: list, alpha: float = 0.3, beta: float = 0.1) -> float:
    """
    Holt's Double Exponential Smoothing — fallback for short history (<6 months).
    Returns forecast for next period.
    """
    # The leading underscore in _holt_forecast signals this is a PRIVATE function —
    # it's an implementation detail, not part of the public API.
    # Only called from within this module.

    # Guard clause: can't forecast from empty data
    if not values:
        return 0.0
    # Guard clause: single data point → use it as-is (no trend possible)
    if len(values) == 1:
        return float(values[0])

    # ── HOLT'S DOUBLE EXPONENTIAL SMOOTHING ALGORITHM ────────────────────────
    # Two components updated iteratively:
    #   level = weighted average of current value + previous (level + trend)
    #   trend = weighted average of current level change + previous trend
    #
    # Parameters:
    #   alpha (0.3): level smoothing factor
    #     → 0.3 weights recent data at 30%, previous estimate at 70%
    #     → Low alpha = slow to respond to sudden changes
    #     → High alpha (→1.0) = track very recent data closely (noisy)
    #
    #   beta (0.1): trend smoothing factor
    #     → 0.1 makes the trend change slowly (gradual trend detection)
    #     → Avoids overfitting to a single spike month
    #
    # Initialise from first two values:
    level = float(values[0])                           # Initial level = first data point
    trend = float(values[1]) - float(values[0])       # Initial trend = first change

    # Iterate through the rest of the series, updating level and trend
    for v in values[1:]:
        prev_level = level
        # Level update: alpha × new_value + (1-alpha) × (level + trend)
        # The (level + trend) term is the "predicted" value for this period.
        # We blend actual with predicted, weighted by alpha.
        level = alpha * float(v) + (1 - alpha) * (level + trend)
        # Trend update: beta × (new_level - old_level) + (1-beta) × old_trend
        # This is the smoothed change in level — the smoothed "velocity".
        trend = beta * (level - prev_level) + (1 - beta) * trend

    # Forecast = level + trend (one-step-ahead prediction)
    # max(0.0, ...) clamps negative forecasts: spending can't be negative.
    return max(0.0, level + trend)


# ─────────────────────────────────────────────────────────────────────────────
# HELPER FUNCTION 2: Holt-Winters Triple Exponential Smoothing
# ─────────────────────────────────────────────────────────────────────────────
def _holt_winters_forecast(values: list) -> float:
    """
    Triple Exponential Smoothing (Holt-Winters additive) via statsmodels.
    Captures seasonal patterns (Diwali, school fees, etc.) automatically.
    Falls back to Holt's double if statsmodels unavailable or history too short.
    Requires ≥12 data points (12 months) for seasonal_periods=12.
    """
    # Can't fit a seasonal model with less than 6 months of data.
    # Fall back to Holt's Double which only needs 2+ points.
    if len(values) < 6:
        return _holt_forecast(values)

    try:
        # statsmodels provides industrial-grade time series models.
        # Import inside try/except so the code works even if statsmodels
        # isn't installed — it will fall back to pure Python Holt's.
        from statsmodels.tsa.holtwinters import ExponentialSmoothing
        import warnings, numpy as np

        # Convert the list to a NumPy array.
        # dtype=float ensures all values are 64-bit floats (required by statsmodels).
        arr = np.array(values, dtype=float)

        if len(arr) >= 12:
            # ── HOLT-WINTERS TRIPLE EXPONENTIAL SMOOTHING ──────────────────
            # Three components: level (α), trend (β), seasonal (γ)
            # This model automatically learns:
            #   - The baseline spending level
            #   - Whether spending is trending up or down over time
            #   - Annual seasonal patterns (Diwali spike, tax season, etc.)
            #
            # Parameters:
            #   trend="add"        → Additive trend: trend is added to level
            #                        Use "mul" if the trend grows proportionally
            #   seasonal="add"     → Additive seasonality: seasonal factor is added
            #                        Use "mul" if seasonal swings grow over time
            #   seasonal_periods=12 → One full cycle = 12 months (annual seasonality)
            #   initialization_method="estimated" → Let statsmodels estimate
            #                        initial level/trend/season from the data
            #                        (vs. "heuristic" or manually specifying "known")
            # Full Holt-Winters with annual seasonality
            with warnings.catch_warnings():
                # Suppress convergence warnings — common with short series
                # and doesn't affect the quality of short-horizon forecasts.
                warnings.simplefilter("ignore")
                model = ExponentialSmoothing(
                    arr,
                    trend="add",
                    seasonal="add",
                    seasonal_periods=12,
                    initialization_method="estimated",
                ).fit(optimized=True, use_brute=False)
                # .fit() parameters:
                #   optimized=True:     Use scipy.optimize to find the best α, β, γ
                #                       via Maximum Likelihood Estimation (MLE)
                #   use_brute=False:    Don't use brute-force grid search for starting
                #                       values of the optimisation (faster, good enough)
            forecast = float(model.forecast(1)[0])   # Predict 1 period ahead (next month)
        else:
            # 6-11 months of data: can fit trend but NOT annual seasonality
            # (need ≥12 to estimate all 12 seasonal indices).
            # Use Holt's Double (trend only) via statsmodels for better parameter fitting.
            # Holt's double (no seasonality) for 6–11 months of data
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                model = ExponentialSmoothing(
                    arr,
                    trend="add",
                    seasonal=None,                        # No seasonal component
                    initialization_method="estimated",
                ).fit(optimized=True)
            forecast = float(model.forecast(1)[0])

        # Clamp negative values to zero — you can't spend negative money.
        return max(0.0, forecast)

    except ImportError:
        # statsmodels not installed — use manual Holt's
        # This is the graceful degradation path: the API still works,
        # just with a less sophisticated algorithm.
        return _holt_forecast(values)
    except Exception:
        # Catches: convergence failure, NaN in output, singular matrix, etc.
        # statsmodels can fail on edge cases (all-zero series, constant values).
        # Fall back to the pure Python implementation which is more robust.
        return _holt_forecast(values)


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 3: AI Budget Forecaster
# POST /api/budget/forecast/  (also accepts GET with defaults)
# ─────────────────────────────────────────────────────────────────────────────

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
    # ── DECORATOR STACKING EXPLANATION ───────────────────────────────────────
    # @csrf_exempt is applied FIRST (outermost), then @api_view wraps it.
    # Both decorators are needed:
    #   @api_view(['POST', 'GET']) → restricts methods, enables DRF request parsing
    #   @csrf_exempt               → allows the React app to POST without CSRF cookie
    # Note: in DRF, @csrf_exempt is usually not needed if you're using
    # SessionAuthentication — DRF's CSRF enforcement is different from Django's.
    # ─────────────────────────────────────────────────────────────────────────

    # Default input values (used if no body is provided or if GET request)
    months_history   = 6    # Look back 6 months of history for forecasting
    upcoming_events  = []   # No events to adjust for by default

    if request.method == 'POST':
        try:
            # request.data is DRF's parsed body (works for both JSON and form data).
            # 'if hasattr(request, 'data') and request.data' handles the case
            # where this function is called outside a DRF context (plain Django request).
            # Fall back to empty dict if request.data is None or missing.
            body = request.data if hasattr(request, 'data') and request.data else {}
            months_history  = int(body.get('months_history', 6))
            # Normalise event names to lowercase for case-insensitive matching
            # ['Diwali', 'Car Insurance'] → ['diwali', 'car insurance']
            upcoming_events = [e.lower() for e in body.get('upcoming_events', [])]
        except Exception:
            # If body parsing fails (e.g., malformed int), use the defaults.
            # Silent failure is acceptable here — the forecast still runs with defaults.
            pass

    # ── STEP 1: Fetch & bucket transactions by month + category ──────────────
    # Calculate the start of the lookback window.
    # months_history * 31 is an approximation (not perfect but close enough).
    # A cleaner approach would use dateutil.relativedelta(months=months_history).
    cutoff = date.today() - timedelta(days=months_history * 31)

    # Django ORM: SELECT * FROM api_transaction WHERE date >= cutoff ORDER BY date
    txns   = Transaction.objects.filter(date__gte=cutoff).order_by('date')

    # Build a nested dict: { category → { "YYYY-MM" → total_spent } }
    # defaultdict(lambda: defaultdict(float)) means:
    #   - Accessing a missing category key auto-creates it as a defaultdict(float)
    #   - Accessing a missing month key auto-creates it as 0.0 (float default)
    # No KeyError ever raised — safe to do cat_monthly['WANT']['2026-07'] += 450
    # Build: { category → { "YYYY-MM" → total_spent } }
    cat_monthly: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for t in txns:
        if t.category in ('INVESTMENT',):   # skip investments
            # INVESTMENT transactions are excluded from the "spending" forecast.
            # Investments are not spending — they build wealth.
            # Including them would inflate the "predicted spend" and confuse the user.
            continue
        # "%Y-%m" formats the date as "2026-07" — year and month only.
        # This groups all transactions in the same month together.
        month_key = t.date.strftime('%Y-%m')
        cat_monthly[t.category][month_key] += float(t.amount)

    if not cat_monthly:
        # DB is empty (no non-investment transactions in the history window).
        # Return a graceful "empty state" response instead of crashing.
        # Fallback if DB is empty — return empty forecast
        return Response({
            "status": "success",
            "predicted_spend_next_month": 0,
            "by_category": {},
            "risk_categories": [],
            "save_this_month": "Add transactions first to enable forecasting.",
            "months_used": 0,
        })

    # ── STEP 2: Generate sorted month keys for the history window ─────────────
    today    = date.today()
    months   = []
    # Build a list of YYYY-MM strings from oldest to newest.
    # Example for months_history=3, today=2026-07-15:
    #   i=3: 2026-07-15 - 90 days ≈ 2026-04-16 → "2026-04"
    #   i=2: 2026-07-15 - 60 days ≈ 2026-05-16 → "2026-05"
    #   i=1: 2026-07-15 - 30 days ≈ 2026-06-15 → "2026-06"
    # This is an approximation — timedelta(days=30) ≠ one calendar month exactly.
    for i in range(months_history, 0, -1):
        d = today - timedelta(days=i * 30)
        months.append(d.strftime('%Y-%m'))

    # ── STEP 3: Forecast next month per category using Holt EWMA ─────────────
    by_category: dict[str, float] = {}         # Predicted ₹ per category next month
    category_trends: dict[str, str] = {}       # "up" | "down" | "stable"
    risk_categories: list[str]     = []        # Categories predicted to spike

    for cat, monthly_totals in cat_monthly.items():
        # Build the time series for this category by filling in the month keys.
        # .get(m, 0.0) returns 0 for months where the category had no transactions.
        # This is correct — zero spending in a month IS valid data for the model.
        series = [monthly_totals.get(m, 0.0) for m in months]

        # Skip categories with all-zero history — nothing to forecast.
        if sum(series) == 0:
            continue

        # ── MACHINE LEARNING FORECAST ────────────────────────────────────────
        # _holt_winters_forecast() selects the best algorithm based on data length:
        #   < 6 months  → Holt's Double (pure Python)
        #   6-11 months → Holt's Double (statsmodels, better parameter fitting)
        #   ≥12 months  → Holt-Winters Triple (trend + annual seasonality)
        # Compute forecast using Holt-Winters (seasonal) or Holt's (short history)
        predicted = _holt_winters_forecast(series)

        # ── APPLY EVENT SEASONAL MULTIPLIERS ─────────────────────────────────
        # For each upcoming event, check if it has a known multiplier for this category.
        # Fuzzy matching: 'car insurance' is in 'car insurance renewal' and vice versa.
        # This handles natural language variants without NLP.
        for event in upcoming_events:
            for event_key, multipliers in _EVENT_MULTIPLIERS.items():
                if event_key in event or event in event_key:
                    if cat in multipliers:
                        # Multiply the forecast by the event factor.
                        # Example: WANT category + Diwali → predicted × 1.5
                        predicted *= multipliers[cat]
                        break  # Only apply one event's multiplier per event string

        by_category[cat] = round(predicted)   # Round to nearest rupee

        # ── TREND DETECTION ───────────────────────────────────────────────────
        # Compare the most recent month vs the 3-month rolling average.
        # This tells the user whether spending in this category is rising, falling,
        # or stable — separate from the absolute forecast amount.
        last_val = series[-1] if series else 0           # Most recent month's actual spend
        avg3     = sum(series[-3:]) / min(3, len(series)) if series else 0  # 3-month average
        if avg3 > 0:
            pct_change = (last_val - avg3) / avg3        # % change vs 3-month average
            if pct_change > 0.10:
                # Last month was >10% above 3-month average → trending up
                category_trends[cat] = "up"
            elif pct_change < -0.10:
                # Last month was >10% below 3-month average → trending down
                category_trends[cat] = "down"
            else:
                # Within ±10% of 3-month average → stable
                category_trends[cat] = "stable"

        # ── RISK FLAGGING ──────────────────────────────────────────────────────
        # Flag this category as "risky" if the forecast significantly exceeds
        # recent history. _RISK_THRESHOLD_PCT = 0.20 means >20% above avg3.
        # Flag as risky if predicted > 3-month avg by more than threshold
        if avg3 > 0 and (predicted - avg3) / avg3 > _RISK_THRESHOLD_PCT:
            risk_categories.append(cat)

    # Sum across all categories for the total predicted monthly spend
    total_predicted = sum(by_category.values())

    # ── STEP 4: Generate save-this-month recommendation ───────────────────────
    # Sort risk categories by predicted spend (biggest risk first)
    # Generate save-this-month recommendation
    # Find biggest risk category
    biggest_risk = sorted(risk_categories, key=lambda c: by_category.get(c, 0), reverse=True)
    save_msg     = ""

    if upcoming_events:
        # Events are coming — give a specific "lock money in FD" recommendation
        events_str = ', '.join(e.title() for e in upcoming_events)  # "Diwali, Car Insurance"
        if biggest_risk:
            top_risk = biggest_risk[0]                              # Riskiest category
            spike    = by_category.get(top_risk, 0)                # Predicted ₹ for that category
            # Recommend locking 30% of the risky category's predicted spend into FD
            # before the event. Round down to nearest ₹100 for a clean amount.
            # Recommend locking 30% of predicted risky category into savings
            lock_amt  = round(spike * 0.30 / 100) * 100
            # Compute the event-adjusted spike vs the baseline (before event multiplier)
            # Compute pre-event baseline by dividing out the event multiplier
            mult      = _EVENT_MULTIPLIERS.get(upcoming_events[0], {}).get(top_risk, 1.0) if upcoming_events else 1.0
            baseline  = spike / max(1.0, float(mult))              # What it would be without the event
            spike_amt = round(spike - baseline)                    # Extra ₹ due to the event
            save_msg  = (
                f"Lock ₹{lock_amt:,} in FD before {events_str} spending starts. "
                f"{top_risk} expected to spike by ₹{spike_amt:,} vs normal."
            )
        else:
            # Events coming but no risky categories — generic buffer advice
            save_msg = f"Set aside ₹{round(total_predicted * 0.15 / 100) * 100:,} before {events_str} to avoid overspending."
    elif total_predicted > 0:
        # No events — standard 20% savings buffer recommendation
        save_rate = 0.20
        save_amt  = round(total_predicted * save_rate / 100) * 100  # Round to ₹100
        save_msg  = f"Save ₹{save_amt:,} before the month starts — 20% buffer on predicted ₹{total_predicted:,} spend."

    # ── STEP 5: Build enriched category output with trend labels ──────────────
    # Sort categories by predicted spend (highest first) for a ranked view
    # Build enriched category output with trend labels
    enriched = {}
    for cat, amount in sorted(by_category.items(), key=lambda x: x[1], reverse=True):
        trend = category_trends.get(cat, "stable")
        enriched[cat] = {
            "predicted": amount,
            # Trend symbol for quick visual parsing in the React UI
            "trend":     trend,
            "trend_symbol": "↑" if trend == "up" else "↓" if trend == "down" else "→",
        }

    # Return the complete forecast response to the React frontend
    return Response({
        "status":                    "success",
        "predicted_spend_next_month": total_predicted,        # Total across all categories
        "by_category":               enriched,                # Per-category with trend
        "risk_categories":           risk_categories,         # List of category names at risk
        "save_this_month":           save_msg,                # Human-readable recommendation
        "months_used":               months_history,          # Echo back the config
        "upcoming_events_applied":   upcoming_events,         # Echo back applied events
    })


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT 4: Account Aggregator Webhook (STUB)
# POST /api/budget/aa-webhook/  (not yet wired in urls.py)
# ─────────────────────────────────────────────────────────────────────────────

# 2. ACCOUNT AGGREGATOR (AA) WEBHOOK
@api_view(['POST'])
def aa_webhook_sync(request):
    # WHAT IS THE ACCOUNT AGGREGATOR (AA) FRAMEWORK?
    # The RBI (Reserve Bank of India) mandated Account Aggregator framework
    # lets users share their financial data between registered institutions.
    # Providers: Setu (by Pine Labs), Sahamati, Onemoney, Perfios.
    #
    # HOW IT WOULD WORK FOR FIN-OS:
    #   1. User links their bank account to FIN-OS via Setu/Sahamati
    #   2. When a debit transaction occurs (e.g., Swiggy charges ₹450),
    #      the AA sends a PUSH notification to this webhook endpoint
    #   3. FIN-OS parses the raw banking data and auto-creates a Transaction record
    #   4. NLP auto-categorises: "SWIGGY ORDER" → WANT, "HOME LOAN EMI" → DEBT_GOOD
    #   5. Transaction appears in the React dashboard in real-time
    #
    # CURRENT STATE: STUB — this function is not yet wired to a URL pattern
    # in api/urls.py. The raw_data is received but not processed or stored.
    #
    # TO WIRE IT UP: Add to api/urls.py:
    #   path('aa-webhook/', views.aa_webhook_sync, name='aa-webhook')
    #
    # PLANNED IMPLEMENTATION:
    #   1. Verify the request signature (HMAC-SHA256) from Setu/Sahamati
    #   2. Parse the banking transaction format (FIP data packet)
    #   3. Run NLP to auto-categorise the transaction description
    #   4. Call Transaction.objects.create() to persist it
    #   5. Push the update to connected WebSocket clients (Django Channels)

    # This endpoint receives real-time transaction data from Setu/Sahamati APIs
    # and pushes it to the React frontend via WebSockets
    raw_data = request.data
    # ... parse banking data, auto-categorize using NLP
    return Response({"status": "synced"})
