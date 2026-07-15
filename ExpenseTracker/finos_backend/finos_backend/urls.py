# ─────────────────────────────────────────────────────────────────────────────
# finos_backend/urls.py — Root URL Configuration (Expense Tracker Backend)
# ─────────────────────────────────────────────────────────────────────────────
# This is the root URL dispatcher for the budget API project.
# All incoming HTTP requests are matched against these patterns in order.
#
# COMPLETE URL ROUTING MAP:
#
#   /admin/                        → Django admin panel
#   /api/budget/overview/          → api/views.get_budget_overview   (GET + POST)
#   /api/budget/forecast/          → api/views.forecast_budget       (GET + POST)
#   /api/budget/wealth-sim/        → api/views.run_wealth_simulation (POST)
#
# HOW THE NESTING WORKS:
#   This file:      path('api/budget/', include('api.urls'))
#   api/urls.py:    path('overview/', views.get_budget_overview, ...)
#
#   When a request comes in for /api/budget/overview/:
#     1. This file matches 'api/budget/' prefix
#     2. Strips the prefix, leaving 'overview/'
#     3. Passes 'overview/' to api/urls.py
#     4. api/urls.py matches 'overview/' → calls get_budget_overview(request)
#
# WHY prefix with 'api/budget/'?
#   API versioning and organisation:
#     /api/budget/*  → budget-related endpoints (this app)
#     /api/alerts/*  → future: price alert endpoints
#     /api/arya/*    → future: Arya AI endpoints
#   Using /api/ as root makes it clear these are API endpoints, not pages.
#   /budget/ scopes it to the budget module.
# ─────────────────────────────────────────────────────────────────────────────
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    # Django's built-in admin panel.
    # Access at http://localhost:8000/admin/
    # Login with the superuser created via: python manage.py createsuperuser
    # Shows all models registered in api/admin.py (currently: Transaction)
    path('admin/', admin.site.urls),

    # Delegate all /api/budget/* requests to the api app's URL configuration.
    # include('api.urls') imports api/urls.py and resolves the remaining path
    # after 'api/budget/' is stripped.
    # This keeps api/urls.py clean — it only knows about paths WITHIN /api/budget/
    path('api/budget/', include('api.urls')), # This links our new endpoints
]
