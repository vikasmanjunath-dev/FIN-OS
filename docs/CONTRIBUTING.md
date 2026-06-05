# FIN-OS — Contributing Guide

> Version: 1.2 | Date: June 5, 2026

---

## File Naming Conventions

| Type | Convention | Example |
|---|---|---|
| HTML pages | kebab-case | `learn-equity.html` |
| CSS files | kebab-case | `learn-equity.css` |
| JS modules | kebab-case | `learn-equity.js` |
| Calculator files | short lowercase noun | `sip.html`, `ppf.html` |
| React components | PascalCase | `DebtDestroyer.jsx` |
| Python modules | snake_case | `alert_engine.py` |
| Calc category folders | all lowercase | `investment & wealth/` |

---

## Adding a New HTML Page

### Step 1 — Create files

```
html/your-page.html
css/your-page.css        (if page-specific styles needed)
js/your-page.js          (if page-specific logic needed)
```

### Step 2 — HTML boilerplate (required head order)

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <!-- ANTI-FOUC: MUST be first in <head>, before any <link> tag -->
  <script>
    (function(){
      var t=localStorage.getItem('finos-theme')||localStorage.getItem('theme')||'dark';
      document.documentElement.setAttribute('data-theme',t);
    })();
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your Page — FIN•OS</title>
  <link rel="stylesheet" href="../css/design-tokens.css">
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/layout.css">
  <link rel="stylesheet" href="../css/components.css">
  <link rel="stylesheet" href="../css/theme.css">
  <link rel="stylesheet" href="../css/interactions.css">
  <link rel="stylesheet" href="../css/your-page.css">
</head>
<body>
  <aside class="sidebar" id="sidebar"></aside>
  <main class="main"><!-- content --></main>
  <script src="../js/ui.js" defer></script>
  <script src="../js/guard.js" defer></script>
  <script src="../js/interactions.js" defer></script>
  <script src="../js/finos-personalization.js" defer></script>
  <script src="../js/your-page.js" defer></script>
  <script src="../js/finos-widget.js?v=5" defer></script>
</body>
</html>
```

### Step 3 — New page checklist

- [ ] Anti-FOUC IIFE is the **first child of `<head>`** (before any `<link>`)
- [ ] `design-tokens.css` linked before page CSS
- [ ] `interactions.css` and `theme.css` linked
- [ ] `ui.js` included (drives theme toggle)
- [ ] `interactions.js` included
- [ ] `guard.js` included (if auth required)
- [ ] `finos-widget.js?v=N` included (AI overlay)
- [ ] No hardcoded hex colours in inline `<style>` blocks (use `var(--token)`)
- [ ] No `rgba(255,255,255,.0x)` surfaces (use `var(--bg-surface)`)
- [ ] Theme toggle present on page

---

## Adding a New Calculator

### Step 1 — Choose a category folder

```
calculators/
  banking & fixed income/      (10 tools)
  core-thinking/               (10 tools)
  desi reality check/          (10 tools)
  financial health/             (6 tools)
  investment & wealth/         (16 tools)
  loans, debt & emi/           (11 tools)
  retirement & life planning/   (7 tools)
  tax & salary/                (10 tools)
  trading & markets/            (8 tools)
```

### Step 2 — Create the file

```bash
touch "calculators/investment & wealth/gold.html"
```

### Step 3 — Calculator boilerplate

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <script>
    (function(){
      var t=localStorage.getItem('finos-theme')||'dark';
      document.documentElement.setAttribute('data-theme',t);
    })();
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gold Return Calculator — FIN•OS</title>
  <link rel="stylesheet" href="../../css/design-tokens.css">
  <link rel="stylesheet" href="../../css/base.css">
  <link rel="stylesheet" href="../../css/theme.css">
  <link rel="stylesheet" href="calculator-base.css">
</head>
<body class="calc-page">
  <div class="calc-container">
    <header class="calc-header">
      <a href="../../html/calculators.html" class="back-btn">← Calculators</a>
      <h1>Gold Return Calculator</h1>
    </header>
    <main class="calc-body">
      <form id="calcForm">
        <label>Investment Amount (INR)
          <input type="number" id="amount" value="100000" min="1000">
        </label>
        <label>Years
          <input type="number" id="years" value="10" min="1" max="40">
        </label>
        <button type="submit" class="primary-btn">Calculate</button>
      </form>
      <div class="calc-result" id="result"></div>
    </main>
  </div>
  <script src="calculator-base.js"></script>
  <script>
    document.getElementById('calcForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const amount = +document.getElementById('amount').value;
      const years  = +document.getElementById('years').value;
      const CAGR   = 0.089; // 8.9% historical gold CAGR in INR
      const future = amount * Math.pow(1 + CAGR, years);
      document.getElementById('result').innerHTML =
        '<p>Future value: <strong>INR ' + future.toLocaleString('en-IN', {maximumFractionDigits:0}) + '</strong></p>';
    });
  </script>
</body>
</html>
```

### Step 4 — Register in `js/calculators.js`

```javascript
{
  id: "investment",
  title: "Investment & Wealth",
  folder: "calculators/investment & wealth",
  calculators: [
    // ... existing entries ...
    { name: "Gold Return Calculator", file: "gold.html" }, // add here
  ]
}
```

**Important:** The `file` value must exactly match the filename on disk (case-sensitive on Linux/Vercel).

---

## CSS Variables Reference

Always use design tokens from `css/design-tokens.css` — never hardcode colours:

