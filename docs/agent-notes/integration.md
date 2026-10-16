# Integration of the shared mobile files (Oct 15 2026)

Inputs: `_BRIEF.md`, `learn.md`, `insurance-mf.md`, `arya-pulse.md`, `market-data.md`, `trust-platform.md`, `planners.md`
(+ `planners-hindi-missing.json`), `release-pack.md`. Nothing was committed, staged or pushed.

## Verification

| Check | Result |
| --- | --- |
| `cd mobile && npx tsc --noEmit` | clean |
| `npm test` excluding `__tests__/corruptData.test.mts` | **676 tests, 676 pass, 0 fail** (665 before this pass + 11 new) |
| `npm test` including `corruptData.test.mts` | 741 tests, 710 pass, **31 fail, all in `corruptData.test.mts`** |
| `scripts/smoke-routes.py /dashboard /markets /settings /tools/calendar /plan/mydates /tools/report /search /privacy` (Metro on :8131, stopped afterwards) | 8 screens x 4 runs, 0 problems |
| Playwright on `/tools/calendar` with a stored monthly custom date | the date shows on the grid's coming-up list with its pin, amount, "repeats every month" and note |

`corruptData.test.mts` is a new file from another agent (created 07:51 today, after the 665/0 baseline). It fuzzes every storage
reader and fails for 30 readers (pre-existing "storage read throws" and `1e999` ids), plus one aggregate test. `loadCalendarSources`
is one of them; the two failures it reports there (`sip[0].id = Infinity`, a throwing `multiGet`) are in code that was already
there, not in the custom-date read I added (`loadCustomEvents` is wrapped and returns `[]`). Left for that agent.

## Applied

**`mobile/lib/search.ts`** (+ `__tests__/search.test.mts`): `/learn` and one entry per lesson in the bundled manifest (25),
`/pulse`, `/pulse/memory`, `/pulse/life`, `/insurance`, `/funds`, `/funds/expense`, `/market` and its five sub-screens, the six
`/plan/*` screens, `/feedback`, `/diagnostics`, `/onboarding/welcome`. The guard test now resolves dynamic routes
(`[id].tsx`, `[symbol].tsx`, route groups) instead of only literal files, and a new test fails if the lesson entries drift from
`content/learn/manifest.json` (id, title, summary). The lesson list is hand-kept in `search.ts` because `learnContent.ts` uses
`require` and cannot be imported under Node.

**`mobile/lib/privacy.ts`** (+ `__tests__/privacy.test.mts`):
- `arya` flow rewritten: fund-name search words and scheme codes go to the backend; the question as typed; each context figure only
  when recorded and while "figures" is on; memory notes/topics and life events only when switched on there (off by default); "What
  Arya remembers" shows exactly what is sent and the online model can be switched off; a short question about your own figures is
  answered on the phone; providers now include mfapi.in (scheme code only), Yahoo company data and news feeds; the last answers are
  kept on the phone and can be cleared.
- New flow `news-links` (kind `link`): "Read the article" opens the publisher's page in the in-app browser. A test fails if anything
  else opens a web page.
- `PERMISSIONS` now also lists Vibration and Run at start-up (VIBRATE, RECEIVE_BOOT_COMPLETED; USE_FINGERPRINT is covered by the
  existing fingerprint line). The test reads each library's `AndroidManifest.xml` so the claim cannot go stale.
- `DATA_ITEMS`: learn, Arya memory/life/prefs, PULSE snapshot, insurance checks, funds recent/compare, `marketcache_v1_index`,
  couple, custom calendar dates, planner drafts and the derived goal keys. A new test checks that a label saying "never synced" is
  not a sync key, one saying "syncs" is, and "not exported or backed up" is not a backup key.
- Unchanged and still true: the `reports` flow, the Google sign-in wording, `NOT_DOING`, "Draft for legal review" on terms, `ENTITY`
  empty. `app/privacy.tsx` needed no change (it renders the registry).

**`mobile/lib/storageKeys.ts`**: `/^finos-calendar-.*\.ics$/` added to `TEMP_FILE_PATTERNS`. No other registry entry was needed: the
four Arya keys are `finos_*` and are exported, backed up and erased with the rest (`store.clear()`), as their note says.

**`mobile/lib/calendar.ts`, `reminders.ts`, `calendarStorage.ts`** (+ `calendar.parity.test.mts`, `reminders.test.mts`): event type
`custom` ("Your date", pin icon) on the grid, coming-up list and monthly summary code paths; `Sources.custom` is read by
`loadCalendarSources` and passed through `normaliseCustom` so junk is tolerated; reminder lead 3 days, label "Your date", text hidden
by default like every type. With no custom dates the website-parity output is identical (asserted). Two consequences handled:
- `app/plan/mydates.tsx` no longer appends its own copy of the custom dates to the .ics export (`collectEvents` carries them now).
- `app/tools/report.tsx` filters `custom` out of "Coming up", because that report is meant to be shared and a title is the person's
  own free text. `app/tools/calendar.tsx` gained a link to Your dates and a bullet saying what they are.

