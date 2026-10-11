# Pending work, in order

Last updated: 2026-10-11. This is the working list: each item has a status. Items under "Needs you" cannot be done from the code side.

## Needs you (blocked on access, a decision or a person)

| # | Item | What is needed |
|---|---|---|
| U1 | **Supabase row-level security (urgent).** `profiles` had RLS off: rows were readable with the public anon key | Run `supabase/profiles_rls.sql` in the Supabase SQL editor, then `core_tables.sql`, `holdings.sql`, `tracker_snapshot.sql`; do a real sign-in test on web and mobile; restart the `arya-ai` backend (its key was fixed) |
| U2 | Privacy and terms are drafts | Counsel review; operator name, address and grievance officer details (shown as "Not set yet") |
| U3 | Feedback inbox | Decide the endpoint and host; then add its host to `js/finos-privacy.js` FLOWS, set `FinosFeedback.CONFIG.endpoint`, write a retention rule and a reply policy |
| U4 | Account Aggregator | Provider partnership, a backend to hold credentials and decrypt. `LIVE_ENABLED` stays false until then |
| U5 | Hindi wording | A fluent speaker should review `js/i18n/hi.js` (about 600 entries) before a wide release |
| U6 | Mobile on a device | EAS build config, a real device test of the file picker and sign-in |

## Build order

| # | Item | Status |
|---|---|---|
| 1 | JS perf budget failing on clean HEAD | **Done.** The search index (50 KB) moved to `js/finos-search-index.js`, loaded on first use. Every page is 40–60 KB lighter; budgets tightened |
| 2 | Group the ~300 uncommitted files from other sessions into reviewable commits | **Done (tooling).** `python3 scripts/group-uncommitted.py` prints the groups and which files need review; SQLite runtime files are now git-ignored (`git rm --cached` for the two tracked ones is yours to run). Committing is yours |
| 3 | NPS tracker uses a user-chosen marginal rate, not `FinosTaxCore` | **Done.** With an annual income (field, or tracked monthly income x 12) the saving is the real drop in tax for the chosen regime; the slab estimate remains only when income is unknown. `tests/test_nps_tax.py` |
| 4 | Statement import: broker and insurer debits land in "Other" | **Done for brokers, funds, NPS/PPF** (now 'Savings & Investments', not spending; also mirrored in the mobile port). Insurance premiums stay 'Other' on purpose: the budget has no insurance category |
| 5 | Budget-overrun alerts | **Already built** (`FinosBudget.alertEvents` feeds the reminders; `tests/budget.test.js`, `tests/test_budget_ui.py`). The old note was out of date |
| 6 | `trading-brain.html` fetches through the public relay `api.allorigins.win` | **Done.** Prices come from the Arya backend (`GET /api/chart`); the relay runs only if the person switched on the new `relay` consent. `tests/test_chart_endpoint.py`, `tests/test_trading_brain_relay.py` |
| 7 | Hindi: remaining PULSE widgets, then the most-visited pages | **Partly done.** Shared chrome (nav, alerts, quick expense, search), Home, Dashboard, Tools, Calculators, Settings, Net worth, Track Finances are translated (+~750 entries). Also fixed: settings.html never applied the saved language, and textarea placeholders were never translated. **Left:** Tax (~800 strings), Markets (~270), the other ~100 pages, and ~20 PULSE widgets |
| 8 | Mobile: Tax Savings Tracker, Future Loss, FD/gold/crypto/credit-score/debt-optimizer trackers, Hindi | **Partly done.** Built, parity-tested against the website and checked in the web preview: Tax savings (`app/tools/tax.tsx`), Future loss (`app/tools/leak.tsx`), Deposits & fixed income (`app/tracker/fixed.tsx`). 88 mobile tests. **Left:** gold, crypto, credit-score and debt-optimizer trackers; Hindi on mobile; the Money Score share card; a device build |
| 9 | CAS PDF import; PDF and credit-card statements; MF and other AA data types | **CAS import already exists** (`finos-import.js` → the local parser; `tests/test_cas_import.py`). **Not built, on purpose:** PDF bank statements, credit-card statements and MF/AA data types need real sample files to validate against, and the importer's rule is to skip a row rather than guess. Send a few redacted statements and this becomes a half-day job. Credit-card statements also need a double-counting rule against the bank-account bill payment |
| 10 | Hardening: remove CSP `unsafe-inline`; torch/sentence-transformers advisories (needs a RAG eval) | **Assessed, not done.** A strict CSP would have to remove 439 inline `<script>` blocks, 699 inline `on*=` handlers (plus those generated from JS) and 2,340 `style=` attributes across 215 pages; hashes do not cover event handlers. That is a refactor, not a fix. The torch/sentence-transformers upgrade needs the RAG evaluation run on a machine with the models (`docs/RAG_EVALUATION.md`) |
| 11 | Design system: move `.tool-card`/`.suite-card`/`.calc-card` onto the canonical `.card` | **Not started.** Visual regression risk across ~100 pages with no screenshot baseline; needs one before it is safe |
| 12 | Guided first-run flow beyond the Money Score invitation | **Judged covered:** Home's "Your Action Items", the DNA onboarding and the Money Score invitation already walk a new person through. A checklist with progress is a product decision, not a gap |

## Found and fixed along the way

- The saved language was never applied on `settings.html` (it includes the translation engine itself, so the loader skipped `init()`).
- Textarea placeholders were never translated (the engine skipped the whole element).
- `insight-cards.js` put an unescaped quote in an `aria-label`, truncating the accessible name of the "₹500 SIP … more income" card.
- The RD calculator on the Fixed-income tracker returned NaN at a 0% rate (same bug class as the calculators fixed on Oct 3).
- SQLite runtime files (`arya.db-shm/-wal`) are tracked by git and change on every backend run: `git rm --cached` them.

## Known quirks (not scheduled)

- `tests/test_arya_lazy.py` retry test is timing-flaky; `tests/test_pwa_sw.py` periodicsync test is order-dependent.
- `finos_income`, `finos_profile`, `finos_monthly_expense(s)` are duplicate keys with unverified units, deliberately not aliased.
