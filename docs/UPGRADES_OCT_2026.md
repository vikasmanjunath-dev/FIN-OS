# FIN-OS Upgrade Pass — October 2026

Six-stage pass (safety net → architecture → product → Arya → platform quality → security). This file is the map:
what was added, where it lives, how to use it, and what is **not** done.

## 1. Safety net

| Item | Where |
|---|---|
| Static audit (token order/shadowing, links, search coverage, JS syntax, ids, vercel routes, secrets) | `tests/static_audit.py` · `npm run audit` |
| Browser smoke test — every page, both themes, fails on JS errors / 404s | `tests/smoke_pages.py` · `npm run smoke` |
| Real bugs this found and fixed | `cagr.html`/`sip.html` crashed in `arya-ai.js` (`explainCalc`); 3 pages shadowing theme tokens; `life-goals-planner.html` CSS order; broken `simulator-guide` image (404 every load); `/budget` + `/expense-tracker` redirected to an archived folder (live 404s); 22 pages unreachable from search |

## 2. Architecture

| Item | Where | Notes |
|---|---|---|
| Search index that cannot drift | `scripts/build-search-index.js` → `AUTO-INDEX` block in `js/finos-search.js` | audit fails if a page is unindexed |
| Single data layer | `js/finos-store.js` | safe JSON, schema migrations, change events, backup/restore, IndexedDB collections. **Same keys as before** — adopt page by page |
| API client | `js/finos-api.js` | one place for backend URLs (gateway or dev ports), retry GETs only, typed errors. Arya/RAG/Kite/SIP tracker already use it |
| Formatting | `js/finos-format.js` | lakh/crore grouping, `₹1.25 Cr`, `"5L"`→500000, FY labels, Hindi units |
| Gateway | `nginx-gateway.conf`, `gateway/health_aggregator.py`, `docker-compose.yml` | Arya + RAG routes, rate limits (stricter for LLM routes), origin allow-list, aggregated `/health`. **Not** a rewrite of the 9 services (their dependencies conflict) |
| Dev build tooling | `package.json` (no `build` script on purpose — Vercel would run it), `scripts/minify.js` | |

Known duplicate storage keys left **un-merged** because shape/units were not verified: `finos_income` vs `finos_monthly_income`, `finos_profile` vs `finos-profile`, `finos_monthly_expense` vs `finos_monthly_expenses`. Decide per pair, then add to `ALIASES` in `finos-store.js`.

## 3. Product

| Item | Where |
|---|---|
| Monte Carlo retirement engine + "Success Odds" tab (probability, fan chart, "what SIP gets me to 85%") | `js/finos-montecarlo.js`, `finos-retirement-planner.js`, `html/retirement-planner.html` |
| Broker holdings CSV import (Zerodha, Groww, generic) → net worth | `js/finos-import.js`, button on `net-worth.html` |
| Rule-based tax calendar (never expires; was hard-coded to Mar 2027, missing Q1) | `js/finos-taxdates.js` |
| **Budgets**: per-category limits, month status with pace projection (only after day 7), "suggest from my spending", alerts at 80% / on-pace-to-overshoot / over — once per category per level per month. `finos_transactions` is written in **four different shapes** by four features; `normalize()` unifies them and never counts SIPs/investing or income as spending (the voice journal tags SIPs as `type:"income"` — handled) | `js/finos-budget.js`, `js/finos-budget-ui.js` (card on `budget-forecast.html`, one-line strip on the dashboard), reminders + Arya `budget_status` |
| Voice journal root cause fixed: SIPs/savings were recorded as `type:"income"` (shown as "↑ Income"); they are now `type:"saving"`, and money coming in ("received dividend from stock") wins over investing keywords | `js/finos-widget.js`, `tests/test_voice_journal.py` |
| **CAS statement import** (CAMS/KFintech + NSDL/CDSL PDFs): browser dialog → password → your own document-ai service (`POST /parse/cas`, `casparser`) → same preview/apply as the CSV path. Output carries no PAN/e-mail/address; password and file are never stored | `document-ai/cas_import.py`, `document-ai/server.py`, `js/finos-import.js` |
| Reminders: SIP debits, maturities, renewals, goals, tax — in-app, browser notifications, and background via periodic sync | `js/finos-reminders.js`, `sw.js`, Settings → Notifications |
| Calendar bugs fixed | SIP tracker entries (`monthlyAmount`) were skipped entirely; dates shifted a day in IST (`toISOString`) |

## 4. Arya

