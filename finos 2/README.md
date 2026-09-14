# FIN-OS Django Template Server

> Django 6.0.4 · Python 3.x · Static page server  
> **Port:** 8000 (default) | **Updated:** July 2026

The Django-based static page server for FIN-OS. Serves the core HTML pages (`landing`, `investor`, `trader`, `simulations`) as Django-rendered templates.

> **Full documentation:** [`docs/DJANGO.md`](../docs/DJANGO.md) — covers TRD, FRD, all functions, ORM, migrations, settings, URL routing, and deployment.

---

## Folder Structure

```
finos 2/
├── manage.py           ← Django CLI entry point
├── db.sqlite3          ← SQLite database (development)
│
├── core/               ← Django project package
│   ├── settings.py     ← All Django settings
│   ├── urls.py         ← Root URL configuration
│   ├── wsgi.py         ← WSGI entry point (Gunicorn)
│   └── asgi.py         ← ASGI entry point (future async)
│
├── finos/              ← Main Django app
│   ├── views.py        ← Page view functions
│   ├── urls.py         ← App URL patterns
│   ├── models.py       ← Data models (UserProfile — planned)
│   ├── admin.py        ← Django admin registration
│   ├── apps.py         ← AppConfig
│   └── tests.py        ← Test cases
│
└── templates/
    └── finos/          ← HTML templates served by views
        ├── landing.html
        ├── investor.html
        ├── trader.html
        ├── simulations.html
        ├── trader_simulations.html
        └── investor_simulations.html
```

---

## Pages Served

| URL path | View | Template |
|---|---|---|
| `/` | `landing` | `finos/landing.html` |
| `/investor/` | `investor` | `finos/investor.html` |
| `/trader/` | `trader` | `finos/trader.html` |
| `/simulations/` | `simulations` | `finos/simulations.html` |
| `/trader/simulations/` | `trader_simulations` | `finos/trader_simulations.html` |
| `/investor/simulations/` | `investor_simulations` | `finos/investor_simulations.html` |

---

## Quick Start

```bash
cd "finos 2"

# Activate virtual environment
source .venv/Scripts/activate      # Windows
# OR
source .venv/bin/activate          # macOS/Linux

# Apply migrations
python manage.py migrate

# Start development server
python manage.py runserver
# → http://localhost:8000
```

---

## Key Settings (core/settings.py)

| Setting | Value | Notes |
|---|---|---|
| `DEBUG` | `True` | Set to `False` in production |
| `DATABASES` | SQLite (`db.sqlite3`) | Switch to PostgreSQL for production |
| `INSTALLED_APPS` | `finos` (custom) + Django defaults | |
| `TEMPLATES` | `templates/` directory | Django template rendering |
| `STATIC_URL` | `/static/` | CSS/JS served from `static/` |

---

## Difference from the DRF Backend

| Feature | `finos 2/` (this) | `ExpenseTracker/finos_backend/` |
|---|---|---|
| Django version | 6.0.4 | 5.2.9 |
| Purpose | Serve HTML template pages | REST API for budget data |
| REST Framework | ✗ | ✓ DRF |
| Database usage | Minimal (templates only) | Transactions, forecasting, Monte Carlo |
| Port | 8000 | 8001 |

---

## Production Deployment

```bash
# Install Gunicorn
pip install gunicorn

# Run with 4 workers
gunicorn core.wsgi:application \
  --workers 4 \
  --bind 0.0.0.0:8000 \
  --timeout 60
```

See [`docs/DJANGO.md`](../docs/DJANGO.md) for the full deployment checklist, settings reference, and URL routing documentation.
