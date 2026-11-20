# Arya AI — Upgrade Reference

> Document covers: v2.1 → v6.0  
> Last updated: June 16, 2026  
> Source file: `js/arya-sidebar-panel.js` · 5,722 lines

This document tracks every feature added to the Arya sidebar panel beyond the base v2.0 architecture. For the full system overview, see [ARYA_AI.md](ARYA_AI.md).

---

## Version History

| Version | Released | Lines | Headline |
|---------|----------|-------|----------|
| v2.0 | Jun 14 2026 | ~2,800 | 7-tab panel, emotion detection, PAGE_REGISTRY (94 pages) |
| v2.1 | Jun 14 2026 | ~2,900 | Macro news injection, emotion-aware tone shifting |
| v2.5 | Jun 14 2026 | ~3,100 | Heatmap Calendar, Scenario Lab, India Map, Inflation Eroder |
| v3.0 | Jun 14 2026 | ~3,340 | Command palette, Wealth Chart, Goal Cards, Tax Dashboard, Debt Planner, News Widget, Health Trend |
| v3.1 | Jun 15 2026 | 3,439 | **Inline streaming — all sub-domain tabs answer in-place** |
| v4.0 | Jun 15 2026 | 4,134 | **Full local agent** — IndexedDB memory, 12 tools, ReAct loop, Agent tab, auto-memory, daily brief |
| v5.0 | Jun 16 2026 | 4,922 | **World-class intelligence** — Persona System, Monte Carlo, Time Machine, Peer Benchmark, Life Events, Debate Mode, Transaction Analyzer, Report Generator, Background Monitor |
| v6.0 | Jun 16 2026 | 5,722 | **Complete Agent** — 25 tools (vs 12), robust JSON repair, run history, voice input, quick-fire goals, Wealth X-Ray, Tax Optimizer, Insurance Gap Analyzer |

---

## v6.0 — Complete Smart Agent

### 1. Expanded Agent Tools: 12 → 25
Five categories of pure-JS tools (zero AI dependency for math):

| Category | Tools |
|----------|-------|
| Profile & Data | `get_profile`, `get_goals`, `get_health`, `get_news`, `recall` |
| Calculators | `calc_sip`, `calc_emi`, `calc_fire`, `calc_inflation`, `calc_debt_free` |
| Advanced Intelligence | `analyze_wealth`, `optimize_tax`, `calc_insurance`, `optimize_sip`, `calc_rebalance` |
| Behavioral / Planning | `detect_bias`, `create_budget`, `calc_goal_gap`, `calc_nps`, `assess_risk` |
| Indian Finance | `calc_advance_tax`, `compare_funds`, `calc_rent_vs_buy` |
| Memory | `remember` |

Key tools:
- **`detect_bias`** — 5 behavioral biases (Loss Aversion, Status Quo, Anchoring, Overconfidence, Present Bias) scored from localStorage
- **`calc_rent_vs_buy`** — 20-year comparison for Indian cities (buy vs rent+invest)
- **`compare_funds`** — 11 instruments ranked: ELSS/PPF/FD/SIP/NPS/Gold/RD/SSY/Nifty50/Realty
- **`calc_advance_tax`** — FY 2025-26 installments (Jun 15%, Sept 45%, Dec 75%, Mar 100%)
- **`optimize_sip`** — fund-category split with specific product recommendations

### 2. Upgraded AryaAgentRunner
- `num_ctx: 6144` — 6K context window (was 4096)
- `num_predict: 600` — longer answers
- `MAX = 8` steps (was 6)
- `temperature: 0.35`, `repeat_penalty: 1.1` — more precise reasoning
- Robust `parseToolCall()` with JSON auto-repair (quote keys, strip trailing commas)
- `reasoning` event — model thinking shown in step bubbles before tool call
- `toolsUsed[]` array — tracked per run, shown in completion summary

### 3. AryaRunHistory
Persistent localStorage store for last 20 agent runs:
- Auto-saved on every successful run
- Shown in Agent tab history panel with click-to-expand answers
- Cleared via "Clear" button
- Format: goal, answer, steps count, tools used, timestamp

