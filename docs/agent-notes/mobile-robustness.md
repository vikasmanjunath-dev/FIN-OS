# Mobile robustness pass: stored and received data of the wrong shape

Scope: every AsyncStorage / SecureStore reader, every backend-response normaliser, the backup restore path and the cloud-sync receive path
in `mobile/`. Goal: a value of the wrong shape (null, string, number, array where an object belongs and the reverse, nested wrong types,
NaN / Infinity / negatives, very long strings, JSON that does not parse) never crashes a screen, never turns into NaN on screen, and a failed
read is never saved over the person's data.

## Status

`npx tsc --noEmit` clean. `npm test`: 846 tests, 845 pass; the one failure is `insuranceHub.test.mts` "committed JSON is what the extraction script
produces" (`extract-insurance.py` KeyError 'heading', another agent's area). `__tests__/corruptData.test.mts`: 170/170. `smoke-routes.py` on 14 screens
that use the changed hooks/stores: 0 problems (Metro on port 8137, stopped afterwards). Corrupt-data web smoke over every route x 5 corrupt
variants: 0 problems.

## What was built

* `mobile/lib/safeStore.ts` (new): `parseJSON` (never throws; rejects overflow numbers such as `1e999` and nesting deeper than 64),
  `asList` / `asRecord`, `finite` / `positive` / `text`, `flatRecord` / `scalarsOnly`, `getMany` / `getText` (a storage failure reads as
  "absent", never throws) and `keepIfUnreadable(key, expect)`: before a writer replaces a value it could not read as the expected kind, the
  old text is kept under `finos_sync_never_corrupt_<key>`.
* `mobile/lib/keyShapes.ts` (new): the top-level kind (list / object) of the structured keys, and a size cap. Used by the backup restore and
  the cloud-sync pull so a wrong-kind value is refused at the door.
* `mobile/__tests__/corruptData.test.mts` (new, 170 tests, 15-45 s depending on machine load) with `helpers/corpus.mts` and three Node stubs
  (`stubs/react-native.mjs`, `expo-constants.mjs`, `empty.mjs`, registered in `alias-hooks.mjs`) so modules that import `Platform` /
  `AppState` / the Supabase client can be loaded under Node:
  1. 62 storage readers x ~75 corrupt raw values (`rawCorpus`): no throw, expected shape, no NaN/Infinity, **no write at all** (the only
     allowed writer is `loadArFacts`, which stores the net worth for the milestone alert, and the test asserts it never writes garbage).
     Also storage that throws on read.
  2. "One damaged field at a time": realistic valid data under 37 keys, every field (3 levels deep) replaced by 11 wrong values, every
     reader re-run; the result is compared with the valid result for type drift (string became number, ...), checked for NaN/Infinity, and
     fed to its consumer (`totals`, `summarize`, `collectEvents`, `computeAll`, `compute`, `buildFeed`, ...).
  3. 65 pure normalisers / parsers (the backend-response normalisers in `lib/marketData.ts`, `parseLog`, `normaliseCustom`, ...) x ~170
     damaged values.
  4. Backup restore: 16 hostile / damaged files each refused with a message and **zero writes**; a restore that fails half-way is undone.
  5. Cloud sync: wrong-kind cloud values are not taken, damaged `finos_tracker_sync_meta` does not stop sync.
  6. Writers (14): an unreadable stored value is kept aside before it is replaced; a writer does nothing when storage cannot be read.
* Mutation checks done (break the code, see the test fail, restore): removed `keepIfUnreadable` from the ledger writer, removed the backup
  shape check, removed the crypto quantity coercion, removed the sync shape filter. All four were caught.

## Defects found and fixed

