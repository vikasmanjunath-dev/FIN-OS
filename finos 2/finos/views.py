# ─────────────────────────────────────────────────────────────────────────────
# finos/views.py — View Functions (FIN-OS Core Server)
# ─────────────────────────────────────────────────────────────────────────────
# A Django VIEW is a Python function (or class) that:
#   1. Receives an HttpRequest object
#   2. Performs any necessary logic (DB queries, calculations, API calls)
#   3. Returns an HttpResponse object (HTML page, JSON, redirect, file, etc.)
#
# This file contains 6 views — one for each major FIN-OS page section.
# All views follow the same simple pattern: receive request, render template.
# No database queries happen here because this app has no models yet.
#
# THE render() FUNCTION:
#   render(request, template_name, context=None, ...)
#     • request       = the incoming HttpRequest (passed through unchanged)
#     • template_name = path relative to any configured TEMPLATES DIRS
#     • context       = optional dict of variables to pass into the template
#                       e.g. {'user_name': 'Vikas', 'stock_count': 10}
#     Returns: HttpResponse with Content-Type 'text/html' and status 200
#
# HOW A VIEW GETS CALLED:
#   Browser sends GET /investor/
#     → Django URL router matches finos/urls.py pattern 'investor/'
#     → Django calls investor(request)
#     → investor() calls render() which reads finos/investor.html
#     → render() processes all {% %} tags and {{ }} variables in the template
#     → Returns completed HTML string wrapped in HttpResponse
#     → Django sends it to the browser with proper HTTP headers
#
# THE HttpRequest OBJECT (first argument to every view):
#   request.method      → 'GET', 'POST', 'PUT', etc.
#   request.GET         → QueryDict of URL parameters (?key=value)
#   request.POST        → QueryDict of submitted form fields
#   request.user        → Logged-in User or AnonymousUser
#   request.session     → Session dict (persists across requests)
#   request.COOKIES     → Dict of cookies
#   request.META        → HTTP headers and server environment variables
#   request.path        → '/investor/'
# ─────────────────────────────────────────────────────────────────────────────

# render() is a shortcut that calls:
#   1. loader.get_template(template_name)   ← finds the .html file
#   2. template.render(context, request)    ← processes tags/variables
#   3. HttpResponse(rendered_html)          ← wraps result in HTTP response
# Without this shortcut, you'd need to import loader, Template, Context separately.
from django.shortcuts import render

# ─────────────────────────────────────────────────────────────────────────────
# LANDING PAGE VIEW — FIN-OS Command Center
# ─────────────────────────────────────────────────────────────────────────────
def landing(request):
    # Renders the main FIN-OS Command Center page.
    # Template: templates/finos/landing.html (extends base.html)
    # Features rendered by the template:
    #   - Bloomberg-style grid background animation
    #   - Hero title with gradient text: "FIN-OS | COMMAND CENTER"
    #   - 4-column stat strip (total users, modules, calculators, etc.)
    #   - Navigation cards to Investor / Trader / Simulations / Tools
    #   - Custom cursor effect (hidden on touch devices)
    # No context needed — all data is static in the template.
    return render(request, 'finos/landing.html')

# ─────────────────────────────────────────────────────────────────────────────
# INVESTOR DASHBOARD VIEW
# ─────────────────────────────────────────────────────────────────────────────
def investor(request):
    # Renders the Investor-mode dashboard.
    # Template: templates/finos/investor.html (extends base.html)
    # Investor mode focuses on:
    #   - Long-term wealth building (5+ year horizon)
    #   - SIP (Systematic Investment Plan) tracking
    #   - Mutual fund and index fund portfolio view
    #   - Goal-based investing (retirement, home, education)
    #   - Fundamental analysis links
    return render(request, 'finos/investor.html')

# ─────────────────────────────────────────────────────────────────────────────
# TRADER DASHBOARD VIEW
# ─────────────────────────────────────────────────────────────────────────────
def trader(request):
    # Renders the Trader-mode dashboard.
    # Template: templates/finos/trader.html (extends base.html)
    # Trader mode focuses on:
    #   - Short-term price action and technical analysis
    #   - Intraday and swing trade management
    #   - RSI, MACD, Bollinger Bands indicators
    #   - Trade journal integration
    #   - Risk/reward calculator
    return render(request, 'finos/trader.html')

# ─────────────────────────────────────────────────────────────────────────────
# SIMULATIONS HUB VIEW
# ─────────────────────────────────────────────────────────────────────────────
def simulations(request):
    # Renders the shared Simulations Hub page.
    # Template: templates/finos/simulations.html (extends base.html)
    # This is a "hub" page — it links to both investor and trader simulations
    # rather than containing simulations directly.
    # Acts as a mode-selection gate: the user picks Investor or Trader path,
    # then lands on the appropriate simulation suite.
    return render(request, 'finos/simulations.html')

# ─────────────────────────────────────────────────────────────────────────────
# TRADER SIMULATIONS VIEW
# ─────────────────────────────────────────────────────────────────────────────
def trader_simulations(request):
    # Renders the Trader-specific simulation tools.
    # Template: templates/finos/trader_simulations.html (extends base.html)
    # Likely includes:
    #   - Options payoff simulator (Nifty 50 options strategies)
    #   - Backtesting interface for technical strategies
    #   - Position sizing calculator
    #   - Stop-loss and target calculator
    return render(request, 'finos/trader_simulations.html')

# ─────────────────────────────────────────────────────────────────────────────
# INVESTOR SIMULATIONS VIEW
# ─────────────────────────────────────────────────────────────────────────────
def investor_simulations(request):
    # Renders the Investor-specific simulation tools.
    # Template: templates/finos/investor_simulations.html (extends base.html)
    # Likely includes:
    #   - SIP growth calculator (with inflation adjustment)
    #   - Monte Carlo wealth projection (10,000 scenarios)
    #   - Asset allocation simulator (equity/debt/gold mix)
    #   - Goal achievement probability calculator
    #   - Tax-saving (ELSS, PPF, NPS) comparison tool
    return render(request, 'finos/investor_simulations.html')