### 4. Voice-to-Agent
Web Speech API with `en-IN` locale:
- Tap 🎙️ → speak your goal → auto-fills textarea
- Auto-runs agent 600ms after speech ends
- Button shows 🔴 while listening, pulses via CSS animation

### 5. Quick-Fire Goals
Two preset buttons for the most common queries:
- **🔥 FIRE** — fills "Do a complete FIRE analysis…" + auto-runs
- **🧾 Tax** — fills "Optimize my complete tax plan…" + auto-runs

### 6. Pulse Tab — Wealth X-Ray
Visual SVG pie breakdown of assets into 3 buckets:
- **Liquid** (savings + emergency + FD)
- **Growth** (equity + MF + stocks)
- **Safety** (PPF + EPF + gold + NPS)
Net worth + liabilities summary + age-based equity allocation check (ideal = 100 − age %)

### 7. Pulse Tab — Tax Optimizer
Live dashboard with progress bars for India's 3 main deductions:
- **80C** (limit ₹1.5L) — ELSS, PPF, LIC
- **80D** (limit ₹25K) — health insurance premium
- **80CCD(1B)** (limit ₹50K) — NPS top-up
Shows: marginal tax rate, room remaining per section, ₹ tax saved if filled, potential total saving

### 8. Pulse Tab — Insurance Gap Analyzer
SVG radial gauge for life and health coverage:
- **Term Life** — need = 12× annual income + total debt; gap displayed
- **Health Cover** — baseline ₹10L needed; top-up gap shown
- 🚨 Alert if term = ₹0 (most urgent financial protection gap)

---

## v5.0 — World-Class Intelligence Upgrades

### 1. AI Advisor Persona System
Four advisor modes that change Arya's entire approach for ALL queries (Chat, inline, Agent):

| Persona | Badge | Focus |
|---------|-------|-------|
| 🎯 Balanced | default | Holistic, growth + safety |
| 🔥 FIRE Mode | `#ff6b35` | Aggressive FIRE optimization |
| 🛡️ Guardian | `#4dffb4` | Capital safety, FD/PPF/gold |
| ⚡ Growth Max | `#b97dff` | High-equity, long-horizon |

**Where:** Agent tab top bar + persona badge in panel header (click to switch).  
**API:** `setPersona('fire')`, `getPersonaAppend()` injected into every system prompt.

### 2. Monte Carlo FIRE Simulator (Pulse tab)
Runs **1,000 stochastic simulations** with CAGR ≈ N(12%, 6%) using Box-Muller transform. Shows probability of reaching FIRE target at year +10, +20, +30. Renders SVG histogram with colour-coded bars (yellow/cyan/green by decade). User can adjust SIP and target corpus and re-run instantly.

**Key function:** `_runMonteCarlo(sipMo, nw, fireTarget, yearsLeft)` → `Int32Array[yearsLeft+1]`

### 3. Financial Time Machine (Pulse tab)
Shows the counterfactual: "If you started ₹X SIP in 2015/2017/2019/2021/2023, you'd have ₹Y today." Uses historical Nifty-approximate CAGR by start year. Includes progress bars, invested vs gain breakdown, and multiplier (e.g., 3.2x).

**Data:** `_TM_HIST_CAGR` — 15 years of historical CAGR estimates.

### 4. India Peer Benchmark (Pulse tab)
Compares the user's Net Worth, Monthly Income, and SIP Rate against Indian peer percentiles for their age bracket (6 brackets: 25-30 → 50-55). Shows percentile bars with labels (Bottom 25% / Below Median / Above Median / Top 25% / Top 10%).

**Data:** `_INDIA_PEER` — estimated from SEBI, RBI, NCAER surveys.

### 5. Transaction Text Analyzer (Pulse tab)
User pastes raw bank SMS / UPI transaction history. Regex engine categorizes into 8 buckets (Food, Transport, Shopping, Investments, Insurance, EMI/Loans, Bills, Medical). Renders bar chart of spending by category with % of total. Feeds personalized "Is this healthy?" prompt to Arya.