| # | File | Input | Symptom (before) |
|---|------|-------|------------------|
| 1 | `lib/holdingsStore.ts` `init` | `finos_holdings_v1` valid JSON but an object / string / list of junk | `state.holdings` was not an array: the Portfolio tab and Money Score crashed on `.map` / `.reduce`; elements with string units gave NaN value |
| 2 | `lib/holdingsStore.ts` `init` | corrupt tombstones key | holdings were also dropped (one try block for both) and the next edit wrote `[]` over the real list |
| 3 | `lib/holdingsStore.ts` `refreshPrices` | backend quote `price: "abc"` / `nav: "x"` / `quotes: {}` | NaN or a string stored as `lastPrice` and written to storage; `for ... of` on a non-list |
| 4 | `lib/holdings.ts` `fromRemote`/`planSync` | cloud row that is null / has object symbol / negative units / `updated_at: "x"` | TypeError during sync; NaN `updatedAt` comparisons |
| 5 | `lib/backup.ts` `restoreBackup` | list under an object key, unparseable text under a list key, 5 MB value, 300-char key, 3500 keys | written as is (later read as "nothing" and replaced); a storage failure half-way left a partial restore. Now all-or-nothing with a plain message, rollback on failure |
| 6 | `lib/trackerSyncEngine.ts` | `finos_tracker_sync_meta` = `{"conflicts":{}}` / string / list; cloud value of the wrong kind | meta object spread threw: **sync broke permanently**; a cloud string under a list key overwrote the local list |
| 7 | `lib/txnStorage.ts` + 12 other read-modify-write stores | unparseable or wrong-kind value under the key, or storage read failure | "add" replaced the whole ledger (transactions, FD, gold, crypto, subscriptions, recurring, calendar dates, insurance checks, life events, Arya memory, funds recent, goals, budgets) with a one-item list. Now the old text is kept aside, and a failed read aborts the write |
| 8 | `lib/moneyScoreStorage.ts` | `finos_money_score` = number / list / `{score:"x"}`; history = object | `loadSavedScore` returned the raw parse: Score screen, Arya facts, PULSE crashed or showed NaN; Infinity score |
| 9 | `lib/trackerStorage.ts` | goals with `target:"abc"`, `id:true`, `target_date:5`; `streak.count` = 1e999; policy `type: 5`; PPF with list ids | goal cards NaN, streak Infinity, policy type not a string |
| 10 | `lib/fixedIncomeStorage.ts`, `cryptoStorage.ts`, `goldStorage.ts`, `recurringStorage.ts`, `calendarStorage.ts`, `goalOptimizerStorage.ts` | wrong-typed fields inside otherwise valid records | records passed to screens/cores with strings/objects/Infinity in numeric/text fields (NaN totals, `.toFixed` on string) |
| 11 | `lib/fixedIncome.ts` | entry with unreadable date/amount | `totals` NaN (website behaves the same, so `totals` is unchanged); new `safeTotals` used by the screen and the saved totals; `upcomingMaturities` no longer returns NaN rows |
| 12 | `lib/retirement.ts` | `finos_epf_doj` / `finos_nps_dob` = any non-date text | `yearsService`, `ageNow` NaN into Arya facts and the retirement screen |
| 13 | `lib/goalOptimizer.ts` | goal `target_date: "abc"` | `monthsLeft` NaN, priority NaN |
| 14 | `lib/growthSimStorage.ts`, `leakStorage.ts`, `forecastStorage.ts`, `passive.ts`, `nudgesStorage.ts`, `aryaFactsStorage.ts` | `1e999`, huge digit strings, `finite` checks missing | Infinity in SIP totals, subscriptions total, budget limits, dependents, passive streams, money score |
| 15 | 22 `*Storage.ts` readers | storage that rejects (`multiGet` throws) | loader threw into a screen with no catch. Now `getMany` / `getText`: reads as "nothing recorded" |
| 16 | `lib/aryaMemoryStorage.ts` | storage read failure then "add note" | memory replaced by one note. Now the writer returns `rejected` and changes nothing |
| 17 | `lib/learn.ts` | learned entry `{completed_at: 5, attempts: "x"}` | wrong types passed through the spread |
| 18 | `lib/marketDataStorage.ts` `readCached` | cached answer of an older / damaged shape; `savedAt: 1e999`; index with non-numbers | wrong-shaped "last good" answer shown (`.map` of non-list). Entries now carry a shape signature and are ignored when it no longer matches |
| 19 | `hooks/usePersisted.ts` | calculator inputs saved with wrong types (object in a text field, Infinity) or unreadable | wrong type reached the screen; unreadable save overwritten by the next keystroke. Now typed against the defaults, unreadable text kept aside |
| 20 | `hooks/useHoldings.ts` `lookupStock` / `searchFunds`, `hooks/useSectors.ts`, `hooks/useAryaChat.ts` | backend returns `price:"abc"`, `results:{}`, `sectors:[...]`, SSE `text: {}` | NaN price, `.map` on non-list in the fund picker, "[object Object]" appended to Arya's answer |
| 21 | `app/security.tsx` | 500 MB file picked as a backup | read whole into memory; now refused above 60 MB |
| 22 | `lib/recurringStorage.ts` | `active: "false"` (string) | a paused schedule would have been read as active-ish by truthiness; now only exactly `true` is active |

