# FIN-OS — Product Requirements Document (PRD)

**Document owner:** Vikas Manjunath  
**Version:** 1.2  
**Date:** June 5, 2026  
**Status:** Active  
**Live product:** https://finos1.vercel.app  

---

## 1. Executive Summary

FIN-OS is India's most complete personal finance operating system. It gives every Indian user — from a 22-year-old first-job earner to a 50-year-old pre-retiree — a single platform for financial education, planning, tracking, AI guidance, and market intelligence.

The core insight: **India has a massive personal finance literacy and execution gap.** 90% of retail F&O traders lose money. LIC endowment plans are sold to 200 million families at 4% returns when index funds give 12%. The first-generation wealth-builder has no trusted, judgment-free advisor.

FIN-OS fills this gap with a voice-first, desi-native AI that speaks the user's language (English, Hindi, Hinglish), knows their complete financial picture, and gives advice the way a brilliant, honest friend from IIM would — over chai, not in a formal boardroom.

---

## 2. Problem Statement

| Problem | Impact |
|---|---|
| Indians don't know basic financial concepts | 200M+ LIC endowment policy holders earning 4% when index funds give 12% |
| No single tool covers the full financial picture | Users juggle 6–10 apps — CA, bank app, Groww, Zerodha, Paytm, Excel |
| Financial advisors are inaccessible or biased | SEBI-RIA penetration is <1% of India's population |
| Most fintech is in English only | 650M Hindi/vernacular users excluded |
| AI chatbots don't know your specific situation | Generic answers not accounting for income, goals, debts, tax slab |
| No proactive financial monitoring | Users only check finances when something goes wrong |

---

## 3. Target Users

### Primary — The Aspiring Middle-Class Builder (18–40)

- **Earns:** ₹5L–₹25L per year
- **Stage:** Early career, growth, or family formation
- **Pain:** Earns decent money but doesn't know how to build wealth; gets sold LIC/ULIP by agents; takes car loans without understanding true cost; invests in Telegram tips
- **Need:** A trusted guide who explains without judging, in the language they think in

### Secondary — The Pre-Retirement Optimizer (40–55)

- **Earns:** ₹25L–₹1Cr per year
- **Stage:** Peak earning, 10–15 years from retirement
- **Pain:** No consolidated view; doesn't know if corpus will last retirement; worried about healthcare inflation; dependent parents
- **Need:** Portfolio analysis, retirement corpus calculator, systematic withdrawal planning

### Tertiary — The Student / First-Job Earner (18–24)

- **Earns:** ₹0–₹5L (stipend / first salary)
- **Stage:** Building financial habits from scratch
- **Pain:** No formal financial education; makes first investment mistake with F&O or crypto
- **Need:** Finance 101 content, simple calculators, judgment-free AI that starts from zero

---

## 4. Goals and Success Metrics

### Product Goals

| Goal | Metric | Target |
|---|---|---|
| Educate users on core finance | Pages visited per session | ≥3 education pages per active user |
| Drive SIP / investment habits | Calculators used → "save this plan" | 30% calculator → action conversion |
| Prevent bad financial decisions | LIC / F&O intent detected → intervention | <20% proceed after AI warning |
| Build daily habit | DAU/MAU ratio | ≥35% |
| Voice agent adoption | Voice sessions / total logins | ≥40% of users try voice |

### Quality Goals

| Metric | Target |
|---|---|
| Voice agent first-audio latency | < 2 seconds |
| Calculator load time | < 1 second |
| Page load (Vercel CDN) | < 800ms LCP |
| Uptime (frontend / Vercel) | 99.9% |
| Memory accuracy (profile extraction) | 0 false positives in family / age detection |
| Theme switch latency | 0ms (CSS variables, instant) |
| FOUC on page load | 0 (anti-FOUC script on all 96 pages) |

---

## 5. Feature List — MoSCoW Prioritisation

### Must Have (shipped)