**`mobile/app.json` / `package.json` / `package-lock.json`**: `android.allowBackup: false` was already present (from the release
pack); `expo-av` removed after grepping `app lib components hooks scripts __tests__` (only config and a tolerant guard mentioned it)
from `package.json`, the `app.json` plugin list and `package-lock.json` (edited as JSON, no install run, `node_modules` untouched).
The privacy test still tolerates it coming back, with the microphone off.

**`mobile/lib/i18nHi.ts`**: 221 first-pass entries: the Learn, trust, market and insurance/funds strings from the notes (including
the upper-case variants where a screen renders a heading in capitals and the full on-screen sentences), all 121 strings of
`planners-hindi-missing.json`, and the new Settings/calendar strings. The block is marked as unreviewed. Not translated on purpose:
"NAV of {date}" (date inside), and the long insurance/fund explanatory sentences the notes asked to leave for a native pass.
`i18n.parity.test.mts` (app lookup equals the website's) passes.

**`app/(tabs)/dashboard.tsx`**: a "Plan, Learn & Research" section: Learn (subtitle "{done} of {total} lessons" from the bundled
manifest and `finos_learned_modules`), PULSE, Spending forecast, Life goals, Growth projection, Couple finance, Benchmarks,
Insurance hub, Mutual funds, Market research. **`(tabs)/markets.tsx`**: a Mutual fund search link next to the existing Market
research link. **`settings.tsx`**: an "Arya, PULSE and your dates" group (What Arya remembers, PULSE, Your dates) and the About line
reads the version from `expo-constants` via `lib/appInfo.ts` instead of the hard-coded "v1.0.0".

**`mobile/.expo/types/router.d.ts`**: already contained every new route (`/learn`, `/insurance`, `/funds`, `/market/*`, `/plan/*`,
`/pulse*`, `/security`, `/alerts`, `/feedback`, `/diagnostics`, `/onboarding/welcome`); a Metro start on :8131 left it unchanged.

**Docs**: `mobile/README.md`, `docs/MOBILE_APP.md` (status, screens, module rows, calendar/reminders rows, permissions, never-synced
list, new storage keys, Learning pillar divergence row, test count), `docs/PENDING.md` (U7-U12, rows 13-16, date).

**`docs/MOBILE_PARITY_TRACKER.xlsx`** (openpyxl; formatting, validations, formulas and conditional formats verified unchanged; 48
rows touched, Status/Notes/Updated only):
- Learn: L-01..L-21 and L-23 Done; L-22, L-24, L-25 Partial; L-41 Not planned. T-36 note only (status was already Done).
- Planners: T-01, T-02, T-10, T-18, T-38, T-39 Done.
- Market: M-04, M-06, M-19 Done; M-05, M-07, M-08, M-09, M-15 Partial; M-10..M-13 untouched.
- Derived from the notes' title/table rather than a status the note spelled out (revert if you disagree): T-15 Done, M-21 Done,
  T-19 Partial; R-13 Partial, P-11 Done, P-08 Done, P-10 Partial.
- Not changed: R-06 and R-10 (still depend on running the SQL and a device); no Build log row was added.

## Where notes disagreed or a request would have made the notice untrue

1. **"Never synced" claims.** `insurance-mf.md` says `finos_insurance_checks_v1` is never synced, and `learn.md` treats
   `finos_learn_opened` as device-only. Both are ordinary `finos_` keys and tracker sync uploads them (checked with `isSyncKey`),
   as it does `finos_funds_recent_v1`, `finos_funds_compare_v1` and `finos_pulse_snapshot`. The inventory labels them "syncs like your
   other tracker data if you sign in". If you want them on the phone only, add them to `NEVER_EXACT` in `lib/trackerSync.ts` (and
   the website twin) and flip the labels; the new test will tell you which labels are then wrong (PENDING U11).
2. **Couple data "kept only on this phone".** It is excluded from sync but is in your own export and encrypted backup, so the label
   says exactly that.
3. **Market cache.** `marketcache_v1:*` is not exported or backed up and is erased by "Delete everything"; the inventory lists
   the index key with that wording. The note offered this as optional; it is included because the cache holds the symbols you looked at.