Also: two imports of types as values (`lib/subscriptionsStorage.ts`, `lib/recurringStorage.ts`, `lib/holdingsStore.ts`) made those modules
unloadable under Node; fixed with `import type` (no runtime change).

## Decisions and honest limits

* **A record that cannot be read is dropped on the next save** (valid JSON but, say, a fixed deposit with no start date). It was invisible
  on screen already; only a JSON text that cannot be parsed at all, or is of the wrong kind, is kept aside. The kept copy is a single slot
  per key (the latest unreadable value) and is not shown anywhere in the UI: recovery today is "Export my data" / a backup, then reading the
  `finos_sync_never_corrupt_*` entry. A recovery screen is not built.
* `finos_sync_never_corrupt_*` is device-only (the `finos_sync_` prefix is never uploaded; `NEVER_BACKUP` does not list it, so an
  encrypted backup and "Export my data" include it, like the couple data; erase clears it). Privacy notice stays true (on-device); the
  integrator may want one line in `lib/privacy.ts` ("an unreadable value is kept on this phone until you erase").
* Raw pass-through readers (`loadRawTransactions`, the foreign records inside the statement ledger `mergeLedger` / `undoBatch`) deliberately
  return records untouched so foreign data is never rewritten; their consumers (`normalizeAll`, SIP calendar) are what is tested.
* `Infinity` can only enter storage through a hostile / hand-edited text (`JSON.stringify` writes `null`). It is stopped at the doors
  (`parseJSON`, backup restore, sync pull) and in the computed numbers; individual `JSON.parse` calls that remain (see below) rely on
  their own finite checks.
* Not covered: `lib/appLockStorage.ts` (needs `expo-secure-store`; only its pure `normaliseMeta` / `normaliseFail` / `lockStatus` are
  fuzzed), `lib/privacy.ts` and `lib/search.ts` / `lib/calcs/**` (owned by other agents), `lib/theme.ts`, the screens' own JSX (no React
  Native renderer in Node; covered instead by the Expo web smoke below), `lib/vaultCrypto.ts` only for rejection of malformed files, the
  Python backend's own response bugs. Readers that still call `JSON.parse` directly but already had their own normaliser and passed the
  fuzz: `alertsStorage`, `dnaStorage`, `feedbackStorage`, `watchlistStorage`, `nudgesStorage.loadDismissed`, `remindersStorage`,
  `onboardingStorage`, `holdingDates`, `lifeGoalsStorage`, `taxHarvestStorage`, `rebalancerStorage`.
* A `null` leaking into a string-typed field is not flagged by the drift check (null is "unknown" there); the readers coerce text with
  `text()` so this does not occur in the fuzz, but it is a limit of the check.
* The mutation matrix runs heavy aggregators (`loadArFacts`, `loadFacts`, `loadBenchInput`, `gatherScoreData`, `loadTrackerData`) on every
  20th world only, to keep the file short.
