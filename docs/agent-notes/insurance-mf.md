# insurance-mf agent: Insurance Hub (T-15 / M-21) and Mutual Fund Intelligence (T-19)

Worktree: `/Users/vkm/Desktop/Finos/Initial Deployment/.claude/worktrees/agent-ab8e44464a0c8a956`, branch `worktree-agent-ab8e44464a0c8a956`. Nothing committed.

A previous attempt had left the pure libs, three test files and the content JSON in the main tree but no screens, no extraction script and a broken parity test. I reused those (copied, reviewed, tested) and finished the rest.

## What was built

### A. Insurance hub (`/insurance`)
- `mobile/content/insurance/{cover-types,facts,checks}.json` + generated `data.ts`.
  - `cover-types.json` is **parsed from the website** by `mobile/scripts/extract-insurance.py` (layers, headings, taglines, feature lines, stories from `html/insurance-directory.html`; icon / label / colour from `TYPE_META` in `html/insurance-hub.html`). Only the mapping layer -> cover type is curated, in the script.
  - `facts.json` = every figure the website states (21), each with file + line + quote. Hand curated; `--check` re-resolves every quote against the page and fails if the page changed. All `asOf: null`, "Date not stated on the website", `verified: false`.
  - `checks.json` = plain-language questions and definitions written for the app (marked `authoredBy: FIN·OS phone app`); contains no prices, ratios, regulatory limits or insurer names.
- `lib/insuranceHub.ts` (pure): directory filter, cover-type compare (max 3), policy compare (premium per lakh only when both numbers are recorded; "different kinds of cover" note), per-policy checklist answers, follow-ups. `lib/insuranceHubStorage.ts`: answers on this phone only (`finos_insurance_checks_v1`, serialised read-modify-write).
- Screens: `app/insurance/index.tsx` (recorded policies, tracker gaps, what you flagged, directory with search / group / "recorded by me", all facts), `app/insurance/[type].tsx` (what it pays / does not pay, website quotes with line numbers, facts, questions, your policies of that type with Looks fine / Needs a look per question), `app/insurance/compare.tsx`.
- Rules honoured: no insurer or product is named or ranked; no "best"; unknown values are "Not recorded"; every website figure shows its source line and "date not stated".
- Unverifiable data points are listed in `docs/agent-notes/insurance-review.md`.

### B. Mutual fund intelligence (`/funds`)
- Backend used: only `GET /api/mf/search?q&limit` and `GET /api/mf/nav/{code}` (both exist in `arya-ai/server.py`). One optional extra call, `GET /api/mf/history/{code}`, is **requested but does not exist** (see Backend requests); the phone handles its absence.
- `lib/funds.ts` (pure): feed record normalisation (code, name, house, nav, date, plan, option; NAV <= 0 or unreadable becomes null, never 0), Direct/Regular and Growth/IDCW/Bonus reading (feed plan field first, then option text, then name; "not stated" otherwise; conflicting labels flagged), NAV freshness (> 7 days = "may be closed or matured"), name-based type hint (explicitly "not the SEBI category"), search ranking (backend gets the most selective word, phone filters on every word), compare up to 3 with warnings (mixed plan / option / old NAV; "do not compare NAV numbers"), expense-ratio impact, SIP consistency.
- `lib/fundsHistory.ts` (pure): point-to-point returns (1m, 3m, 6m, 1y, 3y, 5y), rolling returns, hypothetical SIP with XIRR (reuses `lib/xirr.ts`). **A return is produced only when the history covers the window**: a NAV must exist within 7 days before the start date and, for rolling, at least 12 observations; for SIP, at least 12 instalments and every instalment must find a NAV. Otherwise the answer is `insufficient` with the reason; a shorter period is never relabelled.
- `lib/fundsClient.ts` / `fundsApi.ts` / `fundsStorage.ts`: network injected (testable), remembered funds (`finos_funds_recent_v1`) so a recently opened fund still shows its last NAV marked with its own date when offline, compare tray (`finos_funds_compare_v1`, max 3).
- Screens: `app/funds/index.tsx` (search, results grouped by scheme with each Direct/Regular x Growth/IDCW version shown separately, recent funds, tools, SIP consistency from your own transactions), `app/funds/[code].tsx` (record, versions, holding if recorded, returns / rolling / SIP when history exists, otherwise a plain "no return is shown" with the reason), `app/funds/compare.tsx`, `app/funds/expense.tsx` (Direct vs Regular: ERs are typed by the person from the factsheet; the feed does not carry them; no pre-filled numbers; assumed return is editable and labelled).
- Honest limits: no returns today (no history endpoint), no expense ratio, no exit load, no portfolio holdings / overlap, no category returns. The website's "category performance" table (hand-typed 3-year returns marked indicative) and "top holdings overlap" are deliberately not ported: hand-typed, undated numbers.

