# ─────────────────────────────────────────────────────────────────────────────
# asgi.py — ASGI Entry Point (Expense Tracker Backend)
# ─────────────────────────────────────────────────────────────────────────────
# The async counterpart to wsgi.py. Currently unused but ready for when FIN-OS
# needs real-time features in the budget API.
#
# FUTURE SCENARIOS THAT WOULD REQUIRE ASGI HERE:
#
#   1. Account Aggregator (AA) Push:
#      The RBI Account Aggregator framework (Setu, Sahamati) can push banking
#      transaction data in real-time via WebSocket. When a debit hits your
#      bank account, AA pushes it to FIN-OS immediately. This requires
#      a persistent WebSocket connection — only possible with ASGI.
#
#   2. Real-time Budget Dashboard:
#      Live updates to the React dashboard as new transactions arrive.
#      Instead of React polling /api/budget/overview/ every 30 seconds,
#      Django pushes updates over WebSocket when the DB changes.
#
#   3. AI Categorisation Progress:
#      If the NLP auto-categorisation (planned for aa_webhook_sync) is slow,
#      streaming progress updates to the UI requires async responses.
#
# TO SWITCH TO ASGI IN PRODUCTION:
#   pip install uvicorn
#   uvicorn finos_backend.asgi:application --host 0.0.0.0 --port 8001
# ─────────────────────────────────────────────────────────────────────────────
"""
ASGI config for finos_backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'finos_backend.settings')

# Builds the ASGI application. For pure HTTP requests (no WebSocket),
# this behaves the same as get_wsgi_application(). The difference becomes
# apparent when you add Django Channels or Starlette routing on top.
application = get_asgi_application()