* `__tests__/insuranceHub.test.mts` "committed JSON is what the extraction script produces" fails because `extract-insurance.py` raises
  `KeyError: 'heading'` (another agent's area, not touched).

## Running

```
cd mobile && npx tsc --noEmit && npm test
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs --test __tests__/corruptData.test.mts
FUZZ_MAX=2000 ...   # show every symptom of the mutation layer instead of the first 60
```

Web smoke on corrupt data (not committed; script in the session scratchpad): 5 corrupt variants (`{not json`, list of junk with wrong-typed
fields, object with wrong-typed fields, a bare string, `1e999` / negatives) written to 35 storage keys, every route opened in the Expo web
preview, failing on NaN / undefined / Infinity / `[object Object]`, page errors or an empty page.

## New user-visible strings (English; Hindi needed in `lib/i18nHi.ts` by the integrator)

* `This backup could not be restored safely: {reasons}. Nothing was changed.`
* `This backup file is not valid (it holds far more items than the app ever writes). Nothing was changed.`
* `The phone could not save the restored data, so the restore was undone. Free some space and try again.`
* `Could not read what is saved, so nothing was changed.` (Arya memory writer)

## Commit

Several listed files already carried other agents' uncommitted hunks before this pass (marked with `*`): check `git diff -- <file>` or use
`git add -p` for those.

```
git add -- \
  mobile/lib/safeStore.ts mobile/lib/keyShapes.ts \
  mobile/__tests__/corruptData.test.mts mobile/__tests__/helpers/corpus.mts mobile/__tests__/alias-hooks.mjs \
  mobile/__tests__/stubs/react-native.mjs mobile/__tests__/stubs/expo-constants.mjs mobile/__tests__/stubs/empty.mjs \
  mobile/lib/backup.ts mobile/lib/holdings.ts mobile/lib/holdingsStore.ts \
  mobile/lib/trackerSyncEngine.ts mobile/lib/txnStorage.ts mobile/lib/fixedIncome.ts mobile/lib/fixedIncomeStorage.ts \
  mobile/lib/cryptoStorage.ts mobile/lib/goldStorage.ts mobile/lib/recurringStorage.ts mobile/lib/subscriptionsStorage.ts \
  mobile/lib/financialCalendarStorage.ts mobile/lib/insuranceHubStorage.ts mobile/lib/lifeEventsStorage.ts \
  mobile/lib/aryaMemoryStorage.ts mobile/lib/learnStorage.ts mobile/lib/learn.ts mobile/lib/fundsStorage.ts \
  mobile/lib/trackerStorage.ts mobile/lib/retirement.ts mobile/lib/retirementStorage.ts mobile/lib/moneyScoreStorage.ts \
  mobile/lib/calendarStorage.ts mobile/lib/goalOptimizer.ts mobile/lib/goalOptimizerStorage.ts mobile/lib/growthSimStorage.ts \
  mobile/lib/leakStorage.ts mobile/lib/nudgesStorage.ts mobile/lib/forecastStorage.ts mobile/lib/passive.ts \
  mobile/lib/aryaFactsStorage.ts mobile/lib/benchmarkStorage.ts mobile/lib/marketDataStorage.ts \
  mobile/lib/creditScoreStorage.ts mobile/lib/debtStorage.ts mobile/lib/homeLoanStorage.ts mobile/lib/itrStorage.ts \
  mobile/lib/lifeCoverStorage.ts mobile/lib/lifeGoalsStorage.ts mobile/lib/profileStorage.ts mobile/lib/onboardingStorage.ts \
  mobile/lib/rebalancerStorage.ts mobile/lib/passiveStorage.ts mobile/lib/salaryStorage.ts mobile/lib/taxHarvestStorage.ts \
  mobile/lib/taxPlannerStorage.ts mobile/lib/sipStepupStorage.ts mobile/lib/windfallStorage.ts mobile/lib/coupleStorage.ts \
  mobile/hooks/usePersisted.ts mobile/hooks/useHoldings.ts mobile/hooks/useSectors.ts mobile/hooks/useAryaChat.ts \
  mobile/app/security.tsx mobile/app/tracker/fixed.tsx \
  docs/agent-notes/mobile-robustness.md
```
(`*` pre-existing other-agent edits: `holdingsStore.ts`, `trackerStorage.ts`, `calendarStorage.ts`, `homeLoanStorage.ts`, `retirement.ts`,
`recurringStorage.ts`, `subscriptionsStorage.ts`, `alias-hooks.mjs`, `security.tsx`, `tracker/fixed.tsx`.)

```
git commit -F - <<'EOF'
Harden phone storage readers, backup restore and sync against wrong-shaped data

Every stored or received value of the wrong shape (null, string, number, list
where an object belongs and the reverse, nested wrong types, NaN / Infinity,
huge strings, unparseable JSON) is now read as "nothing there" with a
documented fallback instead of crashing a screen or leaking NaN, and a failed
read is never saved over the person's data.

- lib/safeStore.ts, lib/keyShapes.ts: shared safe parsing, finite coercion,
  keep-aside of an unreadable value before a writer replaces it
  (finos_sync_never_corrupt_*, device only), expected shape per structured key
- read-modify-write stores (transactions, FD, gold, crypto, subscriptions,
  recurring, calendar dates, insurance checks, life events, Arya memory, funds,
  goals, budgets, holdings): strict read, abort on storage failure, keep aside
- readers normalise fields of otherwise valid records (holdings, FD, gold,
  crypto, goals, policies, money score, calendar sources, ...)
- backup restore is all-or-nothing: whole file validated first, hostile or
  damaged files refused with a message, partial writes rolled back
- tracker sync: damaged bookkeeping no longer stops sync, wrong-kind cloud
  values are not taken
- backend responses (quote, fund search, sectors, chat stream, price refresh)
  and the market cache are validated
- usePersisted types saved calculator inputs against their defaults
- NaN guards: EPF/NPS dates, goal dates, fixed-income totals (safeTotals)
- tests: __tests__/corruptData.test.mts (170 table-driven tests) with corpus
  helper and Node stubs for react-native / expo-constants

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```