**Categories:** 8 + Other, powered by regex patterns in `CAT_MAP`.

### 6. Life Event Advisor (Agent tab)
Six life event cards: 💍 Marriage, 👶 First Child, 🏠 Home Purchase, 💼 Job Change, 📈 Windfall, 🎓 Education. Each triggers a personalized AI financial restructuring plan with user's actual numbers. Response streams inline inside the Agent tab. Auto-saved to IndexedDB memory.

### 7. AI Debate Mode (Agent tab)
User enters a financial dilemma. Arya streams the **Bull Case** and **Bear Case** in parallel-styled cards, then generates a **verdict** specifically for the user's profile. Three separate Ollama calls (Bull: 200 tokens, Bear: 200 tokens, Verdict: 150 tokens).

### 8. Financial Report Generator (Agent tab)
One-click generates a complete **HTML financial health report** and opens it in a new browser tab. Includes: health score gauge, key metric bars, priority action plan, FIRE ETA, debt analysis — all with the user's real data. No server required (uses `Blob` + `URL.createObjectURL`).

**Trigger:** "📄 Report" button in Agent tab memory section header and in answer footer.

### 9. Background Financial Monitor
Runs silently 2.5 seconds after every page load with Arya active. Checks: Emergency Fund < 3 months, SIP < 10% of income, estimated EMI > 45% income, Health Score < 35. If any trigger fires, shows a dismissable alert bar between the health snapshot and the tab bar.

**Function:** `startBackgroundMonitor()` → `_runMonitorChecks()` (called from `init()`).

### 10. Persona Badge in Header
A clickable pill in the panel header shows the current advisor mode (🎯 Balanced by default). Clicking routes to the Agent tab to switch modes. Updates colour dynamically when persona changes.

---

## v3.1 — Inline Sub-Domain Streaming

**The change:** Before v3.1, clicking any "Ask Arya" button in Plan / Map / Life / Pulse / Calendar / India Map forcibly switched the user to the Chat tab to show the answer. Now the answer streams **directly inside the tab** the user is already viewing.

### New Functions

#### `streamInlineFromBtn(btn, prompt)` · async · line ~1372

The core engine for inline responses. Takes the clicked button and the prompt string.

```
1. Disables btn — swaps label with animated dots
2. Inserts .asp-inline-resp box immediately after btn (or reuses existing one)
3. Shows 🤖 Arya header + thinking dots
4. Scrolls box into view (smooth)
5. Builds FULL personalized system prompt:
      BASE_SYSTEM
    + buildUserContext(getPageKey())      ← real ₹ numbers, DNA, goals
    + fetchMacroNews()                    ← live market context (30-min cache)
    + AryaMemory.buildBlock()             ← persistent memory (if loaded)
6. streamFromOllama() with numPredict: 260 — streams into .asp-inline-resp-text
7. On complete → shows "💬 Expand in Chat" pill
8. On error / timeout → shows "Arya is offline" + "💬 Try in Chat" pill
9. Restores btn label and re-enables btn
```

**Why 260 tokens:** Inline answers are meant to be punchy. 260 tokens (~200 words) gives 3–4 focused action points. Users who want a deeper dive can tap "Expand in Chat."

#### `handleAskBtn(btn)` · sync · line ~1452

Universal router for every `.asp-view-ask-btn` in the panel.

```javascript
function handleAskBtn(btn) {
  const msg = btn.dataset.msg;
  if (!msg) return;
  if (btn.closest('#asp-view-chat')) {
    // Already in chat — answer in chat as before
    switchAryaTab('chat');
    if (!_aiRunning) setTimeout(() => sendMessage(msg), 150);
  } else {
    streamInlineFromBtn(btn, msg);   // all other tabs → inline
  }
}
```

The `#asp-view-chat` check is the entire routing decision. Buttons inside chat (e.g., calc-result "Ask Arya" cards in `/sip` output) continue to append to the conversation. Buttons in Plan/Pulse/Calendar/etc. stream inline.

### Updated Wiring Points

All four wiring points now call `handleAskBtn` instead of the old `switchAryaTab + sendMessage` pattern:

