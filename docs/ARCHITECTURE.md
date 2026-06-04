# FIN-OS — Architecture

> Version: 1.2 | Date: June 5, 2026 | Live: https://finos1.vercel.app

---

## System Overview

FIN-OS splits into a **static Vercel frontend** (96 pages / 88 calculators / React) and a **local Python backend**. All AI — STT, LLM, TTS — runs on the user's machine for privacy and zero inference cost.

```
Browser  (finos1.vercel.app)
  96 HTML pages + 88 calculators + React budget app

  CSS LAYER
    design-tokens.css   92 CSS variables — single source of truth
    interactions.css    180+ hover effects (zero-fill vocabulary)
    theme.css           326 light/dark-mode override rules
    base.css            Reset + typography + WCAG focus rings
    layout.css          Sidebar + mobile nav
    components.css      Shared UI components
    [page].css          38 per-page stylesheets

  JS LAYER
    theme-init.js       Anti-FOUC: runs before first CSS paint
    interactions.js     Hover-override engine
    ui.js               Theme toggle + card entrance + focus tracking
    finos-widget.js     Zero-config AI overlay (every page)
    finos-context.js    User-state collector
    finos-alerts.js     Real-time alert bell
    finos-health-score.js  Live 0-100 score badge
         |
         |  WebSocket  ws://localhost:8765
         v
Local Python
    voiceagent/agent.py        faster-whisper + qwen3:14b + edge-tts
    alerts/alert-engine.py     FastAPI :8001 (APScheduler, 10 rules)
    app.py                     Flask :5000   (News Intel)
    chatbot/brain.py           Python :8000  (QFT engine)
    stock-engine/              FastAPI  (6 services, 14 endpoints)
    stock-dashboard/app.py     Flask :5001
         |                   |
         v                   v
    Supabase             Ollama :11434
  (Auth+Postgres)       (local LLM)
```

---

## Component Map

### Frontend Services

| Component | Path | Tech |
|---|---|---|
| Main app pages | `html/` | HTML + CSS + JS (94 pages) |
| Public pages | `index.html`, `login.html` | HTML + CSS + JS |
| Calculator suite | `calculators/` | Standalone HTML (88 tools) |
| Budget app | `ExpenseTracker/finos-budget/` | React + Vite + Tailwind |
| Voice agent UI | `voiceagent/index.html` | HTML + JS (iframe target) |
| Trade Journal | `TradeJournal/` | HTML + JS + Supabase |
| Portfolio Analyser | `Porfolio Analyser/` | HTML + JS (CSV + voice) |
| Stock Dashboard | `stock-dashboard/index.html` | HTML + JS |

### Backend Services

| Service | Path | Tech | Port |
|---|---|---|---|
| Voice AI WebSocket | `voiceagent/agent.py` | Python asyncio | 8765 |
| Alert Engine + Health Score | `alerts/alert-engine.py` | FastAPI + APScheduler | 8001 |
| News Intel API | `app.py` | Flask | 5000 |
| Chatbot Brain | `chatbot/brain.py` | Python (QFT) | 8000 |
| Market Intelligence | `market intelligence/app.py` | Flask + pandas + ta | varies |
| Stock Engine | `stock-engine/` | FastAPI + yfinance | varies |
| Stock Dashboard API | `stock-dashboard/app.py` | Flask | 5001 |
| Budget Backend | `ExpenseTracker/finos_backend/` | Django REST | 8000 |

---

## Design System Architecture

### CSS Load Order

```
1. design-tokens.css    92 CSS variables — all theme values defined once
2. base.css             imports design-tokens; reset + typography + focus rings
3. layout.css           sidebar + mobile nav
4. components.css       shared UI components
5. theme.css            326 light/dark-mode overrides (loaded last among globals)
6. interactions.css     hover system (uses !important to beat inline styles)
7. [page].css           page-specific styles
```

### Design Token System

`css/design-tokens.css` is the single source of truth for all 92 CSS variables.
Dark mode values defined in `:root` and `:root[data-theme="dark"]`.
Light mode values defined in `:root[data-theme="light"]`.

