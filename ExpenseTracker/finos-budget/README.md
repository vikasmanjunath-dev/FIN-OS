# finos-budget — FIN-OS Budget & Expense Tracker

> React 19 + Vite 8 + Tailwind CSS v4  
> **Version:** 1.0 | **Updated:** July 14, 2026

A modern, feature-rich budget and expense tracking app built for Indian personal finance. Part of the FIN-OS platform.

---

## Features

- **Budget Intelligence Dashboard** — KPI overview, spending patterns, income vs expense tracking
- **AI War Room** — AI-powered spending analysis and actionable insights
- **FIRE Calculator** — Financial Independence / Retire Early corpus projector
- **Debt Destroyer** — Debt payoff planner (snowball/avalanche)
- **Goals** — Goal-based savings tracker with progress visualization
- **Flow Map** — Money flow visualisation (income sources → expense categories)
- **Wealth Interface** — Net worth tracker and wealth-building view
- **Subscription Manager** — Track recurring subscriptions and SaaS spends
- **Reports** — Monthly/annual spending reports with charts
- **Arya Panel** — Embedded Arya AI financial coach
- **UPI Scanner** — UPI QR code scanner for quick expense entry
- **Achievements** — Gamified financial habit badges

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v4 |
| Charts | Chart.js + react-chartjs-2, Recharts |
| Animations | Framer Motion |
| Icons | Lucide React |
| Notifications | Sonner |

---

## Setup

```bash
cd "Initial Deployment/ExpenseTracker/finos-budget"
npm install
npm run dev       # Development server → http://localhost:5173
npm run build     # Production build → dist/
npm run preview   # Preview production build
```

---

## Project Structure

```
src/
├── pages/
│   ├── BudgetIntelligenceDashboard.jsx  ← Main dashboard
│   ├── AIWarRoom.jsx                    ← AI spending analysis
│   ├── FIRECalculator.jsx               ← FIRE corpus calculator
│   ├── DebtDestroyer.jsx                ← Debt payoff planner
│   ├── Goals.jsx                        ← Goal tracker
│   ├── FlowMap.jsx                      ← Money flow visualisation
│   ├── WealthInterface.jsx              ← Net worth view
│   ├── SubscriptionManager.jsx          ← Subscription tracker
│   ├── ReportsPage.jsx                  ← Spending reports
│   ├── SettingsPage.jsx                 ← App settings
│   └── AchievementsPage.jsx             ← Gamified badges
│
└── components/
    ├── Sidebar.jsx          ← Main navigation
    ├── TopBar.jsx           ← Header bar
    ├── AryaPanel.jsx        ← Arya AI embedded panel
    ├── ScanUPI.jsx          ← UPI QR scanner
    ├── CurrencyDisplay.jsx  ← ₹ formatting
    ├── ParticleField.jsx    ← Animated background
    ├── ConfettiEffect.jsx   ← Achievement celebration
    ├── NotificationBadge.jsx
    └── PageTransition.jsx
```

---

## Optional Django Backend

A Django REST Framework backend is available at `ExpenseTracker/finos_backend/` for persistent server-side storage (SQLite). This is optional — the app functions fully client-side with localStorage.

```bash
cd "Initial Deployment/ExpenseTracker/finos_backend"
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
# API: http://localhost:8000
```