- [x] **96 HTML pages** spanning the complete finance journey
- [x] **88 financial calculators** across 9 categories
- [x] Voice AI — English / Hindi / Hinglish, local LLM, real-time TTS
- [x] Supabase auth + RLS-protected user data
- [x] Proactive alert engine (10 rules, 15-min cadence)
- [x] Financial health score (6 pillars, 0–100)
- [x] Portfolio analyser (Zerodha CSV upload → voice-queryable)
- [x] Persistent cross-session voice memory (Supabase)
- [x] React budget app (FIRE calc, debt destroyer, AI war room)
- [x] Trade journal with Supabase sync
- [x] 14+ education modules (equity, MF, F&O, insurance, etc.)
- [x] PWA (installable, offline-capable, push notifications)
- [x] **Design token system** (92 CSS variables, single source of truth)
- [x] **Premium hover system** (180+ effects, zero-fill vocabulary, `interactions.css/js`)
- [x] **Full light/dark theme** (326 rules, 96-page coverage, FOUC-free)
- [x] Portfolio Analyser accessible from Dashboard quick-access bar

### Should Have (in progress / near-term)

- [ ] Zerodha Kite API live sync — no manual CSV upload
- [ ] Voice agent on all 96 pages (currently 1 dedicated page)
- [ ] Mobile-responsive fixes for voice agent UI
- [ ] Supabase auth on all 96 pages (currently on ~20)

### Could Have (medium-term)

- [ ] SEBI Account Aggregator (Setu/Sahamati) — auto bank sync
- [ ] User benchmarking — "your savings rate vs similar profiles"
- [ ] Custom alert rules ("alert me if Nifty drops 5%")
- [ ] Offline voice agent mode (fully local TTS)
- [ ] WhatsApp bot integration

### Won't Have (this cycle)

- Broker execution (buy/sell via FIN-OS) — regulatory complexity
- React Native mobile app — scope too large for current phase
- Fine-tuned LLM on Indian financial data — dataset curation required
- Multi-user household view — privacy complexity

---

## 6. User Stories

### Voice Agent

- As a user, I want to ask "should I prepay my home loan or invest the extra money?" and get a personalised answer based on my actual loan and portfolio data.
- As a user, I want to speak in Hinglish ("bhai mera SIP kitna hona chahiye?") and get a response in the same language.
- As a user, I want the AI to remember my home loan and child education goal from previous sessions without re-entering this information.
- As a user, I want to upload my Zerodha holdings and ask "which of my stocks should I sell?" and get a specific answer.

### Calculators

- As a user, I want to calculate how much my SIP of ₹10,000/month will grow to in 20 years at 12% CAGR.
- As a user, I want to compare old vs new tax regime with my actual deductions filled in.
- As a user, I want to see the true cost of my car loan (total interest paid, effective annual rate).

### Alerts

- As a user, I want to receive a notification when Nifty drops more than 3% in a day so I can consider buying more.
- As a user, I want to be warned 5 days before my credit card bill is due.
- As a user, I want to be notified when my net worth crosses ₹10 lakhs for the first time.

### Education

- As a first-time investor, I want to understand the difference between term insurance and ULIP in plain language, with Indian numbers.
- As a user, I want to understand why LIC endowment plans are bad through a calculator that shows the comparison.

### Dashboard

- As a user, I want to see my total net worth, savings rate, health score, and FIRE progress as live KPI cards the moment I open the dashboard.
- As a user, I want Arya's AI brief and action items side-by-side so I can see what to do today without scrolling.
- As a user, I want the Portfolio button to route directly to the Portfolio X-Ray tool inside Track Finances.

### Theme & UI

- As a user, I want to switch between dark and light mode on any page without seeing a white flash on load.
- As a user, I want my theme preference to persist across all pages and browser restarts.
- As a user, I want interactive elements to feel premium — depth and glow on hover, not flat colour blocks.

---

## 7. Voice Agent Persona Requirements

**The character:** A brilliant friend who studied finance at IIM, worked at a top fund for 5 years, and still speaks to you like a real person over chai.

