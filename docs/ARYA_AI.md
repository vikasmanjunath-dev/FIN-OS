# Arya AI — Complete Reference

> Version: 2.0 | Date: June 14, 2026  
> File: `js/arya-sidebar-panel.js` · 2800+ lines · IIFE `'use strict'`

---

## What Is Arya

Arya is FIN-OS's persistent AI sidebar that appears on every page. It is not a chatbot widget — it is a financial intelligence layer that knows the user's real numbers, remembers what page they are on, detects their emotional state, and delivers advice in their exact context. It runs 100% locally via Ollama. No cloud. No API keys.

---

## Architecture at a Glance

```
Browser page loads arya-sidebar-panel.js (deferred)
  │
  ├─ injectCSS()          — injects all panel CSS into <head>
  ├─ buildPanel()         — builds 7-tab HTML shell into <body>
  ├─ openPanel()          — wires all event listeners
  └─ auto-shows panel     — deferred 1.8s after page load

User sends a message
  │
  ├─ detectEmotion()      — scores 5 mood keywords, picks mode
  ├─ updateEmotionIndicator() — updates 😌 badge in header
  ├─ fetchMacroNews()     — Promise.any() race across 3 news endpoints (2s max)
  ├─ buildSessionContext() — "Page A → Page B → now here" journey string
  ├─ buildBehavioralAlert() — detects page-visit patterns
  ├─ _findEndpoint()      — picks fastest reachable Ollama endpoint
  └─ streamFromOllama()   — streams tokens with think:false, updates bubble live
        │
        └─ detectCalcIntent() → buildCalcCard() → wireCalcCard()
           richText() highlights ₹, %, acronyms, danger words
           follow-up chips generated after each response
```

---

## 7-Tab Panel Structure

| Tab | Icon | Container ID | Rendered by | Lazy? |
|-----|------|-------------|-------------|-------|
| Chat | 💬 | `arya-sp-msgs` | `sendMessage()` | always active |
| Plan | 🗺️ | `arya-rm-container` | `AryaRoadmap.renderRoadmap()` | `_rmRendered` |
| Mind Map | 🧠 | `arya-mm-container` | `AryaRoadmap.renderMindmap()` | `_mmRendered` |
| Life Timeline | 🌅 | `arya-tl-container` | `AryaRoadmap.renderTimeline()` | `_tlRendered` |
| Pulse | 📊 | `arya-pulse-container` | `buildPulseView()` + lab + eroder | `_pulseRendered` |
| Calendar | 📅 | `arya-cal-container` | `buildHeatmapView()` + `wireHeatmap()` | `_calRendered` |
| India Map | 🇮🇳 | `arya-map-container` | `buildIndiaMap()` + `wireIndiaMap()` | `_mapRendered` |

Tabs 2–7 are lazy-rendered — the heavy function runs only on first click. Plan/Map/Timeline require `arya-roadmap.js` which is lazy-loaded via `ensureRoadmapEngine(cb)`.

---

## Feature Reference

### 1. Session Navigator
Every message includes a cross-page journey string built from `sessionStorage`:  
`SESSION JOURNEY: Net Worth → Budget → now here.`  
This lets Arya connect the dots without the user re-explaining their context.

### 2. Persistent Chat History
Conversations are saved to `localStorage` per page key, with a 7-day TTL. The last session is restored on re-open so the user never loses context.  
Key format: `finos_chat_<pageKey>_v2`

### 3. Dynamic Smart Chips
The 4–5 quick-start chips shown when the panel opens use the user's real numbers pulled from localStorage:  
`"My ₹12L portfolio is up 8% — what's overweighted?"` instead of generic placeholders.

### 4. Voice Input
Web Speech API mic button. Language: `en-IN`. Auto-sends transcript on silence. Falls back gracefully if browser doesn't support it.

### 5. AryaMemory Hooks
Every AI response is saved to `localStorage` as episodic memory (`finos_arya_memory_v2`). Key facts are extracted and injected as a `MEMORY:` block into future system prompts.