## Parity with the website
- `__tests__/funds.parity.test.mts` executes the real `js/mf-intelligence.js` in a vm with a stub DOM:
  - `expenseImpact` equals the page's `calcExpenseImpact` on 800 random SIPs, exact arithmetic (one assignment is wrapped to read the page's locals) and the printed rupee strings.
  - `sipConsistency` / `sipMonthsFromTransactions` equal `renderSIPCalendar` (percentage, streak, paid cells) on 300 random transaction histories.
- Known website quirks, not ported: (1) the page builds its 12-month list with `setMonth` on today's date, which overflows on the 29th-31st (e.g. 31 Oct - 1 month = 1 Oct), so on those days it can repeat or skip a month; the phone walks from the 1st. The parity test therefore uses days 1-28. (2) the page's `fv` divides by a zero rate (NaN) if gross return equals the ER; unreachable there, handled on the phone (the screen requires gross return above both ERs). (3) the page's "You lose this much" text is printed even if Direct is dearer than Regular; the phone says Direct does not come out ahead.
- `__tests__/fundsHistory.test.mts`: hand-worked values (100 -> 133.1 over 1096 days = 9.9905% a year), window-not-covered refusals, weekend gap allowed / 3-week gap refused, <12 rolling observations refused, flat-NAV SIP returns what was put in, XIRR ~ 0, 11-instalment case, endpoint outcomes (ok, empty, HTTP 404 = not provided, network = offline).
- `__tests__/insuranceHub.test.mts`: data module equals the JSON, `extract-insurance.py --check` passes (JSON is what the script yields from the site today), every quoted line is on the website, no figure claims a date or verification, no ranking words, compare / checklist logic.

## Verification done
- `cd mobile && npm test`: 378 pass, 0 fail. `npx tsc --noEmit`: clean.
- Mutation checks (broke the code, saw the test fail, restored): history gap check; SIP minimum instalments (needed a new test, added); streak off by one (parity); missing `(1+r)` annuity-due factor (parity); Regular/Direct swap in plan reading; accepting unknown checklist answers.
- Expo web preview from this worktree on port 8147 (`npx expo start --web --port 8147`): `scripts/smoke-routes.py` on `/insurance /insurance/health /insurance/ulip /insurance/compare /funds /funds/122639 /funds/compare /funds/expense`: 8 screens x 4 runs, 0 problems. `scripts/theme-audit.py` same routes: 0 low-contrast.
- Playwright (chromium), backend mocked at `localhost:7475`: search -> grouped versions -> open Direct Growth -> returns table + rolling + SIP from a 1,500-point history; open Regular with `/history` 404 -> "No return is shown"; add two to compare -> side-by-side with mixed-plan warning; expense calculator figures; insurance hub with four seeded policies (one of an unknown type) -> flag a question -> appears under "You flagged"; compare two policies (premium per lakh shown only where both numbers exist). Offline (`localhost:7475` aborted): search shows the plain "could not reach" message; short query shows "type at least three letters". Light theme screenshot checked.
- Gotcha for whoever runs this from a worktree: symlinking `mobile/node_modules` breaks Metro's client bundle path (pages render but never hydrate; smoke would still "pass" on static HTML). Use `cp -cR` (APFS clone) of the main `node_modules` instead.
- Scratchpad is shared between agents (another agent overwrote one of my scripts); I used the `imf_` prefix.