```css
/* Backgrounds */
var(--bg-main)          /* page background */
var(--bg-surface)       /* card / panel background */
var(--bg-glass)         /* frosted glass surface */

/* Text */
var(--text-primary)     /* main text */
var(--text-secondary)   /* secondary text */
var(--text-muted)       /* very faint text */

/* Accent */
var(--accent)           /* brand blue #4F7CFF */
var(--accent-secondary) /* lime #C7F000 */
var(--accent-soft)      /* accent with opacity */

/* Semantic */
var(--color-success)    var(--color-error)    var(--color-warning)

/* Borders */
var(--border-soft)      var(--border-medium)  var(--border-hard)

/* Shadows */
var(--card-shadow)      var(--card-shadow-hover)

/* Spacing (8-point scale) */
var(--space-1)  4px     var(--space-2)  8px
var(--space-4)  16px    var(--space-6)  24px    var(--space-8)  32px
```

---

## Hover System Rules

All hover effects must use the zero-fill vocabulary from `css/interactions.css`.

**Allowed on hover:** `transform`, `border-color`, `box-shadow`, `opacity`, `color`, `filter`  
**NOT allowed on hover:** `background` fill changes

If you must handle hover in JS, use `data-hover` attributes:
```javascript
// WRONG
el.addEventListener('mouseover', () => { el.style.background = 'rgba(...)'; });

// RIGHT — data-hover attribute; CSS interactions.css handles the effect
el.dataset.hover = 'lift';   // or 'glow' or 'bright'
```

Available `data-hover` values: `lift` (cards) · `glow` (panels) · `bright` (links/text)

---

## Adding a New Alert Rule

Open `alerts/rules.py` and add:

```python
class GoldAllocationRule(AlertRule):
    id       = "gold_allocation"
    cooldown = timedelta(days=30)

    async def check(self, user: dict, profile: dict):
        holdings = user.get("holdings", [])
        gold  = sum(h["current_value"] for h in holdings if h.get("asset_type") == "gold")
        total = sum(h["current_value"] for h in holdings)
        if total > 0 and gold / total > 0.20:
            return Alert(
                rule_id=self.id,
                title="Gold allocation high",
                message="Your gold allocation exceeds 20%. Consider rebalancing into equity index funds.",
                priority="warning",
            )
        return None
```

Register in `alert-engine.py`:
```python
RULES = [
    SIPMissedRule(),
    # ... existing rules ...
    GoldAllocationRule(),  # add here
]
```

---

## Adding a Voice Intent

In `voiceagent/agent.py`, add to `Brain._INTENT_RULES`:

```python
{
    "id": "sgb_gold",
    "pattern": re.compile(r"\b(gold|SGB|sovereign gold bond|gold etf)\b", re.I),
    "facts": (
        "SGB (Sovereign Gold Bond) gives 2.5% annual interest + gold price appreciation. "
        "Tax-free at maturity (8-year lock-in). Better than physical gold (no making charges) "
        "and better than Gold ETF (extra 2.5% yield)."
    )
},
```

---

## JavaScript Module Pattern

```javascript
(function () {
  'use strict';

  function init() {
    // page setup
  }

  window.YourModuleName = { init };
  init();
})();
```

---

## Commit Message Format

```
feat:     add gold return calculator
fix:      calculator 404 on Vercel (lowercase folder names)
refactor: tighten family profile patterns in voice agent
docs:     update ARCHITECTURE.md for hover system
style:    replace fill hovers with glow effects (40 CSS files)
chore:    bump finos-widget.js to v5
```

Types: `feat` `fix` `refactor` `docs` `style` `test` `chore`

---

## Before Every Push

- [ ] No hardcoded `localhost` URLs in HTML/JS deployed to Vercel
- [ ] Calculator folder names all lowercase (will 404 on Linux/Vercel)
- [ ] Calculator filenames match exactly what is registered in `js/calculators.js`
- [ ] No `SUPABASE_SERVICE_KEY` in any browser-visible file
- [ ] New `.env` variables have an entry in `.env.example`
- [ ] `finos-widget.js?v=N` bumped if the widget changed
- [ ] No `rgba(255,255,255,.0x)` surfaces in new `<style>` blocks
- [ ] Anti-FOUC IIFE present as first `<head>` child on any new pages
- [ ] Theme toggle present on all new pages

---

## Folder Structure Reference

```
Initial Deployment/
├── index.html               Public landing page
├── login.html               Auth page (no guard)
├── manifest.json            PWA manifest
├── sw.js                    Service worker
├── app.py                   News Intel API (Flask :5000)
├── html/                    94 app pages
├── css/                     45 stylesheets
│   ├── design-tokens.css    133 CSS variables (single source of truth)
│   ├── interactions.css     Hover system (zero-fill vocabulary)
│   ├── theme.css            Light/dark overrides (360 rules)
│   ├── base.css             Reset + typography + focus rings
│   ├── layout.css           Sidebar + mobile nav
│   ├── components.css       Shared UI components
│   └── [page].css           38 per-page stylesheets
├── js/                      88 JS modules
│   ├── theme-init.js        Anti-FOUC theme applier
│   ├── interactions.js      Hover override engine
│   ├── ui.js                Theme toggle + animation
│   ├── finos-widget.js      AI overlay (every page)
│   └── [page].js            84 per-page modules
├── calculators/             88 standalone calculators (9 categories)
├── voiceagent/              Voice AI (local Python, :8765)
├── alerts/                  Alert Engine (FastAPI :8001)
├── chatbot/                 Chatbot (Python :8000)
├── market intelligence/     Trade signals (Flask)
├── stock-engine/            Stock data (FastAPI, 6 services)
├── stock-dashboard/         Stock research UI (Flask :5001)
├── ExpenseTracker/
│   ├── finos-budget/        React + Vite budget app (11 pages)
│   └── finos_backend/       Django REST API
├── TradeJournal/            Trade journal + Supabase sync
├── News1/                   TypeScript/Vite news aggregator
├── Porfolio Analyser/       Portfolio analysis tool
└── docs/                    13 documentation files
```
