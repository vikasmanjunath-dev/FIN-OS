# ─────────────────────────────────────────────────────────────────────────────
# api/urls.py — App URL Configuration (Expense Tracker Backend)
# ─────────────────────────────────────────────────────────────────────────────
# Defines the URL patterns for the budget API within the /api/budget/ prefix.
# This file is included by finos_backend/urls.py via include('api.urls').
#
# FULL URL MAP (prefix from root urlconf included):
#
#   GET  /api/budget/overview/    → get_budget_overview(request)
#                                    Returns all transactions + health metrics
#
#   POST /api/budget/overview/    → get_budget_overview(request)
#                                    Creates a new Transaction record
#
#   GET  /api/budget/forecast/    → forecast_budget(request)
#                                    Forecast using last 6 months, no events
#
#   POST /api/budget/forecast/    → forecast_budget(request)
#                                    Forecast with custom months_history + events
#
#   POST /api/budget/wealth-sim/  → run_wealth_simulation(request)
#                                    Monte Carlo 10-year wealth projection
#
# NOTE: There is no 'aa-webhook/' path yet — aa_webhook_sync() is a stub
# function in views.py that hasn't been wired to a URL pattern yet.
# To add it, include: path('aa-webhook/', views.aa_webhook_sync, name='aa-webhook')
#
# HOW THIS FILE IS LOADED:
#   1. A request arrives for /api/budget/forecast/
#   2. finos_backend/urls.py matches 'api/budget/' and passes 'forecast/' here
#   3. Django iterates through urlpatterns below
#   4. path('forecast/', ...) matches → views.forecast_budget is called
# ─────────────────────────────────────────────────────────────────────────────
from django.urls import path
from . import views

# '.' means "from the current package" — imports views.py in the same api/ directory.
# This is a relative import, equivalent to: from api import views

urlpatterns = [
    # GET/POST /api/budget/overview/
    # Dual-purpose endpoint — method detection is inside the view function:
    #   if request.method == 'POST':  → log new transaction
    #   else (GET):                   → return all transactions + metrics
    # name='budget-overview' enables reverse URL lookup:
    #   reverse('budget-overview') → '/api/budget/overview/'
    path('overview/',   views.get_budget_overview,  name='budget-overview'),

    # GET/POST /api/budget/forecast/
    # Holt-Winters time-series forecasting endpoint.
    # GET: forecast with defaults (6-month history, no events)
    # POST: forecast with custom body { months_history, upcoming_events }
    path('forecast/',   views.forecast_budget,       name='budget-forecast'),

    # POST /api/budget/wealth-sim/
    # Monte Carlo wealth projection. DRF's @api_view(['POST']) decorator
    # means this endpoint returns 405 Method Not Allowed for GET requests.
    # Accepts: { current_wealth: number, monthly_sip: number }
    # Returns: optimistic/expected/pessimistic 10-year wealth paths
    path('wealth-sim/', views.run_wealth_simulation, name='wealth-simulation'),
]