### 6. Smart Follow-up Chips
After each AI response, Arya auto-generates 3 context-aware follow-up chips using a lightweight Ollama call. User can tap to continue without typing.

### 7. Conversation Ratings
Thumbs up / thumbs down on each Arya reply. Ratings stored per-page per-session. Positive ratings are noted in memory; negative ones suppress that style in future responses.

### 8. Financial Snapshot Widget
Panel header shows a live mini-dashboard (SVG rings):
- Financial Health score ring
- Savings rate ring  
- Top goal progress bar
- Net worth figure

All pulled from localStorage on panel open. Updates on re-open.

### 9. Behavioral Bias Detection
Tracks per-page visit counts (`finos_pvc_<pageKey>`). If user visits a high-risk page (like F&O or crypto) multiple times, Arya injects a behavioral nudge into the system prompt automatically.

### 10. Smart Greeting
Time-aware, data-aware opener when panel first opens:
- Morning → "Good morning! Quick check — did you review your SIP auto-pay?"
- Evening → "Long day? Let's do a 2-minute money check."
- Uses real data: "Your portfolio is up ₹8,200 this week — want a breakdown?"

---

## Emotion-Aware Tone System

Arya detects mood from the user's message and adjusts its system prompt dynamically.

| Mood | Icon | Trigger keywords | System prompt addition |
|------|------|-----------------|----------------------|
| calm | 😌 | (default) | Structured, data-driven, confident |
| excited | 🥳 | great, amazing, fantastic, love, excellent, perfect | Match energy briefly, then ground in numbers |
| worried | 😟 | worried, anxious, scared, stressed, tension, panic | One sentence of validation first, then calm advice |
| curious | 🤔 | how, why, explain, understand, learn, what is, teach | Go deeper, use Indian examples, invite follow-ups |
| frustrated | 😤 | frustrated, angry, hate, terrible, worst, useless, disappointed | Acknowledge frustration, then pivot to actionable fix |

The mood badge (😌 by default) updates in the panel header after every user message.

---

## Macro News Injection

Local Flask news server is hit in parallel at:
- `http://127.0.0.1:5000/api/headlines?limit=5`
- `http://127.0.0.1:5000/headlines?limit=5`
- `http://127.0.0.1:5000/api/news?limit=5`

Uses `Promise.any()` — fastest responder wins. Timeout: 2 seconds. Cache TTL: 30 minutes.  
If no server is running, silently skips — AI response is not blocked.  
News is injected as: `LIVE MARKET CONTEXT:\n• RBI keeps rates unchanged...`

---

## Pulse Tab — 5-Pillar Financial Health

Scores 5 pillars (0–100 each) from localStorage data:

| Pillar | Icon | Formula |
|--------|------|---------|
| Savings | 💾 | `(income - expenses) / income × 100` |
| Safety | 🛟 | `emergencyFund / monthlyExpenses` → scaled to 6-month target |
| Debt | 💳 | `100 - (debt / (income×12)) × 50`, floors at 0 |
| Invest | 📈 | `(sip × 12) / income × 100`, caps at 100 |
| FIRE | 🔥 | `projectedCorpus / (expenses × 25) × 100`, caps at 100 |

Overall score = average of 5 pillars. Ring colors: green ≥70, amber ≥40, red below.

### Nudges (max 3 alerts)
Auto-generated priority alerts — shown only if triggered:
1. Emergency fund < 3 months
2. Debt > 40% of annual income
3. Savings rate < 10%
4. SIP = 0 with income available
5. FIRE score < 20 (far from goal)

### What-If Scenario Lab (inside Pulse)
Three live sliders: Monthly Income · Monthly SIP · Retire At  
Formula: `corpus = netWorth × (1+12%)^yrs + sip × 12 × [(1.12^yrs − 1) / 0.12]`  
After 2.5s of no slider movement, Arya streams a 2-sentence inline comment (max 100 tokens) without switching tabs. Falls back to an "Ask Arya" button if Ollama is offline.

