# FIN-OS HTML Pages

> Version: 1.5 | Date: September 15, 2026  
> Total: **117 pages** in this folder + `index.html` + `login.html` = **119 pages**

---

## Page Index

### Core App
| File | Purpose |
|---|---|
| `home.html` | App hub — navigation center |
| `dashboard.html` | Main user control panel (KPI row, Arya, Portfolio access) |
| `profile.html` | User profile and settings |
| `settings.html` | App settings, theme, notifications, account |
| `onboarding.html` | 6-step first-time setup wizard |

### Finance Tracking
| File | Purpose |
|---|---|
| `track-finances.html` | Complete money tracking hub — launcher for the 28-tool Command Hub suite below |
| `portfolio.html` | Investment portfolio |
| `budget-forecast.html` | AI budget forecasting |
| `know-your-finances.html` | Deep financial self-assessment |
| `financial-report.html` | Comprehensive financial report |
| `diagnostics.html` | Financial health diagnostics |
| `tracker.html` | Expense tracker |

### Track Finances Suite — Command Hub Trackers (23)
Stateful tools (localStorage-backed, feed Arya AI context) launched from `track-finances.html`. Distinct from the stateless calculators below — each has a "related tool" cross-link where a calculator covers overlapping ground. Also indexed in `js/finos-search.js` under the "Trackers" category.

| File | Purpose |
|---|---|
| `credit-score.html` | CIBIL score gauge, improvement tips, loan-rate impact |
| `crypto-tracker.html` | Crypto cost basis, P&L, India 30% tax + 1% TDS |
| `debt-optimizer.html` | Avalanche vs Snowball payoff strategy |
| `emergency-fund.html` | Months-covered progress, build-up scenarios |
| `epf-tracker.html` | EPF contribution breakdown, EPS pension estimate |
| `fd-tracker.html` | FD/RD/PPF/NSC/SCSS/Sukanya/Bond maturity calendar |
| `financial-calendar.html` | Unified calendar of every SIP/FD/insurance/goal/tax date |
| `financial-hub.html` | Gateway to every financial tool on FIN-OS |
| `goal-optimizer.html` | Priority score + SIP plan across all life goals |
| `gold-tracker.html` | Physical gold, SGB, Gold ETF/MF tracking |
| `home-loan.html` | Amortisation schedule, Sec 24(b)/80C, PMAY, prepayment |
| `itr-summary.html` | Auto-filled ITR prep — deductions, TDS, regime comparison |
| `life-cover.html` | HLV + income-replacement life insurance sizing |
| `net-worth.html` | Unified balance sheet, FIRE progress, growth timeline |
| `nps-tracker.html` | NPS Tier 1/2 corpus and retirement annuity projection |
| `passive-income.html` | Dividend/FD/rental/SWP income, freedom coverage ratio |
| `portfolio-rebalancer.html` | Drift detection + buy/sell/hold action plan |
| `ppf-tracker.html` | PPF/SSY/NSC/SCSS/KVP maturity + 80C summary |
| `retirement-planner.html` | Aggregates EPF/NPS/PPF/SIP into required-corpus model |
| `salary-optimizer.html` | CTC breakup, HRA exemption, regime comparison |
| `sip-stepup.html` | Step-up SIP vs flat SIP corpus comparison |
| `tax-harvest.html` | LTCG/STCG loss/gain harvesting optimiser |
| `windfall.html` | 7-step priority waterfall for bonus/RSU/inheritance |

### Markets & Intelligence
| File | Purpose |
|---|---|
| `markets.html` | Market overview |
| `market-intel.html` | Market intelligence hub |
| `market-visualizer.html` | Market data visualisations |
| `news.html` | Financial news feed |
| `stock-platform.html` | Stock research platform |
| `mf-intelligence.html` | Mutual fund intelligence |
| `options-intelligence.html` | Options trading tools |
| `quantedge.html` | Quantitative analysis |

### Education Modules (14)
| File | Topic |
|---|---|
| `finance101.html` | Core financial literacy |
| `learn-equity.html` | Stocks and indices |
| `learn-mf.html` | Mutual funds |
| `learn-fno.html` | Futures & Options |
| `learn-insurance.html` | Insurance types |
| `learn-debt.html` | Fixed income |
| `learn-etf.html` | ETFs |
| `learn-commodity.html` | Commodities |
| `learn-crypto.html` | Cryptocurrency |
| `learn-forex.html` | Forex markets |
| `learn-analysis.html` | Fundamental analysis |
| `learn-technical.html` | Technical analysis |
| `learn-indicators.html` | Market indicators |
| `learn-fundamental.html` | Financial statements |
| `learn-metrics.html` | Valuation metrics |
| `learn-money-market.html` | Money markets |

