# ─────────────────────────────────────────────────────────────────────────────
# asgi.py — Asynchronous Server Gateway Interface (FIN-OS Core Server)
# ─────────────────────────────────────────────────────────────────────────────
# ASGI = Asynchronous Server Gateway Interface (PEP 3333 successor).
# It is the modern alternative to WSGI that supports:
#   • Standard HTTP requests (like WSGI)
#   • WebSocket connections (persistent, bidirectional — needed for real-time)
#   • HTTP/2 server-sent events
#   • Long-polling
#
# WHEN WOULD FIN-OS USE ASGI?
#   Right now: Never — all FIN-OS Core views are synchronous HTML renders.
#   Future use cases that would need ASGI:
#     - Real-time portfolio price streaming over WebSocket
#     - Live trade journal updates pushed from server
#     - Arya AI chat over persistent WebSocket connection
#     - Account Aggregator (AA) webhook push to connected browsers
#
# HOW TO SWITCH FROM WSGI TO ASGI IN PRODUCTION:
#   Instead of: gunicorn core.wsgi:application
#   Use:        uvicorn core.asgi:application --host 0.0.0.0 --port 8000
#   Or:         daphne core.asgi:application  (Django Channels' own server)
#
# NOTE: Django Channels must be installed for full WebSocket support:
#   pip install channels channels-redis
#   Add 'channels' to INSTALLED_APPS in settings.py
# ─────────────────────────────────────────────────────────────────────────────
"""
ASGI config for core project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

# Same as wsgi.py — Django must know its settings before initialisation.
# setdefault() means it won't override an environment variable already set,
# allowing production deployments to inject a different settings module
# (e.g. DJANGO_SETTINGS_MODULE=core.settings_production).
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

# Build and expose the ASGI application callable.
# For pure HTTP (no WebSockets), this behaves identically to the WSGI version.
# When using Django Channels, you'd wrap this further:
#   from channels.routing import ProtocolTypeRouter
#   application = ProtocolTypeRouter({"http": get_asgi_application(), "websocket": ...})
application = get_asgi_application()