### Inflation Eroder (inside Pulse)
Three sliders: Amount · Years · Inflation rate  
Shows real purchasing power loss with an animated bar chart comparing today's value to future value.  
Indian grocery basket: 8 items with per-item inflation rates (onion 12%, petrol 6%, school fees 10%, 1BHK rent 7%, etc.)

---

## Financial Heatmap Calendar

GitHub-style 53-week spending grid. Architecture:
- `grid-auto-flow: column; grid-template-rows: repeat(7, 5px)` — CRITICAL for correct day alignment
- `grid-auto-columns: 5px; gap: 1.5px` — 6.5px per column step
- Month labels: `position:absolute; left: weekIndex × 6.5px` — no grid interference
- Day labels: S/M/T/W/T/F/S on left side (alternating rows shown)
- Tooltip: `position:fixed` element appended to `<body>` with `id="arya-cal-tip"` — escapes overflow clipping
- `.cal-cell` elements carry `data-tip` attribute with ISO date + festival + spend

Color scale (spend vs daily budget):
| Level | Color | Threshold |
|-------|-------|-----------|
| Under 60% | `#00ffb399` | Under budget |
| 60–90% | `#00d4ff99` | Near budget |
| 90–120% | `#ffb30099` | At budget |
| 120–160% | `#ff754399` | Over budget |
| Over 160% | `#ff4d6d99` | Way over |

Festival days get a gold outline ring. Today's cell gets a cyan outline + glow.

---

## India Affordability Map

SVG bubble map of 31 states/UTs. Each bubble:
- Size = cost of living (min radius 5px, max 14px)
- Color = affordability on user's current salary
- Tap to see: COL/mo, affordability label, monthly surplus, FIRE corpus needed
- Ask button auto-fills a state-specific retirement/relocation prompt

Color scale (income ÷ monthly COL ratio):
| Ratio | Color | Label |
|-------|-------|-------|
| ≥ 3× | `#00ffb3` | Very affordable |
| 2–3× | `#00d4ff` | Affordable |
| 1.5–2× | `#a8e86c` | Moderate |
| 1–1.5× | `#ffb300` | Tight budget |
| < 1× | `#ff4d6d` | Expensive |

Hover: radius expands by 2px (captured in closure, no cumulative drift).  
India income: read from `localStorage` key `finos_income`.

---

## Inline Calculator Cards

After an AI response containing SIP / EMI / FIRE keywords, Arya auto-embeds an interactive calculator card in the chat bubble.

| Intent trigger | Card type | Fields |
|---------------|-----------|--------|
| "sip", "monthly invest" | ⚡ SIP Calculator | Monthly SIP, Years, CAGR % |
| "emi", "home loan", "car loan" | 🏠 EMI Calculator | Loan amount, Interest %, Tenure |
| "fire number", "retirement corpus" | 🔥 FIRE Calculator | Annual expenses, Current corpus |

All three use live formula updates on every keystroke (`input` event).

---

## richText Highlighting

Applied to every Arya response in the chat bubble:

| Pattern | Color | Example |
|---------|-------|---------|
| `₹ amounts` | Gold `#ffd700` | **₹12L** |
| `percentages` | Cyan `#00d4ff` | **12%** |
| Danger words | Red `rgba(255,77,109,...)` | **never**, **stop**, **avoid** |
| Finance acronyms | Bold | **SIP**, **ELSS**, **FIRE** |

---

## Ollama Integration

```javascript
const OLLAMA_ENDPOINTS = [
  'http://127.0.0.1:11434/api/generate',   // direct Ollama
  'https://127.0.0.1:8767/api/generate',   // HTTPS proxy (for Vercel pages)
];
const OLLAMA_MODEL = 'qwen3:14b';
```