| Location | Before v3.1 | After v3.1 |
|----------|-------------|------------|
| `openPanel()` global delegation | `switchAryaTab + sendMessage` | `handleAskBtn(btn)` |
| `wireAskBtnInEl(el)` | `switchAryaTab + sendMessage` | `handleAskBtn(btn)` |
| `switchAryaTab('pulse')` case | `switchAryaTab + sendMessage` | `handleAskBtn(btn)` |
| `switchAryaTab('calendar')` case | `switchAryaTab + sendMessage` | `handleAskBtn(btn)` |
| `wireIndiaMap()` `imt-ask-btn` | `switchAryaTab + sendMessage` | `streamInlineFromBtn(btn, msg)` |

### New CSS Classes

```css
.asp-inline-resp          /* container — cyan-tinted box, fade-in on show */
.asp-inline-resp-hd       /* flex header row */
.asp-inline-resp-who      /* "🤖 Arya" label */
.asp-inline-resp-x        /* close (✕) button */
.asp-inline-resp-body     /* streaming content area */
.asp-inline-resp-text     /* the richText-rendered response */
.asp-inline-resp-ft       /* footer row */
.asp-inline-resp-go       /* "💬 Expand in Chat" / "Try in Chat" pill */
.asp-inline-dots          /* animated 3-dot loading spinner on button */
.asp-inline-dots span     /* individual dot (aspDot keyframe reused) */
```

Light-theme overrides for all above classes are included.

### User Experience Flow

```
User clicks "🤖 Ask Arya about my roadmap"
  │
  ├─ Button: label → "⠇⠇⠇" (disabled)
  ├─ .asp-inline-resp box fades in below button (still on Plan tab)
  ├─ "🤖 Arya" header + thinking dots
  │
  ├─ [Ollama online]
  │    Tokens stream in with richText highlights
  │    On complete → "💬 Expand in Chat" pill
  │    Button restores
  │
  └─ [Ollama offline]
       "Arya is offline — start Ollama to get instant answers."
       "💬 Try in Chat" pill (routes to chat for queuing)
       Button restores

User clicks "💬 Expand in Chat"
  └─ switchAryaTab('chat') → sendMessage(prompt) → full-length chat response

User clicks "✕"
  └─ box.display = 'none', button re-enables
```

### Personalization at Inline Level

`streamInlineFromBtn` builds the identical context as `sendMessage` — the full personalized system prompt:

```
BASE_SYSTEM
+ "\n\nUSER FINANCIAL PROFILE:\n" + buildUserContext(pageKey)
+ "\n\nLIVE MARKET CONTEXT:\n"  + fetchMacroNews()           (if online)
+ "\n\n"                         + AryaMemory.buildBlock()    (if loaded)
```

This means every inline answer knows the user's name, income, net worth, DNA, SIP, goals, health score, current page, and live market news — identical to what the Chat tab knows.

---

## v3.0 — Command Palette + 8 Pulse Sections

### 1. Command Palette · `processCommand(text)` · line ~1669

Intercepts text starting with `/` in the chat input before sending to Ollama. Returns `true` if handled, `false` to fall through to `sendMessage`.

| Command | What it does |
|---------|-------------|
| `/help` | Renders all available commands as a card |
| `/clear` | Clears chat history + disk cache |
| `/goals` | Renders goal progress card with ₹ targets and SIP needed |
| `/tax` | Renders 80C / 80D / NPS deduction summary |
| `/debt` | Renders debt overview with avalanche payoff timeline |
| `/sip [amt] [yrs] [rate]` | Calculates SIP corpus, renders ask-Arya card |
| `/emi [P] [rate] [yrs]` | Calculates EMI, renders rent-vs-buy card |
| `/fire [exp]` | Calculates FIRE number, shows on-track/gap analysis |
| `/compare [amt] [yrs]` | Side-by-side ELSS vs FD vs PPF vs NPS corpus table |
| `/news` | Fetches macro headlines, renders news cards with sentiment |

**Command hint bar:** Typing `/` into an empty input shows a 4-second hint strip listing all commands. Implemented in the `inputEl.keydown` handler.

