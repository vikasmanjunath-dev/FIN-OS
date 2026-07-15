# ─────────────────────────────────────────────────────────────────────────────
# finos/urls.py — App-Level URL Configuration (FIN-OS Core Server)
# ─────────────────────────────────────────────────────────────────────────────
# This file maps URL paths to view functions for the 'finos' application.
# It is loaded by core/urls.py via include('finos.urls').
#
# COMPLETE URL MAP (after combining with core/urls.py include):
#
#   GET /                        → views.landing         ← Command Center home
#   GET /investor/               → views.investor        ← Investor Dashboard
#   GET /trader/                 → views.trader          ← Trader Dashboard
#   GET /simulations/            → views.simulations     ← Simulations Hub
#   GET /investor-simulations/   → views.investor_simulations
#   GET /trader-simulations/     → views.trader_simulations
#
# HOW URL NAMESPACING WORKS:
#   app_name = 'finos' sets the application namespace.
#   This lets you reference URLs as 'finos:landing' instead of just 'landing'.
#   Benefits:
#     - No name collision if multiple apps have a view called 'landing'
#     - In templates:  {% url 'finos:investor' %}
#     - In Python:     reverse('finos:investor')  →  '/investor/'
#
# TRAILING SLASH CONVENTION:
#   Django convention is to always include trailing slashes: 'investor/'
#   The CommonMiddleware in settings.py automatically redirects requests
#   WITHOUT trailing slashes to the version WITH trailing slashes (301 redirect).
#   So: GET /investor  →  301 redirect to /investor/  →  200 OK
# ─────────────────────────────────────────────────────────────────────────────
from django.urls import path
from . import views

# app_name declares the URL namespace for this app.
# This string is used to prefix all `name` values in this urlconf.
# After this, the landing view is referenced as 'finos:landing' globally.
app_name = 'finos'

urlpatterns = [
    # Root path: serves the FIN-OS Command Center landing page.
    # '' = empty string = matches the path '/' (after core/urls.py strips nothing)
    # name='landing' → used in templates as {% url 'finos:landing' %}
    path('', views.landing, name='landing'),

    # Investor Dashboard — long-term wealth building, SIP tracking, portfolio view
    # path('investor/', ...) matches exactly '/investor/' — no wildcards
    path('investor/', views.investor, name='investor'),

    # Trader Dashboard — short-term technical analysis, intraday tools
    path('trader/', views.trader, name='trader'),

    # Simulations Hub — landing page linking to both investor and trader simulations
    path('simulations/', views.simulations, name='simulations'),

    # Investor-specific simulation suite (SIP calculator, wealth projection, etc.)
    # Note: hyphens in URL → underscores in the name (Python identifier rule)
    path('investor-simulations/', views.investor_simulations, name='investor_simulations'),

    # Trader-specific simulation suite (backtesting, risk/reward calculator, etc.)
    path('trader-simulations/', views.trader_simulations, name='trader_simulations'),
]