| Item | Where |
|---|---|
| Tools backed by shared modules: `retirement_odds`, `upcoming_dates`, `tax_dates` | `js/arya-sidebar-panel.js` |
| Safety guardrails (adds a note on buy/sell calls, guarantees, predictions; refuses tax-evasion requests before calling the model) | `js/arya-guardrails.js` |
| PULSE ranked by relevance with "why", plus "since your last visit" | `js/arya-pulse-rank.js` |
| Tool eval against independent maths | `tests/test_arya_tools_eval.py` |

## 5. Platform quality

| Item | Where |
|---|---|
| PWA: PNG + maskable icons, stale-while-revalidate for JS/CSS (**previously cache-first forever — returning users never got updates unless the cache name was bumped by hand**), offline fallback, background reminders, install button | `sw.js`, `manifest.json`, `assets/icons/`, `pwa-init.js` |
| 18 pages that never loaded `pwa-init.js` (net-worth, financial-calendar, insurance-hub, fd-tracker…) now do | |
| Accessibility: axe contrast 596 → 29 nodes (sidebar, drawer, 756 dim-white text rules, muted token, light-theme accent overrides); axe-clean for naming rules; skip link; chart names; label helper | `js/finos-a11y.js`, `css/layout.css`, `css/theme.css`, `design-tokens.css` |
| Mobile (375px): 9 pages scrolled sideways (5 insight pages kept a fixed 260px TOC column, goal rows, onboarding glow layers) → 0 of 207; pages with undersized tap targets 91 → 0 via shared touch-target rules (checkboxes/radios are judged by their label, as users tap them) | `css/insight.css`, `css/interactions.css`, `css/landing.css`, `tests/mobile_check.py` |
| Performance budget gate: JS weight per page (critical = before DOMContentLoaded, total = within 3 s) vs `tests/perf_budget.json`. Today: critical 236–658 KB, total 236–1,193 KB; the 470 KB Arya panel is off the critical path. Adding weight means raising the budget in the same commit (`python3 tests/perf_budget.py --update`) | `tests/perf_budget.py`, `tests/test_perf_budget.py` |
| Light-theme "contrast healer": light mode had ~680 invisible/near-invisible text nodes (dark-first components with white-alpha and neon text). Runtime pass nudges only failing colours (same hue), skips photos/unreadable gradients, reverts on dark, heals late-rendered UI. 683 → 12 nodes | `js/finos-contrast.js` (loaded by `pwa-init.js`; ~11 ms on a 1,500-element page). Real fix is still per-component CSS |
| Performance: Arya panel (470 KB ≈ half of all JS) lazy-loaded; DOMContentLoaded −36% under 4× CPU + slow 4G | `js/arya-lazy.js` |
| Hindi UI (shared vocabulary), Hindi lakh/crore units, language picker in Settings | `js/finos-i18n.js`, `js/i18n/hi.js` |

## 6. Security & privacy