### 2. Wealth Trajectory Chart · `buildWealthChart()` · line ~1401

SVG line chart of net worth projection to retirement age.

- Input: current net worth, SIP, CAGR (12% default), retirement age (60)
- Plots: corpus curve year-by-year + dashed horizontal FIRE target line
- Labels: today's NW, projected corpus, years-to-FIRE marker
- Inline ask button: "🤖 Optimise my wealth path" with real ₹ figures in `data-msg`

### 3. Goal Cards · `buildGoalCards()` · line ~1484

2-column grid of SVG ring cards for each goal in `finos_goals` (JSON array).

Each card shows:
- Goal name + emoji
- SVG donut ring with `%` fill (animated via `stroke-dashoffset`)
- ₹ saved / ₹ target
- Months remaining
- "🤖 Plan this goal" ask button with SIP-needed in the prompt

### 4. Tax Dashboard · `buildTaxDashboard()` · line ~1534

Three horizontal progress bars:

| Deduction | Cap | Source key |
|-----------|-----|-----------|
| 80C | ₹1,50,000 | `finos_investments_80c` |
| 80D (Health Insurance) | ₹25,000 | `finos_health_insurance` |
| NPS (80CCD 1B) | ₹50,000 | `finos_nps_amount` |

Shows: amount invested, potential remaining, tax saved (at 30% slab), and a countdown to March 31 with days remaining. Inline ask button pre-loaded with all deduction figures.

### 5. Debt Freedom Planner · `buildDebtFreedomPlanner()` · line ~1596

Avalanche method calculator:

- Reads: `finos_total_debt`, `finos_debt_interest`, `finos_min_payment`, `finos_income`
- Default extra payment: ₹2,000/mo above minimum
- Calculates: payoff months (min-only vs with extra), total interest saved
- Inline ask button: "🤖 Build my payoff strategy" with exact ₹ amounts

### 6. News Widget · `buildNewsWidget()` + `wireNewsWidget()` · line ~1639

Async news card grid that fires after Pulse renders.

- Calls `fetchMacroNews()` (Flask `:5000`, cached 30 min)
- Renders up to 4 headline cards with sentiment pill (Bullish / Bearish / Neutral)
- Each card has "Ask Arya →" button with inline streaming (v3.1) or chat (v3.0)
- If offline: shows a single "Impact on my portfolio" fallback ask card

### 7. Health Score Trend · `getHealthTrend()` + `saveHealthSnapshot()` · line ~1470

Weekly snapshots of the financial health score stored in `finos_health_history` (JSON array, last 12 entries).

```javascript
saveHealthSnapshot()  // Called on init() — saves if last snapshot > 6 days old
getHealthTrend()      // Returns delta vs previous snapshot (number | null)
```

The trend appears in the Pulse header as a coloured badge:
- `↑ N pts` — green background (health improving)
- `↓ N pts` — red background (health declining)
- `→` — flat (no change)
- Hidden when no prior snapshot exists

### 8. Enhanced Nudge Cards

Nudge cards in the Pulse overview now include:
- Specific ₹ amounts from user data (not generic %s)
- Priority ordering (Emergency Fund → Insurance → FIRE gap)
- Inline ask buttons per nudge (v3.1 routes these inline)

### 9. Command Hint Bar CSS · `.asp-cmd-hint`

Appears above the chat input for 4 seconds when user types `/` into empty field:

```css
.asp-cmd-hint { padding: 6px 12px; font-size: 10.5px;
                color: rgba(255,255,255,.45);
                background: rgba(0,212,255,.06);
                border-top: 1px solid rgba(0,212,255,.12); }
.asp-cmd-hint b { color: #00d4ff; }
```

---

## v2.5 — Heatmap, Scenario Lab, India Map, Inflation Eroder

### 1. Financial Heatmap Calendar · `buildHeatmapView()` + `wireHeatmap()` · line ~1240

GitHub-style contribution grid of daily spending from `finos_expense_log`.

