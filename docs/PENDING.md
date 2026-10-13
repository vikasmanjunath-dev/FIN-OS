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
| 7 | Hindi: remaining PULSE widgets, then the most-visited pages | **Mostly done.** Shared chrome, Home, Dashboard, Tools, Calculators index, Settings, Net worth, Track Finances, Tax calculator, QFT panel and now **all 76 calculators** (labels, headings, slider accessibility labels, "Label: value" results with lakh/crore, canvas chart labels). **Left, on purpose:** the editorial pages (Tax manual, Markets, ~25 learn and detail pages, quiz questions in Hinglish): about 7,000 unique sentences that need a native writer, not a first pass; and the ~20 PULSE widgets' own text |
| 8 | Mobile: Tax Savings Tracker, Future Loss, FD/gold/crypto/credit-score/debt-optimizer trackers, Hindi | **Done except a device build and the share card.** Seven trackers/tools built and parity-tested (see above). **Hindi on mobile:** a language setting (Settings → Language) and a lookup applied to every `<Text>` and placeholder, so no screen was edited; about 1,100 entries cover every screen except Privacy and Terms (legal drafts). Behaviour is tested against the website's engine on 1,389 strings. New screens added later show English until their strings are added: run the app in Hindi and call `window.__finosMissing()` to list them. **Left:** Money Score share card (needs a native image-capture dependency), a device build |
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
- **Credit score tracker invented a score.** It showed and saved 720 / 35% / 2 inquiries as if they were yours, typing 0 turned into a default, and the "Clear delinquencies" tip showed to people with no late payments (the two payment tips were swapped). Now nothing is shown or saved until you enter a score.
- **Gold tracker valued grams with a built-in ₹9,500/g** and wrote that into your net worth. It now waits for a price you type.
- **Crypto tracker** counted an unpriced coin as a 100% loss, netted losses against gains when working out the tax (the page itself says that is not allowed), omitted the 4% cess (31.2%, not 30%) and called a what-if TDS "accumulated".

- **Hindi never applied on any calculator page.** The 76 calculators do not load `pwa-init.js`, which is what starts the translation engine, so a person who chose Hindi saw every calculator in English. `finos-widget.js` (on all of them) now starts it, once, and English visitors still never download it.

- **Calendar showed only 2 upcoming renewals per subscription** for most of each month. `calendarEvents()` caps a subscription at 3 occurrences, and the cap was applied before the calendar dropped anything older than a week, so a passed renewal used up one of the three. The window now starts no earlier than that cut-off (`js/finos-calendar.js`). The matching test was date-dependent and failed from the 13th of any month; it now holds on any day.

## Known quirks (not scheduled)

- `js/i18n/hi.js` is now ~280 KB (about 90 KB gzipped). It loads only for Hindi users and is cached, but it should be split by page group if it grows much more.

- `tests/test_arya_lazy.py` retry test is timing-flaky; `tests/test_pwa_sw.py` periodicsync test is order-dependent.
- `finos_income`, `finos_profile`, `finos_monthly_expense(s)` are duplicate keys with unverified units, deliberately not aliased.
