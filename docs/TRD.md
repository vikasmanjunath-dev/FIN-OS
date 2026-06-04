# FIN-OS — Technical Requirements Document (TRD)

**Owner:** Vikas Manjunath | **Version:** 1.2 | **Date:** June 5, 2026 | **Status:** Active

---

## 1. Purpose

Defines technical stack, performance budgets, security, accessibility, and integration contracts for all FIN-OS components.

---

## 2. Technology Stack

### Frontend

| Layer | Technology | Notes |
|---|---|---|
| HTML | HTML5 | 96 pages, no framework overhead |
| CSS | CSS3 + custom properties | 92-token design system |
| JavaScript | Vanilla ES6+ | No build step; 88 modules |
| React app | React 18 + Vite 5 + Tailwind | Budget app (11 pages) only |
| TypeScript | TS 5 + Vite + Express | News1 aggregator |
| PWA | Service Worker + Web Push Level 3 | Offline + push notifications |

### CSS Architecture (45 files)

| File | Purpose |
|---|---|
| `design-tokens.css` | 92 CSS variables — single source of truth |
| `interactions.css` | 180+ zero-fill hover effects |
| `theme.css` | 326 light/dark-mode rules |
| `base.css` | Reset, typography, WCAG focus rings |
| `layout.css` | Sidebar, mobile nav, topbar |
| `components.css` | Shared UI components |
| `[page].css` (38 files) | Per-page styles |

### JS Architecture (88 files)

| File | Purpose |
|---|---|
| `theme-init.js` | Anti-FOUC — inline script, before first paint |
| `interactions.js` | Hover override engine |
| `ui.js` | Theme toggle + card animation + focus tracking |
| `finos-widget.js` | AI overlay (every page) |
| `finos-context.js` | User-state collector |
| `finos-alerts.js` | Alert bell |
| `finos-health-score.js` | Health score badge |
| `guard.js` | Auth route guard |
| `[page].js` (80 files) | Per-page logic |

### Backend Services

| Service | Tech | Port |
|---|---|---|
| Voice AI WebSocket | Python asyncio + websockets 12+ | 8765 |
| Alert Engine + Health | FastAPI 0.110+ + APScheduler | 8001 |
| News Intel | Flask 3.0+ | 5000 |
| Chatbot | Python + QFT engine | 8000 |
| Market Intelligence | Flask + pandas + ta | varies |
| Stock Engine (6 services) | FastAPI + yfinance | varies |
| Budget Backend | Django REST Framework 5.0+ | 8000 |
| Stock Dashboard | Flask + yfinance | 5001 |

### AI / ML

| Component | Library / Model | Mode |
|---|---|---|
| LLM inference | Ollama + qwen3:14b | Local CPU/GPU |
| Speech-to-Text | faster-whisper tiny (int8) | Local CPU |
| TTS (primary) | edge-tts Neural (en-IN, hi-IN) | Local, needs internet |
| TTS (fallback) | Piper TTS | Fully offline |

### Database & Infrastructure

| Component | Provider |
|---|---|
| Database | Supabase (Postgres 15) |
| Auth | Supabase Auth (GoTrue) |
| Realtime | Supabase Realtime (Phoenix Channels) |
| Hosting | Vercel (free Hobby tier) |
| CDN | Vercel Edge Network (global) |
| Market data | yfinance — no API key |
| News data | Google News RSS — no API key |

---

## 3. Performance Requirements

| Metric | Target |
|---|---|
| LCP (Vercel CDN) | <800ms |
| FID | <100ms |
| CLS | <0.1 |
| Calculator load | <1000ms |
| Calculator result render | <100ms after input |
| JS bundle per page | <50KB |
| FOUC on page load | 0 (anti-FOUC on all 96 pages) |
| Theme switch | 0ms (CSS variable update) |
| Voice first audio | <2s |
| STT latency (Whisper tiny) | <150ms |
| LLM first token (qwen3:14b M2) | <800ms |
| TTS first audio chunk | <400ms |
| Alert scheduler interval | 15 minutes |

---

## 4. Security Requirements

| Requirement | Implementation |
|---|---|
| Authentication | Supabase Auth — email/password, JWT |
| Row-level security | RLS on all tables — `auth.uid() = user_id` |
| Service key isolation | `service_role` key only in backend `.env`, never in browser |
| AI privacy | All LLM/STT/TTS local — zero external inference |
| Voice data | Cleared from RAM on WebSocket disconnect |
| Session context | `sessionStorage` only — tab-scoped, never external |
| HTTPS | Enforced by Vercel |
| CORS | Alert engine: `localhost` origins only |

---

## 5. Theme System Requirements

| Requirement | Specification |
|---|---|
| Anti-FOUC | Inline IIFE as **first child of `<head>`**, before any `<link>` |
| Theme persistence | Written to `finos-theme`, `theme`, `FINOS_SYS_SETTINGS.theme` |
| CSS variables | All colour values via `var(--token)` — no hardcoded hex outside token files |
| Light-mode coverage | 326 rules in `theme.css` covering all component types |
| Hover system | Zero-fill vocabulary — all effects via `interactions.css` |
| Inline style blocks | Must not contain hardcoded dark hex or `rgba(255,255,255,.0x)` surfaces |
| Toggle coverage | Theme toggle on **all 96 pages** |
| WCAG native controls | `color-scheme` set per theme |

---

## 6. Accessibility Requirements (WCAG AA)

| Standard | Target |
|---|---|
| Contrast (normal text) | >=4.5:1 |
| Contrast (large text) | >=3:1 |
| Focus indicators | Visible `:focus-visible` ring on all interactive elements |
| Keyboard nav | All functionality reachable without mouse |
| Screen reader | Semantic HTML + proper ARIA roles |
| Reduced motion | `prefers-reduced-motion` respected |
| Mouse users | `data-focus-source="mouse"` suppresses outline for mouse-only users |

---

## 7. PWA Requirements

| Feature | Implementation |
|---|---|
| Manifest | `manifest.json` — name, icons, theme colour, display |
| Service worker | `sw.js` — network-first HTML, cache-first assets |
| Offline | Calculators + education pages offline; AI needs local services |
| Push | VAPID via pywebpush + `push_subscriptions` Supabase table |

---

## 8. Integration Contracts

### Supabase
```
VITE_SUPABASE_URL         https://oeapcyucnduhwpgxfknb.supabase.co
VITE_SUPABASE_ANON_KEY    eyJ...  (browser-safe, public)
SUPABASE_SERVICE_ROLE_KEY eyJ...  (backend .env ONLY)
```

### Ollama
```
Base URL   http://localhost:11434
Model      qwen3:14b  (primary) | qwen2.5:3b (fallback)
Protocol   NDJSON streaming via /api/generate
```

### Voice Agent WebSocket
```
URL     ws://localhost:8765
Auth    None (localhost-only)
```

### Alert Engine
```
Base    http://localhost:8001
Auth    None (localhost-only)
Key     user_id param on all user-scoped endpoints
```

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Zero-build frontend | Runs with `python -m http.server 3000` |
| No required API keys | yfinance + Google RSS — no keys |
| Dependency isolation | Each Python service in its own `.venv` |
| Backwards compat | Both `finos-theme` and `theme` localStorage keys checked |
| Graceful degradation | Voice unavailable → falls back to text chat widget |
| Offline first | Calculators + education fully offline |