**Layout fix (was grid-row-major, now column-major):**
```css
grid-auto-flow: column;
grid-template-rows: repeat(7, 5px);   /* 7 rows = Mon–Sun */
```
Month labels positioned absolutely at `weekIndex × 6.5px` from left.

**Body-appended tooltip** (`wireHeatmap`): the tooltip is appended to `document.body` as `position:fixed` to escape any `overflow:hidden` container. Coordinate calculated from `getBoundingClientRect()` of each cell on mouseover.

Ask button prompt: "Analyse my spending heatmap patterns. Which weeks or months do I consistently overspend? What's draining my budget most? Give me 3 concrete adjustments with ₹ impact."

### 2. What-If Scenario Lab · `buildScenarioLab()` + `wireScenarioLab()` · line ~1832

Three sliders (Income, SIP, Retire Age) that recalculate FIRE score and corpus in real time. Debounced AI commentary streams into `#lab-ai-comment` 2.5 seconds after the last slider move.

**Key behavior:** AI streams INLINE into the lab comment box (no tab switch). Uses `numPredict: 100` for instant 1–2 sentence reactions. Falls back to "Ask Arya deeper" button (wired via `wireAskBtnInEl`) if Ollama is offline.

Sliders:
- Income: ₹20K–₹5L/mo
- SIP: ₹0–₹1L/mo  
- Retire Age: 35–70

### 3. India Financial Map · `buildIndiaMap()` + `wireIndiaMap()` · line ~1977

SVG map of India with 15+ city nodes. Each node is sized and coloured by cost-of-living tier:

| Tier | Color | Monthly cost |
|------|-------|-------------|
| Metro | `#ff4d6d` | ₹60K–₹1.5L |
| Tier 1 | `#ff7c43` | ₹35K–₹60K |
| Tier 2 | `#ffd93d` | ₹20K–₹35K |
| Tier 3 | `#00ffb3` | ₹15K–₹20K |

**Hover fix:** `origR` captured once per node in closure before adding listeners to prevent cumulative radius drift on rapid hover.

On city click: tooltip shows cost/mo, afford status, surplus vs user income, FIRE corpus needed. Ask button prompt is populated with actual city data — "Tell me about retiring or living in Chennai: typical cost ₹32,000/mo, FIRE corpus ₹96 lakh…"

### 4. Inflation Eroder · `buildInflationEroder()` + `wireInflationEroder()` · line ~2080

Interactive visualization of purchasing power erosion.

Sliders: Amount (₹500–₹5L), Years (1–30), Inflation rate (3–14%).

Shows:
- Real value in `years` years at chosen inflation rate
- Purchasing power lost (₹ and %)
- Amount needed today to maintain purchasing power
- Animated bar chart: Today vs Future bars (height reflects real value ratio)
- 8 grocery item cards showing today's price vs future price (item-specific inflation rates from `GROCERY_ITEMS` array)

---

## v2.1 — Macro News + Emotion Tone

### 1. Macro News Injection · `fetchMacroNews()` · line ~845

```javascript
async function fetchMacroNews() {
  // Promise.any() race across 3 endpoints — first to respond wins
  // 2s timeout per endpoint
  // 30-minute in-memory cache (_newsCache, _newsCacheTs)
  // Returns: 4 headline lines joined by "\n"
}
```

Endpoints tried in parallel:
1. `http://localhost:5000/api/headlines` (Flask app.py)
2. `http://localhost:5000/news` (alternate route)
3. `http://localhost:8001/market-news` (Alert Engine)

Result is appended to every `sendMessage()` system prompt and every `streamInlineFromBtn()` system prompt.

### 2. Emotion-Aware Tone · `detectEmotion()` · line ~1169

Scores the user's message text against keyword dictionaries for 5 emotions:

| Mode | Keywords (sample) | System append |
|------|-------------------|--------------|
| `calm` | default | (none) |
| `excited` | amazing, bull, moon, 10x | "User is excited — harness enthusiasm, add measured caution." |
| `worried` | scared, lost, panic, crash | "User is worried — lead with reassurance, practical steps." |
| `curious` | how, why, explain, what | "User is curious — go deep, explain mechanisms." |
| `frustrated` | useless, wrong, stupid | "User is frustrated — be empathetic, very concise." |