`_findEndpoint()` probes `/api/tags` on each with a 1500ms timeout and caches the winner in `_activeEndpoint`. Resets to null on any stream error so the next call re-probes.

`streamFromOllama(system, user, onToken, numPredict)`:
- `think: false` — disables qwen3 chain-of-thought (biggest speedup)
- `num_ctx: 2048` — matches actual prompt sizes, much faster than 8192 default
- `numPredict`: 320 for auto-insights, 450 for user messages, 100 for scenario lab inline

---

## BASE_SYSTEM Prompt (abbreviated)

```
You are Arya, FIN·OS's AI financial coach for Indian investors.
IIM-educated desi friend — warm, direct, sharp.
Language: English with light Hinglish (yaar, bhai, dekh) when natural.
RULES (non-negotiable):
- Use the user's EXACT name and REAL numbers — never placeholders
- Indian context always: ₹, lakh/crore, SEBI/RBI/BSE/NSE, Indian tax laws
- End every auto-insight with ONE concrete action they can do TODAY
- No markdown, no bullet lists — conversational prose like a WhatsApp message
- If MEMORY: block present, reference past conversations naturally
```

---

## localStorage Keys Used

| Key | Type | Purpose |
|-----|------|---------|
| `finos_income` | `string` | Monthly income (₹) |
| `finos_expenses` | `string` | Monthly expenses (₹) |
| `finos_net_worth` | `string` | Net worth (₹) |
| `finos_debt` | `string` | Total debt (₹) |
| `finos_emergency_fund` | `string` | Emergency fund (₹) |
| `finos_sip` | `string` | Monthly SIP (₹) |
| `finos_age` | `string` | User age |
| `finos_retire_age` | `string` | Target retirement age |
| `finos_health_score` | `string` | Financial health score (0–100) |
| `finos_savings_rate` | `string` | Savings rate (%) |
| `finos_dna` / `finos_financial_dna` | `string` | Financial DNA archetype |
| `finos_daily_expenses` | `JSON` | Map of ISO date → spend amount (for heatmap) |
| `finos_chat_<page>_v2` | `JSON` | Persistent chat history per page |
| `finos_arya_memory_v2` | `JSON` | Episodic memory store |
| `finos_pvc_<page>` | `string` | Visit count per page (behavioral bias) |
| `finos_session_pages_v2` | `sessionStorage JSON` | Cross-page journey tracking |

---

## Key Functions — Quick Reference

| Function | Line | Purpose |
|----------|------|---------|
| `buildPanel()` | ~100 | Builds full panel HTML (7 tabs, header, footer) |
| `openPanel()` | ~200 | Attaches all event listeners |
| `switchAryaTab(name)` | ~2280 | Switches active tab, triggers lazy render |
| `sendMessage(text, isAuto)` | ~2390 | Full AI call: emotion → news → system → stream |
| `streamFromOllama(sys, usr, cb, n)` | ~892 | Streaming fetch to Ollama |
| `_findEndpoint()` | ~878 | Probes endpoints, caches fastest |
| `detectEmotion(text)` | ~1173 | Returns one of 5 mood strings |
| `updateEmotionIndicator(mood)` | ~1186 | Updates 😌 badge in panel header |
| `fetchMacroNews()` | ~1198 | Parallel news fetch, 30m cache |
| `buildPulseView()` | ~1068 | Builds 5-pillar SVG ring dashboard |
| `computeNudges()` | ~1022 | Returns ≤3 priority alert objects |
| `buildScenarioLab()` | ~1365 | Builds slider lab HTML |
| `wireScenarioLab()` | ~1404 | Wires sliders + inline AI streaming |
| `buildHeatmapView()` | ~1228 | Builds 53-week calendar grid |
| `wireHeatmap()` | ~1340 | Wires body-appended fixed tooltip |
| `buildIndiaMap()` | ~1487 | Builds SVG bubble map |
| `wireIndiaMap()` | ~1544 | Wires click (detail panel) + hover (radius) |
| `buildInflationEroder()` | ~1588 | Builds inflation bar chart |
| `wireInflationEroder()` | ~1630 | Wires sliders + animated bars |
| `richText(text)` | ~794 | Highlights ₹, %, danger words, acronyms |
| `detectCalcIntent(ai, usr)` | ~813 | Returns 'sip'|'emi'|'fire'|null |
| `buildCalcCard(intent)` | ~821 | Returns inline calc HTML |
| `wireCalcCard(intent)` | ~851 | Wires live formula on each input |
| `wireAskBtnInEl(el)` | ~1363 | Wires `.asp-view-ask-btn` inside any container |
| `ensureRoadmapEngine(cb)` | ~2369 | Lazy-loads arya-roadmap.js on demand |
| `stripThinking(text)` | ~785 | Removes `<think>…</think>` blocks |