**Behavioural requirements:**
1. Never opens with "Sure!", "Great question!", "Of course!" — starts with the answer
2. 2–3 sentences default. Full detail when user explicitly asks.
3. Lead with the answer. Explanation follows. Never bury the answer.
4. Zero markdown in spoken output — pure natural speech
5. Uses user's name when known
6. Calls out bad decisions politely (LIC endowment, F&O, car EMI) with data, not judgment
7. Celebrates good decisions — "That's actually a really smart move"
8. Works in English, Hindi, and Hinglish — detected automatically
9. Injects Indian benchmarks (Nifty 12% CAGR, FD 7%, PPF 7.1%)

---

## 8. Calculator Requirements

Each calculator must:
- Load in < 1 second
- Work offline (no external API calls)
- Show visual output (chart or comparison table), not just numbers
- Include Indian benchmarks as default inputs
- Be mobile-friendly
- Show results on the same page without a redirect
- Use CSS variables from `css/design-tokens.css` — no hardcoded colours
- Adapt to light and dark theme automatically

---

## 9. UI/UX Requirements

### Hover System

All interactive elements must use the zero-fill hover vocabulary (`css/interactions.css`):
- Cards: lift + border-glow + depth shadow (no background fill)
- Navigation: text brightens + icon accent (no fill)
- Buttons: glow ring (no flat fill)
- Tabs/chips: border accent (no fill)

### Theme System

- All pages must include the anti-FOUC inline script as the **first child of `<head>`**
- All pages must include a theme toggle
- All CSS must use `var(--token-name)` — no hardcoded hex colours outside `design-tokens.css` and `theme.css`
- New `<style>` blocks must not contain hardcoded dark colours

---

## 10. Privacy Requirements

- All AI processing (STT, LLM, TTS) runs on user's local machine — speech and financial data never leave the device
- Supabase data protected by RLS — users access only their own rows
- `service_role` keys exist only in backend `.env` files — never in browser code
- Voice session data cleared from RAM on disconnect
- Context stored in `sessionStorage` only (tab-scoped) — never in `localStorage` or sent to external services

---

## 11. Out of Scope

| Feature | Reason |
|---|---|
| Broker execution | Requires SEBI broker license or sub-broker agreement |
| Tax filing (ITR submission) | Requires ClearTax/NSDL API partnership |
| Mutual fund order placement | Requires BSE StarMF or MFU partnership |
| Bank account connection | Requires Account Aggregator license |
| Portfolio management as a service | SEBI RIA registration required |

---

## 12. Dependencies

| Dependency | Risk | Mitigation |
|---|---|---|
| Ollama (local LLM) | Machine needs ~12GB RAM for qwen3:14b | Fall back to qwen2.5:3b (2GB) |
| Edge TTS | Requires internet for TTS | Piper TTS (fully offline) as fallback |
| Supabase | Free tier row limits | Archive old transactions after 12 months |
| Vercel free tier | 100GB bandwidth/month | Static files are small — well within limits |
| yfinance | Rate limits, Yahoo API changes | Cache 15-min; fallback to NSE API |
| Zerodha CSV format | Format may change | Version-detect on upload; alert if parse fails |

---

## 13. Milestones

| Milestone | Status | Date |
|---|---|---|
| Phase 1 — Static frontend + core pages | ✅ Done | April 2026 |
| Phase 2 — Supabase auth + profiles | ✅ Done | April 2026 |
| Phase 3 — Alert engine + health score | ✅ Done | May 2026 |
| Phase 4 — Voice AI v1 (qwen2.5:3b) | ✅ Done | May 2026 |
| Phase 5 — Portfolio Analyser + voice integration | ✅ Done | May 2026 |
| Phase 6 — Upgrade to qwen3:14b | ✅ Done | May 2026 |
| Phase 7 — Full calculator suite (88 tools) | ✅ Done | May 2026 |
| Phase 8 — Dashboard professional redesign | ✅ Done | June 2026 |
| Phase 9 — UI/UX overhaul (hover + theme + 96 pages) | ✅ Done | June 2026 |
| Phase 10 — Kite API live sync | 🔲 Planned | Q3 2026 |
| Phase 11 — Voice on all pages | 🔲 Planned | Q3 2026 |
| Phase 12 — Account Aggregator | 🔲 Planned | Q4 2026 |