The 😌 badge in the panel header updates per emotion mode.

---

## Constants Reference

| Constant | Value | Purpose |
|----------|-------|---------|
| `OLLAMA_MODEL` | `'qwen3:14b'` | Model used for all inference |
| `TIMEOUT_MS` | `45_000` | AbortController timeout per stream request |
| `OLLAMA_ENDPOINTS` | 3 URLs | localhost ports tried in order |
| `numPredict` (chat) | `450–600` | Max tokens for Chat tab responses |
| `numPredict` (inline) | `260` | Max tokens for inline sub-domain responses |
| `numPredict` (scenario lab) | `100` | Max tokens for slider debounce comments |
| `numPredict` (auto-insight) | `320` | Max tokens for page-load auto-insight |

---

## LocalStorage Keys Added

| Key | Type | Set by | Used by |
|-----|------|--------|---------|
| `finos_health_history` | JSON array (max 12) | `saveHealthSnapshot()` | `getHealthTrend()` |

All other keys (`finos_income`, `finos_goals`, `finos_total_debt`, etc.) are read-only from Arya's perspective — set by page modules.

---

## Performance Notes

### TIMEOUT_MS vs qwen3:14b

At 260 `numPredict`, `qwen3:14b` running on CPU (no GPU) can take 60–90 seconds to complete an inline response. `TIMEOUT_MS = 45_000` will abort before completion on slower machines.

**Options:**

| Fix | Trade-off |
|-----|-----------|
| Bump `TIMEOUT_MS` to `90_000` | Longer wait before offline fallback |
| Switch `OLLAMA_MODEL` to `qwen2.5:3b` | Much faster (~10s for 260 tokens), slightly less nuanced |
| Lower inline `numPredict` to `160` | Very fast; answers are shorter (~120 words) |

### Lazy Rendering

All 6 non-chat tabs lazy-render on first open. The `_*Rendered` flags (`_rmRendered`, `_mmRendered`, `_tlRendered`, `_pulseRendered`, `_calRendered`, `_mapRendered`) prevent re-rendering on tab switch.

### fetchMacroNews Caching

`_newsCache` + `_newsCacheTs` give a 30-minute in-memory cache. The cache resets on page reload. Each inline request and each chat message calls `fetchMacroNews()` but the cache means only one actual network call per 30 minutes.

---

## Adding a New Inline Ask Button

Any element with class `asp-view-ask-btn` and a `data-msg` attribute is automatically handled by `handleAskBtn` via the global delegation in `openPanel()`. For buttons rendered after panel open (lazy tabs), wire them manually:

```javascript
// In a lazy-render switch case or wireXxx() function:
el.querySelectorAll('.asp-view-ask-btn').forEach(btn => {
  btn.addEventListener('click', () => handleAskBtn(btn));
});
```

For a button that should ALWAYS go to chat (regardless of which tab it's in), bypass `handleAskBtn` and call `switchAryaTab` + `sendMessage` directly. No current buttons use this pattern.

To make the inline prompt data-rich, build it at render time using real values:

```javascript
const prompt = `My SIP is ${INR(sip)}/mo for ${yrs} years at ${rate}% — corpus ${INR(corpus)}. Is this enough?`;
btn.dataset.msg = prompt;
```

The `streamInlineFromBtn` function adds `BASE_SYSTEM + buildUserContext()` on top of whatever is in `data-msg`.

---

## Verified End-to-End (Jun 15 2026)

Playwright test against localhost:7474, Ollama online with qwen3:14b, localStorage seeded:

| Tab | Stay-on-tab? | Inline box? | Personalized? |
|-----|-------------|-------------|---------------|
| 🗺️ Plan | ✅ | ✅ | ✅ "Vikas, let's take a deep dive..." |
| 📊 Pulse | ✅ | ✅ | ✅ |
| 📅 Calendar | ✅ | ✅ | ✅ |
| ✕ Close button | — | Hides + btn reset ✅ | — |
| 💬 Expand in Chat | — | Switches to Chat ✅ | — |
