# ─────────────────────────────────────────────────────────────────────────────
# wsgi.py — Web Server Gateway Interface (FIN-OS Core Server)
# ─────────────────────────────────────────────────────────────────────────────
# WSGI = Web Server Gateway Interface.
# This is the standard Python interface between a web server (Gunicorn, Apache,
# Nginx+uWSGI) and a Python web application (Django).
#
# HOW IT WORKS:
#   Production server (Gunicorn)
#          │
#          │  calls application(environ, start_response)
#          ▼
#   wsgi.py  ← this file exposes the callable named `application`
#          │
#          ▼
#   Django processes the request through middleware → url router → view
#
# DEVELOPMENT vs PRODUCTION:
#   Development:  `python manage.py runserver` — Django uses its own built-in
#                 HTTP server; this file is NOT used.
#   Production:   Gunicorn reads this file to find the `application` callable.
#                 Run: gunicorn core.wsgi:application --bind 0.0.0.0:8000
#
# WSGI vs ASGI:
#   WSGI (this file) = synchronous. One request is handled at a time per worker.
#   ASGI (asgi.py)   = asynchronous. Supports WebSockets and concurrent requests.
#   FIN-OS Core Server uses WSGI — all views are simple synchronous HTML renders.
# ─────────────────────────────────────────────────────────────────────────────
"""
WSGI config for core project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

# Point Django at the correct settings module before building the application.
# This MUST happen before get_wsgi_application() is called, because Django
# reads settings during initialisation (to know which apps, DB, middleware, etc.)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

# Build and expose the WSGI application object.
# get_wsgi_application() initialises Django (loads settings, connects to DB,
# registers apps) and returns a callable that Gunicorn will call for every
# HTTP request: application(environ, start_response) → response bytes
application = get_wsgi_application()
