# FIN-OS — Contributing Guide

---

## File Naming Conventions

| Type | Convention | Example |
|---|---|---|
| HTML pages | kebab-case | `learn-equity.html` |
| CSS files | kebab-case, matches page name | `learn-equity.css` |
| JS modules | kebab-case, matches page name | `learn-equity.js` |
| Calculator files | short lowercase noun | `sip.html`, `ppf.html`, `emi.html` |
| React components | PascalCase | `DebtDestroyer.jsx` |
| Python modules | snake_case | `alert_engine.py` |
| Calc category folders | all lowercase | `investment & wealth/` |

---

## Adding a New HTML Page

### Step 1 — Create files

```
html/your-page.html
css/your-page.css
js/your-page.js        (if needed)
```

### Step 2 — HTML boilerplate

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your Page — FIN•OS</title>
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/layout.css">
  <link rel="stylesheet" href="../css/components.css">
  <link rel="stylesheet" href="../css/your-page.css">
</head>
<body>

  <!-- Page content here -->

  <script src="../js/theme-init.js"></script>
  <script src="../js/guard.js"></script>        <!-- auth protection -->
  <script src="../js/ui.js"></script>
  <script src="../js/your-page.js"></script>
  <script src="../js/finos-widget.js?v=4"></script>  <!-- AI layer -->
</body>
</html>
```

### Step 3 — Add to navigation

If the page should appear in the global navigation, add a link in `html/home.html` and `html/dashboard.html`.

### Step 4 — Guard

`guard.js` redirects unauthenticated users to `login.html`. It is already included in the boilerplate above. Do not add pages that skip auth unless they are public (like `index.html` and `login.html`).

---

## Adding a New Calculator

### Step 1 — Choose a category folder

```
calculators/
├── banking & fixed income/
├── core-thinking/
├── desi reality check/
├── financial health/
├── investment & wealth/
├── loans, debt & emi/
├── retirement & life planning/
├── tax & salary/
└── trading & markets/
```

### Step 2 — Create the file

```bash
# Example: adding a gold calculator to Investment & Wealth
touch "calculators/investment & wealth/gold.html"
```

### Step 3 — Calculator HTML boilerplate

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gold Return Calculator — FIN•OS</title>
  <link rel="stylesheet" href="../../css/base.css">
  <link rel="stylesheet" href="calculator-base.css">
</head>
<body class="calc-page">

<div class="calc-container">
  <header class="calc-header">
    <a href="../../html/calculators.html" class="back-link">← Calculators</a>
    <h1>Gold Return Calculator</h1>
    <p class="calc-subtitle">Calculate real returns on gold investment</p>
  </header>

  <main class="calc-body">
    <!-- inputs here -->
    <form id="calcForm">
      <label>Investment Amount (₹)
        <input type="number" id="amount" value="100000" min="1000">
      </label>
      <label>Years
        <input type="number" id="years" value="10" min="1" max="40">
      </label>
      <button type="submit">Calculate</button>
    </form>

    <!-- output here -->
    <div class="calc-result" id="result"></div>
  </main>
</div>

<script src="calculator-base.js"></script>
<script>
  document.getElementById('calcForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const amount = +document.getElementById('amount').value;
    const years  = +document.getElementById('years').value;
    const GOLD_CAGR = 0.089; // 8.9% historical in INR
    const future = amount * Math.pow(1 + GOLD_CAGR, years);
    document.getElementById('result').innerHTML = `
      <p>Future value: <strong>₹${future.toLocaleString('en-IN', {maximumFractionDigits:0})}</strong></p>
    `;
  });
</script>
</body>
</html>
```

### Step 4 — Register in `js/calculators.js`

Open `js/calculators.js` and add the entry to the correct category:

```javascript
{
  id: "investment",
  title: "💰 Investment & Wealth",
  folder: "calculators/investment & wealth",
  calculators: [
    // existing entries...
    { name: "Gold Return Calculator", file: "gold.html" },  // ← add here
  ]
}
```

**Important:** The `file` value must exactly match the filename on disk (case-sensitive on Linux/Vercel).

---

## Adding a New Alert Rule

Open `alerts/rules.py` and add a new class:

```python
class GoldAllocationRule(AlertRule):
    id = "gold_allocation"
    cooldown = timedelta(days=30)

    async def check(self, user: dict, profile: dict) -> Optional[Alert]:
        holdings = user.get("holdings", [])
        gold = sum(h["current_value"] for h in holdings if h.get("asset_type") == "gold")
        total = sum(h["current_value"] for h in holdings)
        if total > 0 and gold / total > 0.20:
            return Alert(
                rule_id=self.id,
                title="Gold allocation high",
                message="Your gold allocation is over 20%. Gold doesn't compound — consider rebalancing some into equity index funds.",
                priority="warning",
            )
        return None
```

Then register it in `alert-engine.py`:

```python
RULES = [
    SIPMissedRule(),
    SalaryCreditedRule(),
    # ... existing rules ...
    GoldAllocationRule(),   # ← add here
]
```

---

## Adding a New Voice Agent Intent

Open `voiceagent/agent.py` and add to `Brain._INTENT_RULES`:

```python
{
    "id": "sgb_gold",
    "pattern": re.compile(r"\b(gold|SGB|sovereign gold bond|gold etf)\b", re.I),
    "facts": """
GOLD ADVICE: SGB (Sovereign Gold Bond) gives 2.5% annual interest + gold price appreciation.
Tax-free at maturity (8-year lock-in). Better than physical gold (no making charges, no storage risk)
and better than Gold ETF (extra 2.5% yield). Ideal for 8+ year horizon.
Red flag: Physical gold jewelry is the worst — making charges 8-20%, storage risk, no yield.
""".strip()
},
```

---

## JavaScript Module Pattern

Every page JS file follows the same IIFE pattern:

```javascript
(function () {
  'use strict';

  // DOM is ready by the time scripts run (defer / end of body)
  
  function init() {
    // page setup
  }

  // Export for other modules if needed
  window.YourModuleName = { init };

  init();
})();
```

---

## CSS Variables (from `css/base.css`)

Use these variables — do not hardcode colors:

```css
/* Colors */
--color-bg          /* page background */
--color-surface     /* card background */
--color-border      /* borders */
--color-text        /* primary text */
--color-text-muted  /* secondary text */
--color-accent      /* brand green */
--color-danger      /* red */
--color-warning     /* amber */
--color-success     /* green */

/* Spacing */
--space-xs   /* 4px */
--space-sm   /* 8px */
--space-md   /* 16px */
--space-lg   /* 24px */
--space-xl   /* 32px */

/* Typography */
--font-size-sm   /* 13px */
--font-size-md   /* 15px */
--font-size-lg   /* 18px */
--font-size-xl   /* 22px */
```

---

## Commit Message Format

```
<type>: <short description>

Examples:
feat: add gold return calculator to investment & wealth
fix: calculator links 404 on Vercel (lowercase folder names)
refactor: voice agent — tighten family profile patterns
docs: add VOICE_AGENT.md and DATABASE.md
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`

---

## Before Pushing

- [ ] No hardcoded `localhost` URLs in HTML/JS files deployed to Vercel
- [ ] Calculator folder names lowercase (will 404 on Linux/Vercel otherwise)
- [ ] Calculator filenames match exactly what's on disk
- [ ] No `SUPABASE_SERVICE_KEY` in any browser-visible file
- [ ] New `.env` variables have a corresponding entry in `.env.example`
- [ ] `finos-widget.js?v=N` version bumped if the JS file changed

---

## Folder Structure Reference

```
Initial Deployment/
├── index.html               Public landing page
├── login.html               Auth page (no guard)
├── manifest.json            PWA manifest
├── sw.js                    Service worker
├── app.py                   News Intel API (Flask :5000)
│
├── html/                    76 app pages
├── css/                     41 stylesheets
├── js/                      55+ JS modules
├── assets/
│   ├── icons/               SVG PWA icons
│   └── images/              24 editorial images
│
├── calculators/             87 standalone calculators
│   ├── banking & fixed income/
│   ├── core-thinking/
│   ├── desi reality check/
│   ├── financial health/
│   ├── investment & wealth/
│   ├── loans, debt & emi/
│   ├── retirement & life planning/
│   ├── tax & salary/
│   └── trading & markets/
│
├── voiceagent/              Voice AI (Python, local only)
│   ├── agent.py             WebSocket server :8765
│   ├── index.html           Voice UI
│   ├── requirements.txt
│   ├── schema.sql           agent_memories table
│   ├── run.sh               Launch script
│   └── .env.example
│
├── alerts/                  Alert Engine (FastAPI :8001, local only)
│   ├── alert-engine.py
│   ├── rules.py
│   ├── health_score.py
│   ├── schema.sql
│   ├── requirements.txt
│   └── .env.example
│
├── chatbot/                 Text chatbot (Python :8000)
├── market intelligence/     Trade signal API (Flask)
├── stock-engine/            Stock data API (FastAPI)
├── stock-dashboard/         Stock research UI (Flask)
│
├── ExpenseTracker/
│   ├── finos-budget/        React + Vite budget app
│   └── finos_backend/       Django REST API
│
├── TradeJournal/            Trade journal app
├── News1/                   TypeScript/Vite news aggregator
├── Porfolio Analyser/       Portfolio analysis tool
├── finos 2/                 Django legacy scaffold
│
└── docs/                    Technical documentation
    ├── ARCHITECTURE.md
    ├── SETUP.md
    ├── VOICE_AGENT.md
    ├── DATABASE.md
    ├── DEPLOYMENT.md
    ├── API_REFERENCE.md
    ├── WEBSOCKET_PROTOCOL.md
    └── CONTRIBUTING.md
```
