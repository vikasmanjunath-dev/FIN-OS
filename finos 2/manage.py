#!/usr/bin/env python
# ─────────────────────────────────────────────────────────────────────────────
# manage.py — Django's Command-Line Utility (FIN-OS Core Server)
# ─────────────────────────────────────────────────────────────────────────────
# This is the ENTRY POINT for all Django management commands. You will use
# this file constantly during development. You never need to edit it.
#
# HOW TO USE:
#   python manage.py runserver          ← Start the development web server
#   python manage.py migrate            ← Apply database migrations
#   python manage.py makemigrations     ← Generate new migration files
#   python manage.py createsuperuser    ← Create an admin panel user
#   python manage.py shell              ← Open Django's interactive Python shell
#   python manage.py collectstatic      ← Gather static files for production
#   python manage.py test               ← Run the test suite
#
# WHAT HAPPENS WHEN YOU RUN `python manage.py runserver`:
#   1. Python runs this file as a script (__name__ == '__main__')
#   2. main() is called
#   3. Django settings are pointed at 'core.settings' (our settings.py)
#   4. Django imports execute_from_command_line and reads sys.argv
#      (e.g. ['manage.py', 'runserver'])
#   5. Django starts a development HTTP server on http://127.0.0.1:8000
# ─────────────────────────────────────────────────────────────────────────────
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    # Tell Django which settings file to use for this project.
    # 'core.settings' means Python will look for the file at core/settings.py
    # relative to this manage.py file.
    # setdefault() only sets this if it hasn't been set already — so you can
    # override it by exporting DJANGO_SETTINGS_MODULE in your shell:
    #   export DJANGO_SETTINGS_MODULE=core.settings_production
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
    try:
        # Import Django's management command runner.
        # This import is inside try/except because if Django isn't installed,
        # the ImportError message below is much friendlier than a raw traceback.
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        # This error almost always means either:
        #   (a) You forgot to activate your virtual environment, OR
        #   (b) Django isn't installed in the current Python environment
        # FIN-OS fix: run `source .venv/bin/activate` then retry
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    # Pass the full command-line arguments to Django's dispatcher.
    # sys.argv is a list like: ['manage.py', 'runserver', '8000']
    # Django reads argv[1] to determine which management command to run.
    execute_from_command_line(sys.argv)


# Standard Python idiom: this block only runs when the file is executed
# directly (`python manage.py ...`), NOT when it's imported as a module.
if __name__ == '__main__':
    main()