---

## Adding a New Feature to Arya

### New tab
1. Add `<button class="asp-tab" data-view="mytab">🔧 MyTab</button>` inside `buildPanel()`
2. Add `<div id="asp-view-mytab" class="asp-view">…</div>` inside `buildPanel()`
3. Add a `_myTabRendered = false` flag and a render block in `switchAryaTab(name)`
4. Implement `buildMyTab()` and optional `wireMyTab()`

### New section inside Pulse
Append `buildMySection()` output in the Pulse lazy-render block (inside `switchAryaTab` where `name === 'pulse'`). Call `wireMySection()` right after. The existing `asp-view-ask-btn` delegation auto-wires your ask buttons.

### New calculator intent
Add one `if (/keyword/i.test(t)) return 'myintent';` in `detectCalcIntent()`, then add a `myintent: { title, inputs }` entry in `buildCalcCard()`, and a branch in `wireCalcCard()`.

---

## CSS Architecture

All panel styles are injected by `injectCSS()` — no external stylesheet required. The panel works on any page that loads the script.

| Class prefix | Scope |
|-------------|-------|
| `asp-*` | Panel shell (tabs, views, header, footer) |
| `apl-*` | Pulse / Lab / Pillar components |
| `cal-cell` | Heatmap grid cells |
| `imap-node` | India map SVG groups |
| `.asp-fade-in` | 280ms slide-up on tab first render |
| `.asp-view-ask-btn` | Universal "Ask Arya →" button |

### Key animations
```css
@keyframes aspFadeIn { from { opacity:0;transform:translateY(6px) } to { opacity:1;transform:translateY(0) } }
@keyframes aspPulse  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.3)} }
@keyframes aspBlink  { 0%,100%{opacity:1} 50%{opacity:0} }
@keyframes aspDot    { 0%,100%{opacity:.25} 50%{opacity:1} }
@keyframes aspSpinRm { to { transform:rotate(360deg) } }
```

---

## Roadmap Engine Integration

The Plan / Mind Map / Life Timeline tabs depend on `arya-roadmap.js`. It is NOT loaded upfront — `ensureRoadmapEngine(cb)` lazy-loads it by resolving the path from the panel script's own `src` attribute. If the engine fails to load, a friendly error message is shown with a link to `roadmap.html`.

Key `AryaRoadmap` methods used:
- `AryaRoadmap.renderRoadmap(container, userCtx)`
- `AryaRoadmap.renderMindmap(container, userCtx)`
- `AryaRoadmap.renderTimeline(container, userCtx)`
- `AryaRoadmap.projectCorpus(ctx)` — returns FIRE corpus projection
- `AryaRoadmap.manualDone(stepId)` — marks a roadmap step complete

---

## Deployment Notes

- The file must load **before** `finos-widget.js` and **after** `finos-personalization.js`
- Include as `<script src="../js/arya-sidebar-panel.js" defer></script>` on every app page
- The HTTPS Ollama proxy (`https://127.0.0.1:8767`) requires `voiceagent/agent.py` to be running — it is the same Python process that serves the voice agent
- No build step required — single vanilla JS file, no dependencies