### Planning & Goals
| File | Purpose |
|---|---|
| `life-goals-planner.html` | AI-powered life goals |
| `life-wealth.html` | Life and wealth integration |
| `financial-being.html` | Financial wellbeing |
| `roadmap.html` | Interactive 3-view financial roadmap (rebuilt June 14 2026): **Roadmap** (DNA-themed step cards with Unsplash images), **Mind Map** (pan/zoom SVG), **Life Journey** (drag-scroll timeline) — powered by `arya-roadmap.js` |
| `roadmaps.html` | Roadmap selector |
| `traditional-roadmap.html` | Conservative path |
| `trader-roadmap.html` | Trading path |
| `fear-roadmap.html` | Overcoming fear roadmap |
| `timeline.html` | Financial timeline |
| `scenarios.html` | What-if scenario modelling |
| `impact.html` | Financial impact analysis |
| `impact-detail.html` | Deep impact detail |

### AI & Simulation
| File | Purpose |
|---|---|
| `money-ai.html` | AI money coach |
| `chat.html` | Text chat interface |
| `ca-advisor.html` | CA / tax advisor AI |
| `document-ai.html` | Document analysis AI |
| `trading-coach.html` | Trading psychology AI |
| `mindset-sim.html` | Mindset simulator |
| `mindset-sim-hub.html` | Simulation hub |
| `simulator.html` | → redirects to trading-simulator.html |
| `simulator-landing.html` | Simulator entry page |
| `simulator-guide.html` | Simulation guide |
| `trading-simulator.html` | Paper trading simulator |
| `train-mindset.html` | Mindset training |

### Insight Deep-Dives
Reachable only via dynamically-injected personalization/insight cards (`js/finos-personalization.js`, `js/insight-cards.js`) on dashboard/home — no static nav links to these by design.

| File | Purpose |
|---|---|
| `insight-inflation.html` | Inflation impact |
| `insight-sip.html` | SIP power |
| `insight-debt.html` | Debt trap analysis |
| `insight-emi.html` | EMI true cost |
| `insight-rbi.html` | RBI policy impact |

### Detail Pages (asset-specific)
| File | Asset class |
|---|---|
| `equitydetail.html` | Equity deep dive |
| `mfdetail.html` | Mutual fund detail |
| `debtdetail.html` | Debt / fixed income |
| `etfdetail.html` | ETF detail |
| `cryptodetail.html` | Crypto detail |
| `commoditydetail.html` | Commodity detail |
| `forexdetail.html` | Forex detail |
| `fnodetail.html` | Derivatives (F&O) detail |
| `moneydetail.html` | Money market detail |

### Tools & Special
| File | Purpose |
|---|---|
| `calculators.html` | Calculator grid (all 88 tools) |
| `tools.html` | Tools directory |
| `insurance-directory.html` | Insurance directory |
| `insurance-hub.html` | Insurance intelligence hub |
| `couple-finance.html` | Couple financial planning |
| `real-estate.html` | Real estate tools |
| `hedgefund.html` | Hedge fund education |
| `foundations.html` | Financial foundations |
| `principles.html` | Investing principles |
| `clarity.html` | Financial clarity module |
| `decision.html` | Decision support tool |
| `dna.html` | Financial DNA assessment |
| `benchmarking.html` | Peer benchmarking |
| `system-leak.html` | Wealth leak detector |
| `not-money.html` | → redirects to mindset-sim.html |
| `tax.html` | Tax planning hub |

---

## Required Head Template (for all pages)

```html
<head>
  <!-- 1. Anti-FOUC IIFE — MUST be first, before any <link> -->
  <script>
    (function(){
      var t=localStorage.getItem('finos-theme')||localStorage.getItem('theme')||'dark';
      document.documentElement.setAttribute('data-theme',t);
    })();
  </script>

  <!-- 2. Meta tags -->
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- 3. CSS in this order -->
  <link rel="stylesheet" href="../css/design-tokens.css">
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/layout.css">
  <link rel="stylesheet" href="../css/components.css">
  <link rel="stylesheet" href="../css/theme.css">
  <link rel="stylesheet" href="../css/interactions.css">
  <link rel="stylesheet" href="../css/[page].css">
</head>
```

---

## File Counts Summary

| Location | Count |
|---|---|
| `html/*.html` | 117 |
| `index.html` | 1 |
| `login.html` | 1 |
| **Total HTML pages** | **119** |
| `calculators/*/*.html` (stateless, 9 categories) | 88 |
| Command Hub trackers (stateful, within `html/`) | 23 |

Also see [markets.html](markets.html) → **Quantum Stock Engine** card and [tools.html](tools.html) Master-stage tools for `stock-platform.html` (1,163-line NSE/BSE research platform — has no dedicated readme entry above since it isn't a distinct top-level category; it lives under Markets & Intelligence).