| Item | Where |
|---|---|
| Optional passcode lock — AES-256-GCM, PBKDF2-SHA256 600k; verify-before-wipe; page halted while locked; multi-tab; idle lock; erase path | `js/finos-vault.js`, `js/finos-vault-boot.js` (first script in every app page's `<head>`) |
| Encrypted backups (passphrase) | Settings → Data & Privacy |
| CSP: `object-src 'none'`, `manifest-src 'self'`; Permissions-Policy `browsing-topics=()` | `vercel.json` |
| Secrets scan in CI | `static_audit.py secrets` |
| CSP conformance: serves every page with the production policy from `vercel.json` and reports violations (local dev sends no CSP, so breakages only appeared on Vercel) | `python3 tests/csp_check.py [--drop unsafe-eval]` |
| Dependencies: `python-multipart` 0.0.20→0.0.31 and `python-dotenv` 1.0.1→1.2.2 in `rag-engine` | see `requirements.txt` |

### Vault: what it does *not* do (shown to users too)
- While unlocked, data is plain browser storage (as before). Closing a tab without locking doesn't encrypt; idle auto-lock / "Lock now" do.
- A forgotten passcode cannot be recovered. The only way back in is "Erase".
- Not protection against malware / malicious extensions on an unlocked session.
- Does not cover the self-contained sub-apps (`Porfolio Analyser`, `TradeJournal`, `voiceagent`) or the `sb-*` Supabase session token.

## CI
`.github/workflows/ci.yml` runs the safety net automatically: **fast** (static audits, search-index freshness, JS unit tests, backend + CAS pytest) and **browser** (PWA/service worker, vault, axe a11y, i18n, lazy panel, budgets, voice journal, CAS dialog, CSP subset) on every push and PR; **nightly** at 03:00 IST runs the full-site smoke test (both themes) and the full CSP crawl. The workflow could not be executed from the dev machine — its commands were run locally, but the first real run on GitHub may need small adjustments (watch the browser job's apt/Playwright step). Mark the `fast` and `browser` jobs as required checks in the repo's branch protection to enforce them.

## Not done / follow-ups
- **CAS PDF import is built but unverified against a real statement.** Mapping is tested against `casparser`'s real model classes and the endpoint/dialog are tested with the parser stubbed, but no genuine CAS PDF was available. Try one of yours (`pip install -r document-ai/requirements.txt`, run document-ai, import) and report layouts that fail.
- Budgets are browser-local (`finos_budgets`). The alert-engine's server-side `BUDGET_OVERRUN` rule reads Supabase data and doesn't see them; syncing is a later step. Entries logged before the voice-journal fix may still carry `type:"income"` for SIPs; budgets handle both.
- **`torch` / `sentence-transformers` upgraded in `rag-engine/requirements.txt` (Oct 4 2026): torch 2.5.1 → 2.13.0, sentence-transformers 3.3.1 → 5.6.0, pytest 8.3.4 → 9.0.3 — `pip-audit` now reports 0 advisories.** Checked before pinning: reranker scores match the old stack to 1e-6 and NLI logits to 4e-6 (identical rankings/labels), and the real `retrieval.reranker`, `generation.faithfulness` and `server` import and run on the new stack (including `device=mps`). Embeddings come from Ollama, so they don't change. **Not done:** the live `rag-engine/.venv` is still on the old versions (run `pip install -r requirements.txt` in it), and the 90% `rag-engine/evaluation` benchmark was not re-run because it needs the full live stack (Qdrant, Redis, Ollama).
- **CSP still allows `'unsafe-inline'` scripts** (`'unsafe-eval'` **was removed**; no first-party `eval`/`new Function`, and all pages load violation-free under the strict policy — if a lazy third-party feature ever breaks with a CSP error mentioning `eval`, re-add it to `vercel.json` and run `tests/csp_check.py`). Also fixed: `cdnjs.cloudflare.com` was missing from `style-src`/`font-src`, so Font Awesome icons were blocked on 5 pages in production.
  **Measured scope of removing `'unsafe-inline'` (Oct 4 2026):** 211 pages; **426 inline `<script>` blocks (1.1 MB, 215 unique)**; **696 static inline handlers** (`onclick=` etc.; worst: `trading-brain` 68, `settings` 65, `hedgefund` 33); plus **~363 handlers written inside JavaScript strings** (314 in 55 external files — `TradeJournal/upgrades.js` 60, `TradeJournal/app.js` 25, `js/finos-sip-tracker.js` 12 … — and 49 inside inline blocks). No `javascript:` URLs. A static codemod can cover the first two groups (move each block to a file, turn each handler into a generated listener via a `data-h` id); the JS-string handlers need hand conversion to delegated `data-action` listeners. Suggested order: (1) codemod on a clean tree, verified by `smoke_pages.py` + `csp_check.py --drop unsafe-inline`; (2) convert JS-string handlers module by module; (3) enforce. Not started because other work was uncommitted across most pages.
- `News1` had 11 npm advisories (6 high); `npm audit fix` (lockfile only, no `package.json` change) brought it to **2** (1 low esbuild dev-server issue that only affects Windows, 1 moderate nested `qs`; npm says a fix exists but doesn't apply it). `tsc --noEmit` and `vite build` pass before and after. Not part of the live site.
- **Hindi** is a first-pass vocabulary (≈150 strings) — needs a native-speaker review; other regional languages need only a `js/i18n/<code>.js` file.
- Remaining contrast failures (axe: 29 nodes; healer: 12 text nodes on a couple of Tailwind-built simulator pages) are one-off pairs. Ceiling enforced in `test_a11y.py`; lower it as you fix. Note axe cannot see text over gradients — use the detector approach (computed colour vs composited background) for those.
- `arya-sidebar-panel.js` is still one 8k-line file — **measured Oct 4 2026 and deliberately not split:** fetching + parsing + running all 480 KB costs **~12 ms on a normal CPU and ~35 ms at 4× CPU throttle**, and only when the panel is first opened (it's lazy-loaded by `arya-lazy.js`). Splitting the 26 PULSE builders would save a fraction of that while requiring the widgets' shared private helpers to be exposed and ~26 untested widgets re-wired. Revisit only if a profile shows the panel open is slow, or if you want the file smaller for maintainability rather than speed.
- The "season/mood" logic mentioned in older notes (`detect_mood`, `budget_season`) is **not present** in the current `voiceagent/agent.py`; no regression test could be written for it.