## Backend requests (exact)

1. **NAV history** (needed for any return, rolling return or SIP simulation). Not present today.
   ```
   GET /api/mf/history/{scheme_code}
   200 { "scheme_code": "122639",
         "points": [ { "date": "2026-10-13", "nav": 89.5841 }, ... ],   // ascending, one per business day, ISO dates, NAV > 0
         "as_of": "2026-10-13",                                        // date of the last point
         "source": "AMFI" }
   404 / 200 {"error": ...} when unknown
   ```
   Suggested source: `https://api.mfapi.in/mf/{code}` returns `{meta, data:[{date:"dd-mm-yyyy", nav:"..."}]}`, newest first; or AMFI's `DownloadNAVHistoryReport_Po.aspx`. The phone accepts `points` or `data`, ISO or `DD-MM-YYYY` / `DD-Mon-YYYY` dates, drops rows that are not a real date and a positive NAV, keeps the last of duplicate dates, and sorts. Cap the response (for example last 10 years). Cache for a day. This is a new upstream host for the backend, so it should be recorded in the backend's privacy / sources notes; the phone only talks to the user's own backend host (no new host in the app).
2. **Optional**: `GET /api/mf/search` has no `plan`/`option` filter and returns the first `limit` substring matches; the phone asks for 300 and filters. Backend-side word matching (AND across words) and a stable order would cut the payload.
3. **Optional**: include `isin` and SEBI `category` in `/api/mf/nav` if the AMFI file is switched to the scheme-master list; today the phone only offers a name-based hint.

## Shared-file entries needed (I did not edit these)

`mobile/lib/search.ts` -> `SCREENS` (the search-index guard only covers `app/tools` and `app/tracker`, but these make the screens discoverable):
```ts
e('/insurance', 'Insurance hub', 'Cover types, questions to ask, your policies', 'Trackers', 'bima cover directory compare health term critical ulip claim', '🛡️'),
e('/funds', 'Mutual fund search', 'Find a fund, Direct vs Regular, compare', 'Tools', 'mf nav scheme amfi direct regular growth idcw sip compare', '📈'),
e('/funds/expense', 'Direct vs Regular', 'What the expense ratio costs over your years', 'Tools', 'expense ratio ter direct regular commission', '💸'),
```
Entry points (shared screens): a link "Insurance hub" on `app/tracker/insurance.tsx`, and "Find a fund" on the Portfolio / Markets screen or the Track tab. (`app/tracker/insurance.tsx` is not in my area.)

`mobile/.expo/types/router.d.ts`: regenerated by `expo start` (my worktree copy shows as modified; do not add it). New routes: `/insurance`, `/insurance/[type]`, `/insurance/compare`, `/funds`, `/funds/[code]`, `/funds/compare`, `/funds/expense`. Screens use `as any` on router paths so tsc passes before the file is regenerated.

`mobile/lib/privacy.ts`: no new host, no new permission, no analytics. New on-device keys to list in the data inventory if it enumerates keys: `finos_insurance_checks_v1` (checklist answers, never synced), `finos_funds_recent_v1`, `finos_funds_compare_v1`. Fund screens send the scheme name or code the person typed to their own FIN·OS backend (`/api/mf/search`, `/api/mf/nav`), which relays AMFI; the notice should say that a fund search term goes to the backend. The privacy guard test passes unchanged. Both new key groups should ride along in the encrypted backup (`lib/backup.ts`, shared) if it lists keys explicitly.

`mobile/lib/i18nHi.ts`: first-pass Hindi needed for (all screens use English literals today; the Hindi patch leaves them in English until entries exist). Headings and the sentences people read most:
- Insurance hub, Cover types, Compare, Your recorded policies, Gaps your tracker shows, You flagged, What the website says, Figures the website states, Questions to ask, Your policies of this type, Looks fine, Needs a look, Not recorded, None recorded, Date not stated on the website, Not verified by FIN·OS, Pays for, Does not pay for, Recorded by me, Premium per ₹1 lakh of cover.
- Mutual fund search, Compare funds, Direct vs Regular, Search, Latest NAV, NAV of, Returns, Not enough history, No return is shown for this fund, Other versions of this scheme, Plan not stated, Option not stated, Direct, Regular, Growth, IDCW, Your SIP consistency, last 12 months, Estimates for planning, not advice.
- Long explanatory sentences (the "No return is shown" reasons, the compare warnings, the expense calculator caveats) need native review before translation.