4. **Website fixed the Knowledge pillar read** (`js/finos-health-score.js`, uncommitted, another agent): `learn.test.mts` pinned the
   old divergence and failed. The golden test now extracts the new formula, and the "documented divergence" test became a test that
   the website and the phone agree on the object shape. The comment above `learnedCount` in `lib/learn.ts` still describes the old
   bug; it is outside this pass's files.
5. **Release pack finding 5** (extra permissions) was accepted rather than the notice being left short. Finding 10 (`allowBackup`)
   is already in `app.json`.

## Not applied, and why

- Cross links on screens outside the owned list: Budget -> Forecast, Goals -> Life goals planner, Portfolio -> Growth, Insurance
  tracker -> Insurance hub, Watchlist / Portfolio rows -> `/market/stock/<symbol>` and `/market/fund/<code>`, and
  `<FeedbackPrompt topic="money-score" .../>` on the Money Score result. The dashboard tiles and search reach all of these screens.
- `supabase/delete_account.sql`: `trust-platform` changed it and `release-pack` proposes a replacement
  (`mobile/scripts/release-sql/delete_account_complete.sql`); the two should be compared and run once (PENDING U9). `supabase/README.md`
  corrections and the `voiceagent/schema.sql` / `alerts/schema.sql` warnings are not applied (not in my list); recorded in PENDING row 14.
- Optional hardening: `finos_sync_never_couple_v1` in `NEVER_EXACT` (already excluded by the `finos_sync_` prefix, and a test asserts it).
- Arya status rows (A-02 PULSE, A-05 agent tools, A-06 memory/life events): `arya-pulse.md` names no tracker IDs, so nothing was
  applied. By its own table I would set A-02 Partial (14 of 27 sections), A-05 Partial, A-06 Done.
- Website changes recommended by the notes (feedback redact rules, `news.html` placeholder headlines, `arya-sidebar-panel.js`
  commodity key): recorded in PENDING row 14.
- Hindi for the long insurance/fund/market sentences and for new strings added after the notes were written.

## Needs your decision

- Whether the keys in item 1 above should stay on the phone.
- Whether deleting a couple link should also delete the partner's shared goals (`delete_account.sql`).
- Hosting for a store build (PENDING U8): without an HTTPS backend, fund search, market research and Arya chat show their offline states.
- Operator, grievance officer and public URLs (U7); native Hindi review (U10).
- Whether to keep the derived tracker statuses listed above.

## Commit (shared files; run yourself)

Several of these files also carry other agents' uncommitted edits (`privacy.ts`, `settings.tsx`, `app.json`, `markets.tsx`,
`dashboard.tsx`, `package*.json`, `router.d.ts`). Commit the trust-platform, release-pack and market-data work first, or in the
same commit, so this one does not carry half-described changes.

```
git add -- \
  mobile/lib/search.ts mobile/lib/privacy.ts mobile/lib/i18nHi.ts mobile/lib/storageKeys.ts \
  mobile/lib/calendar.ts mobile/lib/reminders.ts mobile/lib/calendarStorage.ts \
  "mobile/app/(tabs)/dashboard.tsx" "mobile/app/(tabs)/markets.tsx" mobile/app/settings.tsx \
  mobile/app/tools/calendar.tsx mobile/app/tools/report.tsx mobile/app/plan/mydates.tsx \
  mobile/app.json mobile/package.json mobile/package-lock.json mobile/.expo/types/router.d.ts \
  mobile/__tests__/search.test.mts mobile/__tests__/privacy.test.mts mobile/__tests__/calendar.parity.test.mts \
  mobile/__tests__/reminders.test.mts mobile/__tests__/learn.test.mts \
  mobile/README.md docs/MOBILE_APP.md docs/PENDING.md docs/MOBILE_PARITY_TRACKER.xlsx \
  docs/agent-notes/integration.md

git commit -F - <<'EOF'
Integrate the October mobile features into the shared files

- Search: Learn (hub + 25 lessons), PULSE, insurance hub, funds, market research, planners,
  feedback, diagnostics, welcome tour; the index guard now resolves dynamic routes and checks
  the lesson entries against the bundled manifest.
- Privacy notice: Arya flow describes memory/life-event context, fund search terms and the new
  providers; news-link flow; Vibration and run-at-start-up permissions (read from library
  manifests by a test); data inventory for the new keys with sync wording checked by a test.
- Calendar and reminders: the person's own dates are a "custom" event type (grid, coming-up,
  reminders; hidden text by default; kept out of the shareable report; one .ics copy).
- Hindi: first-pass entries for the new screens, marked as unreviewed.
- Dashboard "Plan, Learn & Research" tiles, market and settings links, real app version.
- Remove unused expo-av; cache-file pattern for the calendar export; learn test follows the
  website's fixed Knowledge-pillar read.
- Docs and parity tracker updated.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```
