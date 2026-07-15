# ─────────────────────────────────────────────────────────────────────────────
# finos/apps.py — Application Configuration for the 'finos' App
# ─────────────────────────────────────────────────────────────────────────────
# Every Django app has an AppConfig class that tells Django metadata about
# the app: its name, human-readable label, default primary key type, and
# any startup code (ready() method).
#
# Django discovers this config because:
#   1. 'finos' is listed in INSTALLED_APPS in settings.py
#   2. Django reads finos/apps.py and finds FinosConfig
#   3. It registers FinosConfig as the configuration for this app
#
# You can also be explicit in INSTALLED_APPS:
#   'finos.apps.FinosConfig'  (same result, but more precise)
#
# WHEN TO ADD CODE HERE:
#   - Connecting signals on startup: add a ready() method
#     def ready(self):
#         import finos.signals  # connect signal handlers
#   - Setting default_auto_field per-app (overrides the project-wide setting)
#   - Adding a verbose_name for the admin panel group header
# ─────────────────────────────────────────────────────────────────────────────
from django.apps import AppConfig


class FinosConfig(AppConfig):
    # The Python dotted path to this app's package.
    # Django uses this to locate models, views, templates, etc.
    # Must match the folder name exactly: 'finos' → finos/ directory.
    name = 'finos'