## How to run
```
cd mobile
npm test                                  # 378 tests
npx tsc --noEmit
python3 scripts/extract-insurance.py --check   # website still matches the extracted content
python3 scripts/extract-insurance.py           # regenerate cover-types.json + data.ts after editing facts.json / checks.json / the page
npx expo start --web --port 8147               # then:
BASE=http://localhost:8147 python3 scripts/smoke-routes.py /insurance /insurance/health /insurance/compare /funds /funds/122639 /funds/compare /funds/expense
BASE=http://localhost:8147 python3 scripts/theme-audit.py /insurance /insurance/health /insurance/compare /funds /funds/compare /funds/expense
```
(`/funds/122639` needs the backend to show a populated state; with no backend it shows the plain offline card.)

## Known limits and decisions
- Insurance: the hub is a guide, not a directory of insurers; the website has none and none was invented. A real directory is a data-acquisition task (see the review note).
- `facts.json` is curated by hand; if the website text moves, `--check` fails and tells which quote left its line, rather than silently keeping a stale figure.
- The tracker's own gap messages (existing code) repeat unsourced figures; the hub labels them but did not change them.
- Fund search relies on AMFI's file as loaded by the backend; closed schemes drop out of it (shown as "no scheme with that code").
- SIP consistency counts months with an entry; it cannot know whether money really left the bank.
- IDCW funds: point returns ignore payouts, so IDCW returns understate total return; the screen says so.

## Commit

```
git add -- \
  docs/agent-notes/insurance-mf.md docs/agent-notes/insurance-review.md \
  mobile/app/insurance mobile/app/funds \
  mobile/components/InsuranceUI.tsx mobile/components/FundUI.tsx \
  mobile/content/insurance \
  mobile/lib/insuranceHub.ts mobile/lib/insuranceHubStorage.ts \
  mobile/lib/funds.ts mobile/lib/fundsApi.ts mobile/lib/fundsClient.ts mobile/lib/fundsHistory.ts mobile/lib/fundsStorage.ts \
  mobile/scripts/extract-insurance.py \
  mobile/__tests__/insuranceHub.test.mts mobile/__tests__/funds.test.mts mobile/__tests__/funds.parity.test.mts mobile/__tests__/fundsHistory.test.mts

git commit -F - <<'EOF'
Phone app: insurance hub (cover types, questions, compare) and mutual fund search / compare

Insurance hub (/insurance):
- Content extracted from the website's own pages with file + line + quote
  provenance by scripts/extract-insurance.py (--check re-resolves every quote);
  21 website figures kept as statements: "date not stated", "not verified".
- Cover-type directory, per-type page (pays / does not pay, website quotes,
  questions to ask), compare of cover types and of the person's own policies,
  per-policy checklist stored on the phone only. No insurer or product is named
  or ranked; unknown values show "Not recorded".
- docs/agent-notes/insurance-review.md lists every data point that cannot be
  verified from the repo and what the website does not have.

Mutual fund search (/funds):
- Search, detail, compare (up to 3) using only /api/mf/search and /api/mf/nav;
  Direct/Regular and Growth/IDCW always shown, NAV always with its date, old
  NAVs flagged, last-seen record kept for offline use.
- Direct vs Regular expense-ratio impact and SIP consistency, both with parity
  tests that execute js/mf-intelligence.js (800 + 300 random cases).
- Point, rolling and hypothetical-SIP returns from a NAV history, refused with a
  reason unless the history really covers the window; the history endpoint does
  not exist yet, so the screens say so (exact request in the notes).

Tests: 378 pass; tsc clean; smoke + theme audit clean on the new routes.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```
