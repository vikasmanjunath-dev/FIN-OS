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
| Accessibility: contrast 596 → ~100 nodes (sidebar, drawer, 756 dim-white text rules, muted token); axe-clean for naming rules; skip link; chart names; label helper | `js/finos-a11y.js`, `css/layout.css`, `design-tokens.css` |
| Performance: Arya panel (470 KB ≈ half of all JS) lazy-loaded; DOMContentLoaded −36% under 4× CPU + slow 4G | `js/arya-lazy.js` |
| Hindi UI (shared vocabulary), Hindi lakh/crore units, language picker in Settings | `js/finos-i18n.js`, `js/i18n/hi.js` |

## 6. Security & privacy

| Item | Where |
|---|---|
| Optional passcode lock — AES-256-GCM, PBKDF2-SHA256 600k; verify-before-wipe; page halted while locked; multi-tab; idle lock; erase path | `js/finos-vault.js`, `js/finos-vault-boot.js` (first script in every app page's `<head>`) |
| Encrypted backups (passphrase) | Settings → Data & Privacy |
| CSP: `object-src 'none'`, `manifest-src 'self'`; Permissions-Policy `browsing-topics=()` | `vercel.json` |
| Secrets scan in CI | `static_audit.py secrets` |
| Dependencies: `python-multipart` 0.0.20→0.0.31 and `python-dotenv` 1.0.1→1.2.2 in `rag-engine` | see `requirements.txt` |

### Vault: what it does *not* do (shown to users too)
- While unlocked, data is plain browser storage (as before). Closing a tab without locking doesn't encrypt; idle auto-lock / "Lock now" do.
- A forgotten passcode cannot be recovered. The only way back in is "Erase".
- Not protection against malware / malicious extensions on an unlocked session.
- Does not cover the self-contained sub-apps (`Porfolio Analyser`, `TradeJournal`, `voiceagent`) or the `sb-*` Supabase session token.

## Not done / follow-ups
- **CAS (CAMS/KFintech) PDF import** — only CSV holdings import exists. PDF needs a server-side parser (e.g. `casparser`) and real samples to test.
- **Budget-overrun alerts** — needs a defined budget model; reminders cover dated events only.
- **`torch` 2.5.1 / `sentence-transformers` 3.3.1** have known advisories (22 / 1). Upgrade together on a branch and re-run `rag-engine/evaluation`.
- **CSP still allows `'unsafe-inline'`/`'unsafe-eval'` scripts** — removing them means moving every inline script to files or nonces (~hundreds of blocks).
- `News1` has 11 npm advisories (6 high); not part of the live site.
- **Hindi** is a first-pass vocabulary (≈150 strings) — needs a native-speaker review; other regional languages need only a `js/i18n/<code>.js` file.
- Remaining contrast failures are a long tail of one-off colour pairs, mostly light-theme (ceiling enforced in `test_a11y.py`; lower it as you fix).
- `arya-sidebar-panel.js` is still one 8k-line file; splitting its 26 PULSE builders into modules would let them load on demand.
- The "season/mood" logic mentioned in older notes (`detect_mood`, `budget_season`) is **not present** in the current `voiceagent/agent.py`; no regression test could be written for it.
