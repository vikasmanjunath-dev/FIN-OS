#!/usr/bin/env python
# ─────────────────────────────────────────────────────────────────────────────
# manage.py — Django's Command-Line Utility (Expense Tracker Backend)
# ─────────────────────────────────────────────────────────────────────────────
# Identical structure to finos 2/manage.py but points at a DIFFERENT settings
# module: 'finos_backend.settings' instead of 'core.settings'.
#
# This is how Django knows these are two separate projects even though both
# run on the same machine — each project has its own manage.py pointing at
# its own settings file.
#
# COMMON COMMANDS FOR THIS PROJECT:
#   python manage.py migrate
#       → Creates db.sqlite3 and runs 0001_initial.py migration
#       → Creates the api_transaction table in the database
#
#   python manage.py runserver 8001
#       → Starts the budget API server on port 8001
#       → Run on a different port from finos 2/ (which uses 8000)
#
#   python manage.py createsuperuser
#       → Creates an admin login so you can view transactions at /admin/
#
#   python manage.py shell
#       → Opens a Python shell with Django already configured
#       → Useful for testing ORM queries interactively:
#           from api.models import Transaction
#           Transaction.objects.all()
#
#   python manage.py dbshell
#       → Opens the SQLite command-line interface for raw SQL queries
# ─────────────────────────────────────────────────────────────────────────────
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    # Point to THIS project's settings file.
    # 'finos_backend.settings' = ExpenseTracker/finos_backend/finos_backend/settings.py
    # The double 'finos_backend' is because the settings package is named after
    # the project — a common Django convention from `django-admin startproject finos_backend`.
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'finos_backend.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
