# FIN-OS — Django Documentation
## Functional Requirements Document (FRD) + Technical Requirements Document (TRD)

**Owner:** Vikas Manjunath | **Version:** 1.0 | **Date:** July 15, 2026 | **Status:** Active

---

## Table of Contents

1. [What is Django? (Beginner Primer)](#1-what-is-django-beginner-primer)
2. [Django Projects in FIN-OS — Overview](#2-django-projects-in-fin-os--overview)
3. [Functional Requirements Document (FRD)](#3-functional-requirements-document-frd)
4. [Technical Requirements Document (TRD)](#4-technical-requirements-document-trd)
5. [Project 1: FIN-OS Core Server (`finos 2/`)](#5-project-1-fin-os-core-server-finos-2)
6. [Project 2: Expense Tracker Backend (`finos_backend/`)](#6-project-2-expense-tracker-backend-finos_backend)
7. [Libraries — Basic to Advanced](#7-libraries--basic-to-advanced)
8. [Functions — Complete Reference](#8-functions--complete-reference)
9. [Django Concepts Used in FIN-OS (Basic → Advanced)](#9-django-concepts-used-in-fin-os-basic--advanced)
10. [REST API Endpoint Reference](#10-rest-api-endpoint-reference)
11. [Database Schema](#11-database-schema)
12. [Settings Reference](#12-settings-reference)
13. [Middleware Pipeline](#13-middleware-pipeline)
14. [URL Routing Architecture](#14-url-routing-architecture)
15. [Deployment Checklist](#15-deployment-checklist)

---

## 1. What is Django? (Beginner Primer)

### What Problem Does Django Solve?

When you build a financial application like FIN-OS, you need:
- A **web server** that listens on a port and handles HTTP requests
- A **router** that maps `/api/budget/forecast/` to the Python function that runs the forecasting math
- A **database layer** that stores transactions without writing raw SQL
- A **security layer** that blocks CSRF attacks, enforces HTTPS headers, validates sessions
- An **admin panel** (free, built-in) that lets you view/edit database records in a browser

Django provides all of this in one package. Contrast this with Flask (minimal, you bolt everything on) or FastAPI (async-first, no ORM, no admin). FIN-OS uses Django specifically for features that need a full stack with a database, and FastAPI/Flask for lightweight API microservices.

### The Django Request–Response Cycle

```
Browser / React App
        │
        ▼  HTTP Request (GET /api/budget/overview/)
  ┌─────────────┐
  │   Django    │  ← manage.py runserver / Gunicorn / WSGI
  │   Server    │
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────┐
  │  Middleware Stack   │  ← Security, CSRF, Sessions, CORS, Auth
  └──────┬──────────────┘
         │
         ▼
  ┌─────────────────────┐
  │  URL Router         │  ← core/urls.py → finos/urls.py or finos_backend/urls.py
  └──────┬──────────────┘
         │
         ▼
  ┌─────────────────────┐
  │  View Function      │  ← finos/views.py or api/views.py
  │  (Python function)  │
  └──────┬──────────────┘
         │
         ▼
  ┌─────────────────────┐
  │  ORM Query          │  ← Transaction.objects.filter(...)
  │  (SQLite/Postgres)  │
  └──────┬──────────────┘
         │
         ▼
  ┌─────────────────────┐
  │  Template or JSON   │  ← render(request, 'finos/landing.html') or JsonResponse
  └──────┬──────────────┘
         │
         ▼
  HTTP Response → Browser / React App
```

### Django MVT Pattern

Django uses **MVT (Model–View–Template)**, a variant of MVC:

| Layer | File | Responsibility |
|-------|------|----------------|
| **Model** | `api/models.py` | Defines database schema as Python classes |
| **View** | `api/views.py` / `finos/views.py` | Business logic — reads request, queries DB, returns response |
| **Template** | `templates/finos/*.html` | HTML rendered server-side (used in `finos 2/` only) |

---

## 2. Django Projects in FIN-OS — Overview

FIN-OS contains **two separate Django projects**, each solving a different problem:

| Attribute | `finos 2/` (Core Server) | `ExpenseTracker/finos_backend/` (Budget API) |
|-----------|--------------------------|----------------------------------------------|
| **Django Version** | 6.0.4 | 5.2.9 |
| **Purpose** | Serves Django-templated HTML pages for FIN-OS UI | REST API backend for the Expense Tracker React app |
| **Database** | SQLite (`db.sqlite3`) — no app models yet | SQLite with `Transaction` model |
| **REST Framework** | No — pure Django templates | Yes — `djangorestframework` + `django-cors-headers` |
| **Frontend** | Django templates (server-side HTML) | React 19 (Vite 5) at `http://localhost:5173` |
| **Port** | 8000 (default) | 8000 (default) |
| **Apps** | `finos` | `api`, `rest_framework`, `corsheaders` |
| **Key Capability** | URL routing for 6 FIN-OS pages | Budget CRUD, Monte Carlo wealth simulation, Holt-Winters forecasting, AA webhook |
| **Migration Count** | 0 (no DB models) | 1 (`0001_initial.py` — creates Transaction table) |

---

## 3. Functional Requirements Document (FRD)

### 3.1 FIN-OS Core Server (`finos 2/`) — Functional Requirements

#### FR-001: Landing Page Delivery
- **What:** Serve the FIN-OS Command Center landing page at `/`
- **Who:** Any browser navigating to the Django server
- **Input:** HTTP GET `/`
- **Output:** Rendered `finos/landing.html` (extends `base.html`) with FIN-OS branding, stat strip, and navigation cards
- **Acceptance:** Page loads with correct CSS variables, cursor effect active, all nav links functional

#### FR-002: Investor Dashboard Page
- **What:** Serve the investor-mode page at `/investor/`
- **Input:** HTTP GET `/investor/`
- **Output:** Rendered `finos/investor.html`

#### FR-003: Trader Dashboard Page
- **What:** Serve the trader-mode page at `/trader/`
- **Input:** HTTP GET `/trader/`
- **Output:** Rendered `finos/trader.html`

#### FR-004: Simulations Hub Page
- **What:** Serve the shared simulations page at `/simulations/`
- **Input:** HTTP GET `/simulations/`
- **Output:** Rendered `finos/simulations.html`

#### FR-005: Investor Simulations Page
- **What:** Serve investor-specific simulations at `/investor-simulations/`
- **Input:** HTTP GET `/investor-simulations/`
- **Output:** Rendered `finos/investor_simulations.html`

#### FR-006: Trader Simulations Page
- **What:** Serve trader-specific simulations at `/trader-simulations/`
- **Input:** HTTP GET `/trader-simulations/`
- **Output:** Rendered `finos/trader_simulations.html`

#### FR-007: Django Admin
- **What:** Provide built-in admin panel at `/admin/`
- **Input:** Authenticated superuser GET/POST
- **Output:** Full CRUD interface over Django-managed models

---

### 3.2 Expense Tracker Backend (`finos_backend/`) — Functional Requirements

#### FR-B001: Transaction Logging (POST)
- **What:** Accept a new financial transaction from the React frontend and persist it to SQLite
- **Endpoint:** `POST /api/budget/overview/`
- **Input (JSON body):**
  ```json
  {
    "title": "Swiggy dinner",
    "amount": 450.00,
    "category": "WANT"
  }
  ```
- **Processing:**
  - Validates JSON body
  - Creates a `Transaction` record via Django ORM
  - `date` is auto-stamped with today's date
- **Output (JSON):**
  ```json
  { "status": "success", "message": "Transaction logged." }
  ```
- **Error (JSON):**
  ```json
  { "status": "error", "message": "<exception message>" }
  ```

#### FR-B002: Budget Overview Dashboard (GET)
- **What:** Return all transactions with computed financial health metrics
- **Endpoint:** `GET /api/budget/overview/`
- **Input:** None
- **Processing:**
  - Fetches all `Transaction` objects ordered by descending date
  - Computes `total_spent` (sum of all amounts)
  - Computes `leak_total` (sum of `WANT` + `DEBT_BAD` transactions only)
  - Computes `health_score = 100 − (leak_total / total_spent × 100)`
- **Output (JSON):**
  ```json
  {
    "status": "success",
    "metrics": {
      "total_spent": 12500.0,
      "leak_total": 3400.0,
      "health_score": 72.8
    },
    "transactions": [
      { "id": 42, "title": "Swiggy dinner", "amount": 450.0, "category": "WANT", "date": "2026-07-15" }
    ]
  }
  ```

#### FR-B003: AI Budget Forecaster
- **What:** Predict next month's spending per category using time-series forecasting
- **Endpoint:** `POST /api/budget/forecast/` or `GET /api/budget/forecast/`
- **Input (JSON body, optional):**
  ```json
  {
    "months_history": 6,
    "upcoming_events": ["Diwali", "Car insurance"]
  }
  ```
- **Processing:**
  - Fetches transactions from the past `months_history` months
  - Buckets spending by `YYYY-MM` and category
  - Applies **Holt-Winters Triple Exponential Smoothing** (statsmodels) if ≥12 months data
  - Applies **Holt's Double Exponential Smoothing** if 6–11 months data
  - Applies **event seasonal multipliers** (Diwali → Shopping ×1.8, Gifts ×2.5, etc.)
  - Flags categories where predicted spend > 3-month average by >20% as "risky"
  - Generates a "save this month" recommendation with rupee amounts
- **Output (JSON):**
  ```json
  {
    "status": "success",
    "predicted_spend_next_month": 18400,
    "by_category": {
      "WANT": { "predicted": 6200, "trend": "up", "trend_symbol": "↑" },
      "NEED": { "predicted": 9800, "trend": "stable", "trend_symbol": "→" }
    },
    "risk_categories": ["WANT"],
    "save_this_month": "Lock ₹1,800 in FD before Diwali spending starts. WANT expected to spike by ₹3,200 vs normal.",
    "months_used": 6,
    "upcoming_events_applied": ["diwali", "car insurance"]
  }
  ```

#### FR-B004: Monte Carlo Wealth Simulation
- **What:** Project future wealth across optimistic/expected/pessimistic scenarios
- **Endpoint:** `POST /api/budget/wealth-sim/`
- **Input (JSON body):**
  ```json
  {
    "current_wealth": 500000,
    "monthly_sip": 10000
  }
  ```
- **Processing:**
  - 10-year projection horizon (fixed)
  - 3 Monte Carlo paths: Optimistic, Expected, Pessimistic
  - Expected return: 12% p.a. | Volatility: 15% p.a.
  - Computes: `current_wealth × (1 + 0.12)^year + (monthly_sip × 12 × year)`
- **Output (JSON):**
  ```json
  {
    "optimistic": [560000, 627200, ...],
    "expected": [560000, 627200, ...],
    "pessimistic": [560000, 627200, ...],
    "labels": ["Year 1", "Year 2", ..., "Year 10"]
  }
  ```

#### FR-B005: Account Aggregator (AA) Webhook
- **What:** Receive real-time banking transaction data from Setu/Sahamati Account Aggregator APIs
- **Endpoint:** `POST /api/budget/aa-webhook/`
- **Input:** Raw banking transaction data (JSON — format depends on AA provider)
- **Processing:** Parse banking data, auto-categorize using NLP (stub — planned feature)
- **Output:** `{ "status": "synced" }`

#### FR-B006: Django Admin for Transactions
- **What:** View, filter, and manually edit `Transaction` records via admin panel
- **Endpoint:** `/admin/`
- **Access:** Requires superuser account (`python manage.py createsuperuser`)
- **Registered Models:** `Transaction` (via `api/admin.py`)

---

## 4. Technical Requirements Document (TRD)

### 4.1 Technology Stack Summary

| Component | Technology | Version | Role |
|-----------|------------|---------|------|
| Web framework | Django | 6.0.4 (finos 2) / 5.2.9 (finos_backend) | HTTP server, ORM, admin, templates |
| REST layer | Django REST Framework (DRF) | ≥3.15.0 | `@api_view`, `Response`, request parsing |
| CORS layer | django-cors-headers | bundled | Cross-Origin headers for React dev server |
| Numerical computing | NumPy | ≥1.26.0 | Array math for Monte Carlo simulation |
| Time-series forecasting | statsmodels | ≥0.14.0 | Holt-Winters ExponentialSmoothing |
| Environment variables | python-dotenv | ≥1.0.0 | `.env` file loading |
| Database | SQLite | (stdlib) | Development; swap to PostgreSQL for production |
| Python | CPython | 3.14 | Runtime |
| WSGI server (dev) | `runserver` | — | Django built-in dev server |
| WSGI server (prod) | Gunicorn | — | Recommended for production |

### 4.2 Performance Requirements

| Metric | Target |
|--------|--------|
| Budget overview GET response time | < 100 ms for < 1,000 transactions |
| Forecast POST response time (6-month window) | < 500 ms |
| Wealth simulation POST response time | < 200 ms |
| Django admin page load | < 1 s |
| SQLite max transaction volume | 100,000 rows (dev only; PostgreSQL for prod) |

### 4.3 Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| CSRF protection | `CsrfViewMiddleware` (all standard views) |
| CSRF bypass for API | `@csrf_exempt` on `get_budget_overview` (temporary; replace with DRF token auth) |
| Clickjacking prevention | `XFrameOptionsMiddleware` → `X-Frame-Options: DENY` |
| HTTPS enforcement | `SecurityMiddleware` (enable `SECURE_SSL_REDIRECT=True` in prod) |
| CORS whitelist | `CORS_ALLOWED_ORIGINS` restricted to `http://localhost:5173` |
| Secret key | Must be rotated from default `django-insecure-*` before production |
| Debug mode | `DEBUG=True` development only; set `DEBUG=False` in production |
| Password validation | 4 validators: similarity, minimum length, common, numeric |

### 4.4 Browser / Client Compatibility

| Client | Support |
|--------|---------|
| Chrome 120+ | Full |
| Safari 17+ | Full |
| Firefox 120+ | Full |
| React 19 (Vite) | Full — CORS headers allow `localhost:5173` |
| Mobile browsers | Responsive templates |

---

## 5. Project 1: FIN-OS Core Server (`finos 2/`)

### 5.1 Directory Structure

```
finos 2/
├── manage.py                    ← Django CLI entry point
├── db.sqlite3                   ← SQLite database file
├── core/                        ← Project configuration package
│   ├── __init__.py
│   ├── settings.py              ← All Django settings
│   ├── urls.py                  ← Root URL router
│   ├── wsgi.py                  ← WSGI application entry (Gunicorn)
│   └── asgi.py                  ← ASGI application entry (Daphne/Uvicorn)
├── finos/                       ← Main Django application
│   ├── __init__.py
│   ├── apps.py                  ← AppConfig (name = 'finos')
│   ├── models.py                ← Empty — no DB models yet
│   ├── views.py                 ← 6 view functions
│   ├── urls.py                  ← 6 URL patterns
│   ├── admin.py                 ← (default stub)
│   ├── tests.py                 ← Test file (empty)
│   └── migrations/
│       └── __init__.py
└── templates/
    └── finos/
        ├── base.html            ← Master layout (CSS vars, nav, cursor)
        ├── landing.html         ← Command Center (FIN-OS home)
        ├── investor.html        ← Investor dashboard
        ├── trader.html          ← Trader dashboard
        ├── simulations.html     ← Simulations hub
        ├── investor_simulations.html
        ├── trader_simulations.html
        ├── journal.html         ← Trade journal
        └── profile.html         ← User profile
```

### 5.2 Root URL Configuration (`core/urls.py`)

```python
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),     # Built-in admin at /admin/
    path('', include('finos.urls')),     # Delegate all other paths to finos app
]
```

**How it works:**
- `admin.site.urls` — Django auto-generates admin routes for all registered models
- `include('finos.urls')` — Django imports `finos/urls.py` and grafts those patterns at `/`
- The empty string `''` means the finos app handles the root path and all sub-paths

### 5.3 App URL Configuration (`finos/urls.py`)

```python
from django.urls import path
from . import views

app_name = 'finos'

urlpatterns = [
    path('',                      views.landing,              name='landing'),
    path('investor/',             views.investor,             name='investor'),
    path('trader/',               views.trader,               name='trader'),
    path('simulations/',          views.simulations,          name='simulations'),
    path('investor-simulations/', views.investor_simulations, name='investor_simulations'),
    path('trader-simulations/',   views.trader_simulations,   name='trader_simulations'),
]
```

**Key concepts:**
- `app_name = 'finos'` — enables **URL namespacing**: use `{% url 'finos:landing' %}` in templates instead of hardcoded `/`
- `name='landing'` — allows reverse URL lookup via `reverse('finos:landing')` in Python or `{% url 'finos:landing' %}` in templates

### 5.4 Views (`finos/views.py`)

All 6 views follow the same pattern — receive the Django `HttpRequest` object, render a template, return the response:

```python
from django.shortcuts import render

def landing(request):
    return render(request, 'finos/landing.html')
```

**`render()` function breakdown:**
- **`request`** — the incoming `HttpRequest` object; carries GET/POST params, session, user, cookies, headers
- **`'finos/landing.html'`** — template path relative to any directory in `TEMPLATES[0]['DIRS']` or app `templates/` folder
- **Return value** — an `HttpResponse` object with Content-Type `text/html` and the rendered HTML as the body

### 5.5 Template System (`templates/finos/base.html`)

The base template defines the complete FIN-OS page shell. Key Django template tags used:

```html
{% load static %}                           ← Load the static file tag library
{% block title %}FIN-OS{% endblock %}       ← Override-able block for page title
{% block extra_head %}{% endblock %}        ← Block for page-specific CSS
{% block content %}{% endblock %}           ← Block for page body
{% url 'finos:landing' %}                   ← Reverse URL resolution
{% static 'css/design-tokens.css' %}        ← Resolves to /static/css/design-tokens.css
```

**Design System in Templates:**
```css
/* base.html inlines the complete CSS design system */
:root {
  --ink:#02020c; --s1:#07071a; --s2:#0d0d24; --s3:#13132e;
  --g:#00ff88;   --r:#ff2d6b; --y:#ffcc00;  --c:#00d4ff; --v:#7c3aff;
  --txt:#f0edff; --dim:#3a3464; --mu:#504a7a;
  --fD:'Bebas Neue'; --fB:'DM Sans'; --fM:'JetBrains Mono';
}
```

These match FIN-OS's `css/design-tokens.css`, ensuring consistency between the Django-templated pages and the static HTML frontend.

---

## 6. Project 2: Expense Tracker Backend (`finos_backend/`)

### 6.1 Directory Structure

```
ExpenseTracker/finos_backend/
├── manage.py                         ← Django CLI entry point
├── db.sqlite3                        ← SQLite database (auto-created on migrate)
├── requirements.txt                  ← Python dependencies
├── finos_backend/                    ← Project configuration package
│   ├── __init__.py
│   ├── settings.py                   ← All settings (CORS, DRF, apps)
│   ├── urls.py                       ← Root URL router
│   ├── wsgi.py
│   └── asgi.py
└── api/                              ← Django application for budget API
    ├── __init__.py
    ├── admin.py                      ← Registers Transaction in admin
    ├── models.py                     ← Transaction model
    ├── views.py                      ← 4 API view functions
    ├── urls.py                       ← 3 URL patterns
    └── migrations/
        ├── __init__.py
        └── 0001_initial.py           ← Creates Transaction table
```

### 6.2 Root URL Configuration (`finos_backend/urls.py`)

```python
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/budget/', include('api.urls')),  # All budget endpoints under /api/budget/
]
```

### 6.3 App URL Configuration (`api/urls.py`)

```python
from django.urls import path
from . import views

urlpatterns = [
    path('overview/',   views.get_budget_overview,  name='budget-overview'),
    path('forecast/',   views.forecast_budget,       name='budget-forecast'),
    path('wealth-sim/', views.run_wealth_simulation, name='wealth-simulation'),
]
```

**Full URL paths (combining root + app):**
- `GET/POST /api/budget/overview/` → `get_budget_overview()`
- `GET/POST /api/budget/forecast/` → `forecast_budget()`
- `POST     /api/budget/wealth-sim/` → `run_wealth_simulation()`

---

## 7. Libraries — Basic to Advanced

### 7.1 Django (`django>=5.2,<6.0` / `Django==6.0.4`)

**What it is:** Python's "batteries-included" web framework. Everything from ORM to URL routing to form validation to admin is built-in.

**How FIN-OS uses it:**

| Django Module | Import | Used For |
|---------------|--------|----------|
| `django.db.models` | `from django.db import models` | Defining `Transaction` as a Python class that maps to a DB table |
| `django.shortcuts.render` | `from django.shortcuts import render` | Renders an HTML template and returns an `HttpResponse` |
| `django.http.JsonResponse` | `from django.http import JsonResponse` | Returns `application/json` HTTP response |
| `django.views.decorators.csrf.csrf_exempt` | `from django.views.decorators.csrf import csrf_exempt` | Disables CSRF token requirement for an API endpoint |
| `django.contrib.admin` | `from django.contrib import admin` | Provides the built-in admin panel |
| `django.urls.path` | `from django.urls import path` | Registers URL patterns |
| `django.urls.include` | `from django.urls import include` | Delegates URL matching to another urlconf |
| `django.apps.AppConfig` | `from django.apps import AppConfig` | Configures an installed app (name, label, etc.) |
| `django.db.migrations` | — | Auto-generated migration scripts for schema changes |

**Key Django ORM methods used in FIN-OS:**

```python
# CREATE — insert a new row
Transaction.objects.create(title="Swiggy", amount=450.0, category="WANT")

# READ ALL — select * from api_transaction order by date desc
Transaction.objects.all().order_by('-date')

# READ FILTERED — select * where date >= cutoff
Transaction.objects.filter(date__gte=cutoff).order_by('date')
```

**The Manager (`objects`):**
Every model gets a `Manager` at `Model.objects`. It's the gateway to the database. All query operations — `filter()`, `exclude()`, `order_by()`, `create()`, `get()`, `count()` — are called on this manager and return a `QuerySet` (lazy, evaluated only when iterated).

---

### 7.2 Django REST Framework (DRF) (`djangorestframework>=3.15.0`)

**What it is:** The standard library for building REST APIs with Django. Adds serializers, class-based API views, authentication classes, and the browsable API.

**How FIN-OS uses it:**

| DRF Component | Import | Used For |
|---------------|--------|----------|
| `@api_view` decorator | `from rest_framework.decorators import api_view` | Turns a plain Python function into a DRF API view that auto-parses JSON |
| `Response` class | `from rest_framework.response import Response` | Returns structured data that DRF serializes to JSON (or XML, etc.) |
| `request.data` | (available on DRF requests) | Parsed request body — dict from JSON POST body |

**`@api_view` vs plain Django view:**

```python
# Plain Django view — manual JSON parsing
@csrf_exempt
def get_budget_overview(request):
    data = json.loads(request.body)  # Must parse manually
    return JsonResponse({"key": "value"})

# DRF view — automatic parsing + content negotiation
@api_view(['POST'])
def run_wealth_simulation(request):
    data = request.data  # Already parsed dict — DRF handles JSON/form-data
    return Response({"key": "value"})  # DRF handles serialization
```

**Why DRF `Response` vs Django `JsonResponse`:**
- `JsonResponse` only returns JSON
- `Response` supports content negotiation — the client can request JSON, XML, or browsable HTML via `Accept` header
- DRF also handles HTTP status codes correctly via `status=` parameter
- `Response` works seamlessly with DRF's permission and authentication classes

**INSTALLED_APPS registration:**
```python
INSTALLED_APPS = [
    ...
    'rest_framework',  # Needed for @api_view and DRF browsable API
    ...
]
```

---

### 7.3 django-cors-headers (`corsheaders`)

**What it is:** Django middleware that adds CORS (Cross-Origin Resource Sharing) headers to responses. Required because the React frontend runs on `localhost:5173` but calls the Django API on `localhost:8000` — different origins.

**Without CORS:** The browser blocks the React app's API calls with:
```
Access to XMLHttpRequest at 'http://localhost:8000/api/budget/overview/'
from origin 'http://localhost:5173' has been blocked by CORS policy.
```

**How FIN-OS configures it:**

```python
# settings.py
INSTALLED_APPS = [
    ...
    'corsheaders',
    ...
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Must be FIRST before CommonMiddleware
    'django.middleware.security.SecurityMiddleware',
    ...
]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",   # React Vite dev server
    "http://127.0.0.1:5173",
]
```

**Important:** `CorsMiddleware` must be placed before `CommonMiddleware` in the middleware list. This is because CORS preflight `OPTIONS` requests must be handled before Django's common middleware redirects or modifies them.

**How it works at the HTTP level:**
1. React sends `OPTIONS /api/budget/overview/` (preflight)
2. `CorsMiddleware` intercepts and responds with `Access-Control-Allow-Origin: http://localhost:5173`
3. Browser sees approval and sends the actual `POST` request
4. Django processes the request and responds with CORS headers on the response too

---

### 7.4 NumPy (`numpy>=1.26.0`)

**What it is:** Fundamental library for numerical computing in Python. Provides n-dimensional arrays, vectorized math operations, random number generation, and statistical functions.

**How FIN-OS uses it (in `run_wealth_simulation`):**

```python
import numpy as np

np.random.seed(42)          # Fix random seed for reproducible simulations
expected_return = 0.12      # 12% annual return
volatility = 0.15           # 15% annual volatility (not yet applied to paths)

# Generate 3 scenario paths for 10 years
paths = []
for _ in range(3):
    paths.append([
        current_wealth * (1 + expected_return)**y + (monthly_sip * 12 * y)
        for y in range(1, 11)
    ])
```

**Why `np.random.seed(42)`:** Seeds the pseudorandom number generator so the same inputs always produce the same simulation output. Critical for financial simulations — "42" is a conventional seed; use a time-based seed if you want different results each run.

**Future usage (planned):** Full Monte Carlo would use:
```python
returns = np.random.normal(expected_return/12, volatility/np.sqrt(12), (10000, 120))
# 10,000 simulations × 120 months → vectorized wealth path calculation
```

---

### 7.5 statsmodels (`statsmodels>=0.14.0`)

**What it is:** Python library for statistical modeling, econometrics, and time series analysis. FIN-OS uses its `ExponentialSmoothing` class for forecasting.

**How FIN-OS uses it (in `_holt_winters_forecast`):**

```python
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import numpy as np

arr = np.array(values, dtype=float)

# Full Holt-Winters with annual seasonality (≥12 months of data)
model = ExponentialSmoothing(
    arr,
    trend="add",                    # Capture upward/downward trends
    seasonal="add",                 # Capture seasonal patterns (additive)
    seasonal_periods=12,            # Annual cycle = 12 months
    initialization_method="estimated",  # Let statsmodels estimate initial level/trend/season
).fit(optimized=True, use_brute=False)

forecast = float(model.forecast(1)[0])  # Predict 1 step ahead (next month)
```

**Three levels of exponential smoothing:**

| Method | Formula | When Used in FIN-OS |
|--------|---------|----------------------|
| Simple (SES) | `ŷ = α·yₜ + (1-α)·ŷₜ₋₁` | Not used directly |
| Holt's Double | Adds trend term | < 6 months data (manual `_holt_forecast`) |
| Holt-Winters Triple | Adds seasonal term | ≥ 6 months (statsmodels, falls back to Holt's if <12) |

**Parameters explained:**

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `trend="add"` | Additive | Trend added to level (not multiplied). Use "mul" if trend grows proportionally |
| `seasonal="add"` | Additive | Seasonal component added to level. Use "mul" if seasonal swings grow proportionally |
| `seasonal_periods=12` | 12 | One full seasonal cycle = 12 months. For quarterly data, use 4 |
| `initialization_method="estimated"` | — | statsmodels estimates initial level/trend/season from the data. Alternatives: "heuristic", "legacy-heuristic", "known" |
| `optimized=True` | — | Optimizes α, β, γ smoothing parameters via MLE (Maximum Likelihood Estimation) |
| `use_brute=False` | — | Skip brute-force grid search for initial parameter values (faster) |

**Import guard pattern used in FIN-OS:**
```python
try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    # ... run statistical model
except ImportError:
    return _holt_forecast(values)   # Pure Python fallback if statsmodels not installed
except Exception:
    return _holt_forecast(values)   # Catch convergence failures, NaN outputs, etc.
```

---

### 7.6 python-dotenv (`python-dotenv>=1.0.0`)

**What it is:** Loads environment variables from a `.env` file into `os.environ`. Used to keep secrets (API keys, database URLs) out of source code.

**Typical usage pattern:**
```python
# settings.py (not yet implemented in finos_backend but listed as dependency)
from pathlib import Path
from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'fallback-dev-key')
DEBUG = os.environ.get('DEBUG', 'True') == 'True'
```

**`.env` file (never commit to git):**
```env
DJANGO_SECRET_KEY=my-actual-production-key-here
DEBUG=False
DATABASE_URL=postgresql://user:pass@localhost/finos
```

---

## 8. Functions — Complete Reference

### 8.1 `finos/views.py` — Core Server Views

#### `landing(request)` — Line 3
```python
def landing(request):
    return render(request, 'finos/landing.html')
```
| Property | Detail |
|----------|--------|
| **URL** | `GET /` |
| **Input** | `HttpRequest` — carries GET params, session data, user object |
| **Template** | `templates/finos/landing.html` (extends `base.html`) |
| **Template Variables** | None — static page, no context dict passed |
| **Return** | `HttpResponse` with Content-Type `text/html`, status 200 |
| **Features in Template** | Bloomberg-terminal grid background, hero title with gradient, 4-column stat strip, navigation cards for all FIN-OS modes, animated cursor |

#### `investor(request)` — Line 7
```python
def investor(request):
    return render(request, 'finos/investor.html')
```
| Property | Detail |
|----------|--------|
| **URL** | `GET /investor/` |
| **Template** | `templates/finos/investor.html` |
| **Purpose** | Investor-mode dashboard (long-term, wealth-building focus) |

#### `trader(request)` — Line 10
```python
def trader(request):
    return render(request, 'finos/trader.html')
```
| Property | Detail |
|----------|--------|
| **URL** | `GET /trader/` |
| **Template** | `templates/finos/trader.html` |
| **Purpose** | Trader-mode dashboard (technical analysis, intraday focus) |

#### `simulations(request)` — Line 13
```python
def simulations(request):
    return render(request, 'finos/simulations.html')
```
| Property | Detail |
|----------|--------|
| **URL** | `GET /simulations/` |
| **Template** | `templates/finos/simulations.html` |
| **Purpose** | Hub page linking to both investor and trader simulations |

#### `trader_simulations(request)` — Line 16
```python
def trader_simulations(request):
    return render(request, 'finos/trader_simulations.html')
```
| Property | Detail |
|----------|--------|
| **URL** | `GET /trader-simulations/` |
| **Template** | `templates/finos/trader_simulations.html` |
| **Purpose** | Trader-specific simulation scenarios |

#### `investor_simulations(request)` — Line 19
```python
def investor_simulations(request):
    return render(request, 'finos/investor_simulations.html')
```
| Property | Detail |
|----------|--------|
| **URL** | `GET /investor-simulations/` |
| **Template** | `templates/finos/investor_simulations.html` |
| **Purpose** | Investor-specific simulation scenarios (SIP calculator, etc.) |

---

### 8.2 `api/views.py` — Budget API Views

#### `get_budget_overview(request)` — Line 10
```python
@csrf_exempt
def get_budget_overview(request):
    ...
```

**Full logic breakdown:**

**POST path (line 13–23):**
```python
if request.method == 'POST':
    data = json.loads(request.body)     # Parse raw JSON bytes from request body
    Transaction.objects.create(         # Django ORM INSERT
        title=data['title'],
        amount=data['amount'],
        category=data['category']
    )
    return JsonResponse({"status": "success", "message": "Transaction logged."})
```

**GET path (line 26–57):**
```python
transactions = Transaction.objects.all().order_by('-date')  # SELECT * ORDER BY date DESC

data = []
total_spent = 0
leak_total = 0

for t in transactions:
    data.append({...})                           # Build response list
    total_spent += float(t.amount)               # Accumulate total
    if t.category in ['WANT', 'DEBT_BAD']:
        leak_total += float(t.amount)            # Accumulate "wealth leak"

health_score = 100
if total_spent > 0:
    leak_percentage = (leak_total / total_spent) * 100
    health_score -= leak_percentage              # Score = 100 - leak%

return JsonResponse({
    "metrics": {
        "total_spent": total_spent,
        "leak_total": leak_total,
        "health_score": round(health_score, 1)  # Round to 1 decimal
    },
    "transactions": data
})
```

**Health Score Formula:**
```
Health Score = 100 − (leak_total / total_spent × 100)

Where:
  leak_total = sum of WANT + DEBT_BAD transactions
  total_spent = sum of ALL transactions

A score of 100 = zero lifestyle spend + zero bad debt
A score of 0   = everything spent on wants and bad debt
```

| Decorator | `@csrf_exempt` |
|-----------|----------------|
| **Why needed** | React sends POST without Django CSRF cookies; exempt only this endpoint |
| **Risk** | CSRF attacks; mitigate by adding DRF Token Authentication in production |

---

#### `run_wealth_simulation(request)` — Line 65
```python
@api_view(['POST'])
def run_wealth_simulation(request):
    data = request.data
    current_wealth = data.get('current_wealth', 0)
    monthly_sip = data.get('monthly_sip', 0)
    years = 10

    np.random.seed(42)
    expected_return = 0.12
    volatility = 0.15

    paths = []
    for _ in range(3):
        paths.append([
            current_wealth * (1 + expected_return)**y + (monthly_sip * 12 * y)
            for y in range(1, years+1)
        ])

    return Response({
        "optimistic": paths[0],
        "expected": paths[1],
        "pessimistic": paths[2],
        "labels": [f"Year {i}" for i in range(1, years+1)]
    })
```

| Property | Detail |
|----------|--------|
| **Decorator** | `@api_view(['POST'])` — DRF; only accepts POST, returns 405 for GET |
| **`request.data`** | DRF automatically parses JSON body → Python dict (no `json.loads` needed) |
| **`np.random.seed(42)`** | Seeds RNG for reproducible output |
| **Formula** | `wealth × (1 + r)^year + (sip × 12 × year)` — simple compound growth + SIP accumulation |
| **Paths** | Currently all 3 paths use the same formula; TO-DO: add ±1 std dev for optimistic/pessimistic |
| **Return** | DRF `Response` — auto-serializes to JSON |

**Wealth Projection Formula Explained:**
```
Year-end wealth = C·(1+r)^y + SIP×12×y

Where:
  C   = current_wealth (initial lump sum)
  r   = 0.12 (12% annual expected return)
  y   = year number (1 to 10)
  SIP = monthly_sip × 12 × year (simplified linear accumulation)

Note: Real Monte Carlo would replace fixed r with random draws from N(0.12, 0.15²)
and run 10,000 paths to generate percentile bands.
```

---

#### `_holt_forecast(values, alpha=0.3, beta=0.1)` — Line 115
```python
def _holt_forecast(values: list, alpha: float = 0.3, beta: float = 0.1) -> float:
```

**Purpose:** Holt's Double Exponential Smoothing — a pure Python fallback for when statsmodels is unavailable or the history is too short (<6 months).

**Algorithm (iterative update):**
```
Initialize:
  level₀ = values[0]
  trend₀ = values[1] − values[0]

For each observation vₜ:
  prev_level = level
  level      = α·vₜ + (1−α)·(level + trend)   ← Smoothed level
  trend      = β·(level − prev_level) + (1−β)·trend   ← Smoothed trend

Forecast = level + trend   (one step ahead)
```

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `alpha` | 0.3 | Level smoothing factor (0=ignore new data, 1=use only latest) |
| `beta` | 0.1 | Trend smoothing factor (small = slow trend response) |

**Edge cases handled:**
```python
if not values: return 0.0       # Empty series → 0
if len(values) == 1: return float(values[0])  # Single point → use it
return max(0.0, level + trend)  # Clamp negative forecasts to 0 (spending can't be negative)
```

---

#### `_holt_winters_forecast(values)` — Line 134
```python
def _holt_winters_forecast(values: list) -> float:
```

**Purpose:** Triple Exponential Smoothing via statsmodels, with intelligent fallback chain.

**Decision tree:**
```
len(values) < 6?    →  Use _holt_forecast() directly
                    
statsmodels available?
  No                →  Use _holt_forecast()
  
len(values) >= 12?
  Yes               →  Holt-Winters Triple (trend + seasonal_periods=12)
  No (6–11 months)  →  Holt's Double (trend, no seasonality)

Model raises Exception?  →  _holt_forecast() fallback
```

**Why this matters for Indian financial patterns:**
Holt-Winters with `seasonal_periods=12` will automatically learn annual spending peaks:
- Diwali (October/November) → Shopping spike
- Tax filing season (March) → Investment spike
- School fees (June) → Education spike

With just 6–11 months, there's not enough data to estimate seasonal factors reliably, so Holt's Double (trend-only) is used instead.

---

#### `forecast_budget(request)` — Line 184
```python
@csrf_exempt
@api_view(['POST', 'GET'])
def forecast_budget(request):
```

**Full 5-step algorithm:**

**Step 1 — Parse inputs:**
```python
months_history  = int(body.get('months_history', 6))    # Default: 6 months lookback
upcoming_events = [e.lower() for e in body.get('upcoming_events', [])]  # Normalize to lowercase
```

**Step 2 — Fetch & bucket transactions by month+category:**
```python
cutoff = date.today() - timedelta(days=months_history * 31)
txns   = Transaction.objects.filter(date__gte=cutoff).order_by('date')

cat_monthly: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
for t in txns:
    if t.category in ('INVESTMENT',):     # Skip investments — not "spending"
        continue
    month_key = t.date.strftime('%Y-%m')  # e.g. "2026-07"
    cat_monthly[t.category][month_key] += float(t.amount)   # Sum by category+month
```

**Step 3 — Forecast per category:**
```python
for cat, monthly_totals in cat_monthly.items():
    series = [monthly_totals.get(m, 0.0) for m in months]  # Fill gaps with 0
    predicted = _holt_winters_forecast(series)               # ML forecast

    # Apply event multipliers
    for event in upcoming_events:
        for event_key, multipliers in _EVENT_MULTIPLIERS.items():
            if event_key in event or event in event_key:
                if cat in multipliers:
                    predicted *= multipliers[cat]             # e.g. ×1.8 for Shopping+Diwali
```

**Step 4 — Trend detection:**
```python
last_val = series[-1]
avg3     = sum(series[-3:]) / min(3, len(series))
pct_change = (last_val - avg3) / avg3

if pct_change > 0.10:   category_trends[cat] = "up"     # +10%+ vs 3-month avg
elif pct_change < -0.10: category_trends[cat] = "down"   # −10%+ vs 3-month avg
else:                    category_trends[cat] = "stable"
```

**Step 5 — Save recommendation:**
```python
# If events specified + risky category found:
"Lock ₹{lock_amt:,} in FD before {events_str} spending starts."

# If no events:
"Save ₹{save_amt:,} before the month starts — 20% buffer on predicted spend."
```

**`_EVENT_MULTIPLIERS` dictionary:**
```python
_EVENT_MULTIPLIERS = {
    "diwali":        {"Shopping": 1.8, "Entertainment": 1.5, "Food": 1.3, "Gifts": 2.5},
    "eid":           {"Shopping": 1.6, "Food": 1.4, "Gifts": 2.0},
    "christmas":     {"Shopping": 1.5, "Entertainment": 1.4, "Food": 1.3},
    "new year":      {"Entertainment": 1.6, "Food": 1.3, "Shopping": 1.3},
    "holi":          {"Food": 1.3, "Entertainment": 1.4, "Shopping": 1.2},
    "wedding":       {"Shopping": 2.0, "Food": 1.5, "Travel": 1.8},
    "vacation":      {"Travel": 2.5, "Entertainment": 1.6, "Food": 1.4},
    "tax filing":    {"Investment": 1.5},
    "car insurance": {"Insurance": 3.0, "Transport": 1.2},
    "home insurance":{"Insurance": 3.0},
    "school fees":   {"Education": 2.0},
    "medical":       {"Healthcare": 2.5},
}
```

**`_RISK_THRESHOLD_PCT = 0.20`:** A category is flagged as "risky" if its predicted spend is >20% above its 3-month average. This triggers the save recommendation.

---

#### `aa_webhook_sync(request)` — Line 329
```python
@api_view(['POST'])
def aa_webhook_sync(request):
    raw_data = request.data
    # Parse banking data, auto-categorize using NLP
    return Response({"status": "synced"})
```

| Property | Detail |
|----------|--------|
| **URL** | `POST /api/budget/aa-webhook/` (not in current `urls.py` — stub for future) |
| **Purpose** | Receive Account Aggregator data from Setu / Sahamati / RBI AA framework |
| **Status** | Stub — not yet wired to URL router or NLP categorization |
| **Planned** | Auto-categorize banking transactions (NEED/WANT/INVESTMENT) using NLP |

---

## 9. Django Concepts Used in FIN-OS (Basic → Advanced)

### 9.1 Basic Concepts

#### Django Project vs Django App
- **Project** (`core/`, `finos_backend/`) — configuration container; has `settings.py`, `urls.py`, `wsgi.py`
- **App** (`finos/`, `api/`) — a self-contained module with its own models, views, URLs. One project can have many apps.

```
finos 2/              ← Project
├── core/             ← Project config package
└── finos/            ← App
```

#### `manage.py`
The command-line tool for all Django operations:
```bash
python manage.py runserver          # Start dev server on port 8000
python manage.py migrate            # Apply pending migrations to database
python manage.py makemigrations     # Generate migration files from model changes
python manage.py createsuperuser    # Create admin panel login
python manage.py shell              # Django Python shell with ORM available
python manage.py collectstatic      # Gather static files for production
```

#### Django ORM — Object Relational Mapping
Instead of writing SQL, you write Python:
```python
# SQL:    SELECT * FROM api_transaction WHERE category='WANT' ORDER BY date DESC
# Django: Transaction.objects.filter(category='WANT').order_by('-date')

# SQL:    INSERT INTO api_transaction (title, amount, category) VALUES ('X', 100, 'WANT')
# Django: Transaction.objects.create(title='X', amount=100, category='WANT')
```

### 9.2 Intermediate Concepts

#### Migrations
When you change a model (add a field, rename a field, etc.), Django must update the database schema. Migrations track these changes:

```bash
# After editing models.py:
python manage.py makemigrations api   # Creates api/migrations/0002_*.py
python manage.py migrate              # Applies the migration to db.sqlite3
```

FIN-OS has one migration: `0001_initial.py` — creates the `api_transaction` table with columns `id`, `title`, `amount`, `category`, `date`.

#### `auto_now_add=True`
```python
date = models.DateField(auto_now_add=True)
```
Django automatically sets this field to today's date when a record is first created. You never need to pass `date` in `Transaction.objects.create(...)` — Django fills it for you.

#### Django's `choices` Parameter
```python
CATEGORY_CHOICES = [
    ('NEED', 'Need (Survival)'),
    ('WANT', 'Want (Lifestyle)'),
    ('INVESTMENT', 'Asset/Investment (Future)'),
    ('DEBT_GOOD', 'Good Debt (Leverage)'),
    ('DEBT_BAD', 'Bad Debt (Wealth Destroyer)'),
]
category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
```
- The database stores the **short code** (`'NEED'`, `'WANT'`, etc.)
- Django admin and forms display the **human-readable label** (`'Need (Survival)'`)
- Access the label in Python: `transaction.get_category_display()` → `'Need (Survival)'`

#### `defaultdict` (Python stdlib, used in `forecast_budget`)
```python
from collections import defaultdict
cat_monthly = defaultdict(lambda: defaultdict(float))
# Accessing a non-existent key auto-creates it:
cat_monthly['WANT']['2026-07'] += 450.0   # No KeyError even first time
```

### 9.3 Advanced Concepts

#### Middleware Stack
Django processes every request through a stack of middleware classes, in order:

```
Incoming Request →
  CorsMiddleware          ← Adds CORS headers; handles OPTIONS preflight
  SecurityMiddleware      ← HSTS, XSS protection headers
  SessionMiddleware       ← Reads/writes session cookie
  CommonMiddleware        ← URL normalization (trailing slash, etc.)
  CsrfViewMiddleware      ← Validates CSRF token on unsafe methods
  AuthenticationMiddleware ← Attaches request.user
  MessageMiddleware       ← One-time flash messages
  XFrameOptionsMiddleware ← X-Frame-Options: DENY header
→ View Function
← Response back through middleware in REVERSE order
```

#### `@csrf_exempt` Deep Dive
Django's CSRF protection works like this:
1. First page load → Django sets `csrftoken` cookie
2. React/JS reads cookie and sends it back as `X-CSRFToken` header on POST
3. `CsrfViewMiddleware` compares the token in header vs the one in session
4. If they don't match → 403 Forbidden

The React dev app at `localhost:5173` doesn't load pages from Django, so it never gets the CSRF cookie. `@csrf_exempt` bypasses the check entirely for that endpoint.

**Production fix:** Use DRF's `TokenAuthentication` or `SessionAuthentication` instead:
```python
# settings.py
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
    ],
}
```

#### Django Admin Registration
```python
# api/admin.py
from django.contrib import admin
from .models import Transaction

admin.site.register(Transaction)
```
One line registers the entire model — Django generates list view, detail view, add form, edit form, delete confirmation, and search/filter controls automatically from the model definition.

#### QuerySet Lazy Evaluation
```python
# This does NOT hit the database yet:
qs = Transaction.objects.filter(date__gte=cutoff).order_by('date')

# The database is hit here (when you iterate):
for t in qs:
    ...
```
This allows chaining multiple filters without extra database round-trips:
```python
qs = Transaction.objects.all()           # No DB hit
qs = qs.filter(category='WANT')          # Still no DB hit — adds WHERE clause
qs = qs.order_by('-date')               # Still no DB hit — adds ORDER BY
results = list(qs)                       # NOW the DB is hit — single optimized query
```

#### `DecimalField` for Money
```python
amount = models.DecimalField(max_digits=12, decimal_places=2)
```
Never use `FloatField` for money — floating point arithmetic has precision errors (₹0.1 + ₹0.2 = ₹0.30000000000000004). `DecimalField` uses Python's `decimal.Decimal` type, which is exact.

- `max_digits=12` → can store up to ₹9,999,999,999.99 (10 billion)
- `decimal_places=2` → stores paise (₹450.00, not ₹450.00000001)

#### WSGI vs ASGI
```python
# core/wsgi.py — synchronous; works with Gunicorn
WSGI_APPLICATION = 'core.wsgi.application'

# core/asgi.py — asynchronous; works with Daphne/Uvicorn for WebSockets
ASGI_APPLICATION = 'core.asgi.application'
```
FIN-OS currently uses WSGI (synchronous). For the planned WebSocket-based real-time alerts and AA webhook push, ASGI with Channels would be needed.

---

## 10. REST API Endpoint Reference

### Complete Endpoint Table

| Method | URL | View | Auth | Description |
|--------|-----|------|------|-------------|
| `GET` | `/` | `landing` | None | FIN-OS Command Center |
| `GET` | `/investor/` | `investor` | None | Investor Dashboard |
| `GET` | `/trader/` | `trader` | None | Trader Dashboard |
| `GET` | `/simulations/` | `simulations` | None | Simulations Hub |
| `GET` | `/investor-simulations/` | `investor_simulations` | None | Investor Simulations |
| `GET` | `/trader-simulations/` | `trader_simulations` | None | Trader Simulations |
| `GET/POST` | `/admin/` | Django Admin | Superuser | Admin panel |
| `GET` | `/api/budget/overview/` | `get_budget_overview` | None* | Budget dashboard + all transactions |
| `POST` | `/api/budget/overview/` | `get_budget_overview` | None* | Log new transaction |
| `POST` | `/api/budget/forecast/` | `forecast_budget` | None | AI budget forecast |
| `GET` | `/api/budget/forecast/` | `forecast_budget` | None | Forecast with default 6-month history |
| `POST` | `/api/budget/wealth-sim/` | `run_wealth_simulation` | None | Monte Carlo wealth projection |

*`@csrf_exempt` — CSRF not enforced; add auth for production

### Sample `curl` Commands

```bash
# Log a transaction
curl -X POST http://localhost:8000/api/budget/overview/ \
  -H "Content-Type: application/json" \
  -d '{"title": "Swiggy dinner", "amount": 450, "category": "WANT"}'

# Get budget overview
curl http://localhost:8000/api/budget/overview/

# Get forecast with Diwali adjustment
curl -X POST http://localhost:8000/api/budget/forecast/ \
  -H "Content-Type: application/json" \
  -d '{"months_history": 6, "upcoming_events": ["Diwali", "Car insurance"]}'

# Run wealth simulation
curl -X POST http://localhost:8000/api/budget/wealth-sim/ \
  -H "Content-Type: application/json" \
  -d '{"current_wealth": 500000, "monthly_sip": 10000}'
```

### Error Responses

| Scenario | Status | Body |
|----------|--------|------|
| Missing required JSON field | 400 | `{"status": "error", "message": "'title'"}` |
| Invalid JSON body | 400 | `{"status": "error", "message": "JSON parse error"}` |
| Method not allowed (DRF) | 405 | `{"detail": "Method \"GET\" not allowed."}` |
| Server error | 500 | Django debug page (dev) or 500 page (prod) |

---

## 11. Database Schema

### Table: `api_transaction`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Auto-generated unique ID |
| `title` | `VARCHAR(100)` | `NOT NULL` | What was purchased |
| `amount` | `DECIMAL(12,2)` | `NOT NULL` | Amount in Indian Rupees |
| `category` | `VARCHAR(20)` | `NOT NULL`, `choices` enforced | NEED / WANT / INVESTMENT / DEBT_GOOD / DEBT_BAD |
| `date` | `DATE` | `NOT NULL`, `auto_now_add=True` | Auto-set to today on insert |

**Django ORM to SQL mapping:**
```sql
-- Transaction.objects.create(title='X', amount=450, category='WANT')
INSERT INTO api_transaction (title, amount, category, date)
VALUES ('X', 450.00, 'WANT', '2026-07-15');

-- Transaction.objects.all().order_by('-date')
SELECT id, title, amount, category, date
FROM api_transaction
ORDER BY date DESC;

-- Transaction.objects.filter(date__gte='2026-01-15').order_by('date')
SELECT id, title, amount, category, date
FROM api_transaction
WHERE date >= '2026-01-15'
ORDER BY date ASC;
```

**Migration file (`0001_initial.py`) — what Django generated:**
```python
migrations.CreateModel(
    name='Transaction',
    fields=[
        ('id', models.BigAutoField(auto_created=True, primary_key=True)),
        ('title', models.CharField(help_text='What did you buy?', max_length=100)),
        ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
        ('category', models.CharField(choices=[...], max_length=20)),
        ('date', models.DateField(auto_now_add=True)),
    ],
)
```

---

## 12. Settings Reference

### `finos 2/core/settings.py` — Annotated

```python
SECRET_KEY = 'django-insecure-...'   # ← MUST rotate before production
DEBUG = True                          # ← Set False in production

INSTALLED_APPS = [
    'finos',                          # Our FIN-OS app (views, urls, templates)
    'django.contrib.admin',           # /admin/ panel
    'django.contrib.auth',            # User model, login/logout
    'django.contrib.contenttypes',    # Generic relations
    'django.contrib.sessions',        # Session framework
    'django.contrib.messages',        # Flash messages
    'django.contrib.staticfiles',     # Static file serving
]

ROOT_URLCONF = 'core.urls'            # Django reads core/urls.py for all requests

TEMPLATES = [{
    'DIRS': [BASE_DIR / 'templates'], # Tell Django where to find templates
    'APP_DIRS': True,                 # Also look in each app's templates/ subdirectory
}]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',   # SQLite file path
    }
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'                     # ← Change to 'Asia/Kolkata' for IST
USE_TZ = True                         # Store datetimes as UTC in DB

STATIC_URL = 'static/'               # URL prefix for static files
```

### `finos_backend/settings.py` — Additional Settings

```python
# DRF and CORS extensions
INSTALLED_APPS = [
    ...
    'rest_framework',    # Enables @api_view, Response, DRF browsable API
    'corsheaders',       # Enables CORS headers middleware
    'api',               # Our budget API app
]

# CORS middleware must be first
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # ← FIRST
    ...
]

# Only allow the React dev server to call our API
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'  # IDs are 64-bit integers
```

**Production settings to add:**
```python
DEBUG = False
ALLOWED_HOSTS = ['api.finos.in', 'www.finos.in']
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
CORS_ALLOWED_ORIGINS = ['https://app.finos.in']  # No localhost in prod
```

---

## 13. Middleware Pipeline

### How Django Middleware Works (Advanced)

Each middleware class implements `__init__` and `__call__` (or `process_request` / `process_response`):

```python
class CorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response      # The next middleware or view

    def __call__(self, request):
        # Pre-view processing:
        if request.method == 'OPTIONS':       # Preflight request
            response = HttpResponse()
            response['Access-Control-Allow-Origin'] = 'http://localhost:5173'
            return response                   # Short-circuit — don't call view

        response = self.get_response(request) # Call the next middleware/view

        # Post-view processing:
        response['Access-Control-Allow-Origin'] = 'http://localhost:5173'
        return response
```

### FIN-OS Middleware Order and Purpose

```
finos_backend/settings.py MIDDLEWARE list:

1. corsheaders.middleware.CorsMiddleware
   → Handles CORS preflight OPTIONS requests
   → Adds Access-Control-* headers to all responses
   → MUST be first — preflight must return before CommonMiddleware redirects it

2. django.middleware.security.SecurityMiddleware
   → Adds X-Content-Type-Options: nosniff
   → Adds X-XSS-Protection header  
   → Enforces HTTPS via SECURE_SSL_REDIRECT (when enabled)
   → HSTS header (Strict-Transport-Security)

3. django.contrib.sessions.middleware.SessionMiddleware
   → Reads sessionid cookie
   → Populates request.session (dict-like object)
   → Saves session data to DB after view runs

4. django.middleware.common.CommonMiddleware
   → Normalizes URL paths (adds/removes trailing slash)
   → Sends 301 redirect for APPEND_SLASH behavior

5. django.middleware.csrf.CsrfViewMiddleware
   → Validates X-CSRFToken header on POST/PUT/PATCH/DELETE
   → Bypassed for endpoints with @csrf_exempt

6. django.contrib.auth.middleware.AuthenticationMiddleware
   → Attaches request.user (AnonymousUser or logged-in User object)
   → Reads session to determine if user is authenticated

7. django.contrib.messages.middleware.MessageMiddleware
   → Enables one-time "flash" messages (success/error notifications)
   → Used in Django admin after create/update/delete actions

8. django.middleware.clickjacking.XFrameOptionsMiddleware
   → Adds X-Frame-Options: DENY to all responses
   → Prevents FIN-OS pages from being embedded in iframes (clickjacking defense)
```

---

## 14. URL Routing Architecture

### How Django Resolves a URL

When a request arrives for `/api/budget/forecast/`:

```
1. Django reads ROOT_URLCONF = 'finos_backend.urls'
2. Checks each pattern in finos_backend/urls.py:
   - path('admin/', ...) → no match
   - path('api/budget/', include('api.urls')) → 'api/budget/' matches prefix!
3. Strips 'api/budget/' prefix, passes remaining 'forecast/' to api/urls.py
4. Checks each pattern in api/urls.py:
   - path('overview/', ...) → no match
   - path('forecast/', views.forecast_budget, ...) → match!
5. Calls forecast_budget(request)
```

### URL Pattern Syntax

```python
# Exact string match:
path('investor/', views.investor, name='investor')
# Matches: /investor/
# Does NOT match: /investor/anything/ or /Investor/

# Path converter (captures a value):
path('transaction/<int:pk>/', views.transaction_detail, name='transaction-detail')
# Matches: /transaction/42/
# Passes pk=42 to transaction_detail(request, pk=42)

# Include (delegates to another urlconf):
path('api/budget/', include('api.urls'))
# Strips 'api/budget/' from URL and passes remainder to api.urls
```

### Named URL Reversal

```python
# In Python (views.py):
from django.urls import reverse
url = reverse('finos:landing')          # → '/'
url = reverse('budget-forecast')        # → '/api/budget/forecast/'

# In templates:
{% url 'finos:landing' %}               # → '/'
{% url 'finos:investor' %}              # → '/investor/'
```

---

## 15. Deployment Checklist

### Development (Current State)

```bash
# Project 1: FIN-OS Core Server
cd "Initial Deployment/finos 2"
python manage.py runserver              # → http://localhost:8000

# Project 2: Expense Tracker Backend
cd "Initial Deployment/ExpenseTracker/finos_backend"
python manage.py migrate                # Creates db.sqlite3 and Transaction table
python manage.py runserver 8001         # → http://localhost:8001 (different port)
```

### Pre-Production Checklist

- [ ] `SECRET_KEY` rotated (generate with `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`)
- [ ] `DEBUG = False`
- [ ] `ALLOWED_HOSTS` set to your domain
- [ ] `CORS_ALLOWED_ORIGINS` updated to production frontend URL
- [ ] `SECURE_SSL_REDIRECT = True` (requires HTTPS)
- [ ] `SESSION_COOKIE_SECURE = True`
- [ ] `CSRF_COOKIE_SECURE = True`
- [ ] Database switched from SQLite to PostgreSQL
- [ ] Static files collected (`python manage.py collectstatic`)
- [ ] `@csrf_exempt` removed; DRF `TokenAuthentication` added
- [ ] `TIME_ZONE = 'Asia/Kolkata'` (for correct IST date handling)
- [ ] Gunicorn installed and configured
- [ ] `LOGGING` configured (send errors to Sentry or Supabase logs)

### Running with Gunicorn (Production)

```bash
pip install gunicorn

# Project 1
gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers 4

# Project 2
gunicorn finos_backend.wsgi:application --bind 0.0.0.0:8001 --workers 4
```

### Docker (existing `docker-compose.yml`)

The project root has `docker-compose.yml`. Add Django services:

```yaml
services:
  finos-core:
    build: ./finos 2
    command: gunicorn core.wsgi:application --bind 0.0.0.0:8000
    ports: ["8000:8000"]

  finos-budget-api:
    build: ./ExpenseTracker/finos_backend
    command: gunicorn finos_backend.wsgi:application --bind 0.0.0.0:8001
    ports: ["8001:8001"]
    environment:
      - DEBUG=False
      - DJANGO_SECRET_KEY=${DJANGO_SECRET_KEY}
```

---

## Appendix: Quick Reference Card

### Django ORM Cheat Sheet for FIN-OS

```python
from api.models import Transaction

# CREATE
t = Transaction.objects.create(title="EMI", amount=5000, category="DEBT_GOOD")

# READ
all_txns  = Transaction.objects.all()
wants     = Transaction.objects.filter(category="WANT")
recent    = Transaction.objects.order_by('-date')[:10]   # Latest 10
by_id     = Transaction.objects.get(pk=42)               # Single record
count     = Transaction.objects.filter(category="NEED").count()

# UPDATE
Transaction.objects.filter(pk=42).update(amount=6000)
t.amount = 6000; t.save()   # Or update instance directly

# DELETE
Transaction.objects.filter(category="DEBT_BAD").delete()
t.delete()   # Delete single instance

# AGGREGATE
from django.db.models import Sum, Avg, Count
Transaction.objects.filter(category="WANT").aggregate(total=Sum('amount'))
# → {'total': Decimal('12450.00')}
```

### Django Command Reference

```bash
python manage.py runserver              # Start dev server
python manage.py runserver 8001         # Start on port 8001
python manage.py migrate                # Apply all pending migrations
python manage.py makemigrations api     # Generate migration for 'api' app
python manage.py createsuperuser        # Create admin user
python manage.py shell                  # Interactive Django Python shell
python manage.py collectstatic          # Copy static files to STATIC_ROOT
python manage.py check                  # Check for configuration errors
python manage.py test api               # Run tests in 'api' app
python manage.py dbshell                # Open SQLite CLI
python manage.py showmigrations         # Show applied/unapplied migrations
```

---

*Last updated: July 15, 2026 | Author: Vikas Manjunath | FIN-OS Financial OS*