Key token groups:
- Backgrounds:  `--bg-main`, `--bg-surface`, `--bg-glass`, `--bg-sidebar`
- Text:         `--text-primary`, `--text-secondary`, `--text-muted`, `--text-inverse`
- Accent:       `--accent`, `--accent-primary`, `--accent-secondary`, `--accent-soft`
- Semantic:     `--color-success/error/warning/info` (+ `-soft` variants)
- Borders:      `--border-soft`, `--border-medium`, `--border-hard`
- Shadows:      `--card-shadow`, `--card-shadow-hover`, `--shadow-0..5`
- Spacing:      `--space-1` (4px) to `--space-36` (144px) — 8-point scale
- Typography:   `--font-sans`, `--font-mono`, `--fs-xs..--fs-hero`, `--fw-normal..--fw-black`

### Hover System Architecture

`css/interactions.css` — zero-fill hover vocabulary:
- Cards:     translateY(-4px) + border-glow + depth shadow
- Nav:       text brightens + icon to accent (no fill)
- Buttons:   brightness + glow ring (no flat fill)
- Tabs:      border brightens + accent (no fill)
- TOC:       2px left accent bar slides in
- Rows:      left accent bar + text shift

`js/interactions.js` runs once at DOMContentLoaded:
1. Scans `[onmouseover]`/`[onmouseout]` for background fills
2. Classifies elements (card/link/button) → assigns `data-hover` attribute
3. Strips background-setting handlers
4. Applies MutationObserver to catch JS-set backgrounds during hover

### Anti-FOUC Architecture

Every HTML `<head>` starts with this inline script (before any `<link>`):

    <script>
      (function(){
        var t=localStorage.getItem('finos-theme')||localStorage.getItem('theme')||'dark';
        document.documentElement.setAttribute('data-theme',t);
      })();
    </script>

Theme is persisted to: `localStorage['finos-theme']`, `localStorage['theme']`, `FINOS_SYS_SETTINGS.theme`.

---

## AI Pipeline

### Standard Path (all browsers)

```
Microphone -> Web Speech API (or transformers.js Whisper fallback)
           -> transcript -> finos-widget.js popup
           -> NDJSON streaming -> Ollama :11434 -> qwen3:14b
           -> response tokens -> Web Speech Synthesis (TTS)
           -> audio to user
```

### Brave Browser Path (WebSocket backend)

```
Microphone raw audio -> ws://localhost:8765 -> voiceagent/agent.py
  -> faster-whisper tiny -> transcript
  -> ollama qwen3:14b    -> response
  -> edge-tts Neural     -> audio bytes
  -> WebSocket frames -> AudioContext playback in browser
```

### Memory Context Priority

1. Session context — `sessionStorage.FINOS_CTX` (income, goals, holdings)
2. Long-term memory — `agent_memories` Supabase table
3. Financial DNA — `profiles.financial_dna` (risk profile, life stage)
4. Intent rules — `_INTENT_RULES` in `agent.py`

---

## Alert Engine Architecture

```
FastAPI :8001
  APScheduler (15-min interval)
    -> all 10 AlertRule subclasses -> each active user
       check(user, profile) -> Optional[Alert]
       cooldown per rule (1-7 days)
       priority: info / warning / critical
  Supabase client
    reads:  profiles, transactions, holdings, goals
    writes: alerts, push_subscriptions
  pywebpush (VAPID)
    -> Web Push to subscribed browsers
```

---

## Security Model

| Layer | Control |
|---|---|
| Authentication | Supabase Auth (JWT, email/password) |
| Row-level security | RLS on all tables — `auth.uid() = user_id` |
| Service keys | Only in backend `.env` — never in browser code |
| AI processing | Fully local — no external LLM API calls |
| Voice data | Cleared from RAM on WebSocket disconnect |
| Session context | `sessionStorage` only — tab-scoped, never sent external |
| HTTPS | Enforced by Vercel |

---

## Performance Targets

| Metric | Target |
|---|---|
| LCP (Vercel CDN) | <800ms |
| Calculator load | <1000ms |
| Calculator result | <100ms after input |
| Voice first audio | <2s |
| Theme switch | 0ms (CSS variable update) |
| FOUC | 0 (anti-FOUC on all 96 pages) |
| JS bundle per page | <50KB |
