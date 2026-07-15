# ─────────────────────────────────────────────────────────────────────────────
# wsgi.py — WSGI Entry Point (Expense Tracker Backend)
# ─────────────────────────────────────────────────────────────────────────────
# Same purpose as finos 2/core/wsgi.py but for the budget API project.
#
# In development: NOT used — `python manage.py runserver` has its own server.
# In production:  Gunicorn loads this file to find the `application` callable.
#
# PRODUCTION STARTUP COMMAND:
#   cd ExpenseTracker/finos_backend
#   gunicorn finos_backend.wsgi:application \
#     --bind 0.0.0.0:8001 \
#     --workers 4 \
#     --timeout 120
#
# WHY 4 WORKERS?
#   Gunicorn's pre-fork worker model: each worker handles one request at a time.
#   Rule of thumb: 2 × CPU_cores + 1 workers for CPU-bound apps.
#   The forecast endpoint runs statsmodels (CPU-intensive) so more workers help.
#
# --timeout 120:
#   A worker that doesn't respond in 120 seconds is killed and restarted.
#   The Holt-Winters forecast on large datasets could be slow — set this high enough.
# ─────────────────────────────────────────────────────────────────────────────
"""
WSGI config for finos_backend project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

# Tell Django which settings module to use before building the application.
# This must be set before get_wsgi_application() initialises the Django framework.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'finos_backend.settings')

# Build the WSGI callable. This:
#   1. Reads all settings from finos_backend/settings.py
#   2. Connects to the SQLite database
#   3. Loads all INSTALLED_APPS (api, rest_framework, corsheaders, etc.)
#   4. Returns a callable: application(environ, start_response)
# Gunicorn calls this `application` object for every incoming HTTP request.
application = get_wsgi_application()
