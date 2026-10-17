# mobile-polish: cross-links, honest Home, assumed ages, Hindi, release docs, tracker audit (Oct 17 2026)

Nothing was committed, staged or pushed. Main tree, no worktree. Another agent's in-flight files (Learn, Arya tabs, market detail,
portfolio analytics, journal) were not edited except the three one-line `ageOf` edits and the files named below.

## What changed

1. **Cross-links** (each a labelled button or link with `accessibilityRole`/label, in the screen's own style; each clicked in a Playwright run at 430 px and the route checked):
   Budget -> `/plan/forecast`, Goals -> `/plan/lifegoals`, Insurance tracker -> `/insurance`, Portfolio (Analysis tab) -> `/plan/growth`,
   Watchlist rows -> `/market/stock/<symbol>` or `/market/fund/<code>` (the row's left part is the link, the remove cross stays separate: no nested touchables),
   `<FeedbackPrompt topic="money-score" page="/tools/score" ...>` on the Money Score result (a Yes + Save wrote `{"page":"tools/score","topic":"money-score","rating":"up"}` to `finos_feedback_log`, nothing sent).
2. **Assumed ages gone.** `computeCoverage(policies, income, age)` now treats 0 / null / NaN as "not recorded" (term gap stays, it is worded "if others depend on you"; the 35+ critical-illness gap is not raised). Removed `ageOf(f) || 30` in `pulseCards.ts`, `moneyScoreStorage.ts`, the `30` in `trackers.ts` and the literal `30` in `lifeEvents.ts`; `aryaTools.ts` no longer contains the call (the other agent moved it to `aryaToolbox.ts`, which passes `ageOf(f) || null`). Test in `logic.test.mts` (mutation-checked: putting `|| 30` back fails it) also scans those files for the pattern.
   `learnedCount` comment in `lib/learn.ts` now describes the fixed website behaviour.
3. **Privacy line**: `KEPT_ASIDE_NOTE` (`lib/privacy.ts`, shown under "On this phone right now" in `app/privacy.tsx`): an unreadable stored value is kept on the phone until erase, never uploaded, part of your own export and backup. Guard test in `privacy.test.mts` checks each claim: not a sync key, is a backup key, `eraseEverything` removes it.
4. **Hindi** (`lib/i18nHi.ts`, 197 entries, first pass, marked unreviewed in a comment block, PENDING U10): all 121 strings of `planners-hindi-missing.json` and the trust-platform list were already present (checked with the lookup); added the 3 translatable `mobile-robustness.md` strings (the `{reasons}` one has free text inside, so it cannot be a key); the rest came from running ~130 routes empty and populated in Hindi and reading `window.__finosMissing()` (1,524 untranslated strings in total, many being calculator content, product and company names, legal pages and other agents' new screens). I translated only short chrome of Learn / market / insurance / PULSE-memory / feedback / Home / settings. Not translated on purpose: long sentences, legal pages, names, anything with free text. `i18n.parity.test.mts` passes.
5. **P-07 persona** (`lib/persona.ts`, `lib/personaStorage.ts`, `components/PersonaStrip.tsx`, Home, Settings row "Facts strip on Home", `__tests__/persona.test.mts`): time-of-day greeting (website cut-offs), first name only when one is recorded (the old "Friend" stand-in is gone), "N-day streak" from day two (the app's own `finos_streak`), strip of savings rate / net worth / Money Score, each only when recorded and each opening its source screen; the cross hides it, Settings brings it back (`finos_persona_mobile`, device-only: `storageKeys.ts`, `trackerSync.ts` never-list, `onboarding.ts` not-user-data, privacy inventory). Left out on purpose: DNA archetype and life stage (no archetype names on the phone), Health score chip (it rests on a neutral DNA baseline and a 60,000 income fallback in `lib/trackers.ts`, so it is not "only recorded"; the Home Health Score card still shows it), FIRE % (assumption), win rate (no journal in this scope).
6. **Release readiness**: Budget / Goals input clipping fixed (`minWidth: 0` on `TrackerUI` `ui.input`; reproduced first: the input was 154 px inside a 138 px box; checked after with 7-digit amounts), Portfolio header wraps (title no longer breaks mid-word), Settings reads the version from `expo-constants` via `lib/appInfo.ts` (verified in code and tests; the web preview shows the config version, a device build still needs checking: D-6). `app.json` / `eas.json` re-read: identifiers `com.finos.mobile`, EAS-owned build numbers, no OTA, `allowBackup:false`, blocked permissions, no `expo-av`; `releaseConfig` + `releaseAssets` tests (18) pass. `docs/RELEASE_RUNBOOK.md` and `docs/DEVICE_TEST_CHECKLIST.md` updated (RECEIVE_BOOT_COMPLETED in the expected manifest, version row, clipping row, new section I with D-80..D-92 for the screens built since 14 Oct). Nothing in them has run on a device.
7. **Smoke script**: `scripts/smoke-routes.py` populated profile used holding types `stock`/`mf`, which the holdings reader drops (valid types are `Stock`/`MF`), so Portfolio was never rendered populated; fixed.
8. **docs**: `docs/PENDING.md` (row 15 done, new row 17), `docs/MOBILE_APP.md`, `mobile/README.md` (test counts, persona, new key), `docs/MOBILE_PARITY_TRACKER.xlsx` (see below).

## Parity tracker (openpyxl; formulas, validations, conditional formats re-checked after saving)
Updated Status/Notes/Updated for: A-02 Partial (14 of 27 widgets), A-05 Partial, A-06 Done, A-08 note (mic is blocked, not "declared"), S-10 Partial, P-07 Done (honest subset), P-06 / R-10 / R-06 / R-09 / R-13 / R-16 notes, R-11 Partial (assets, screenshots, listing built; owner items open). Summary sheet counts are formulas (they recalculate); its date note was refreshed. Nine Build log rows added (the unlogged Oct 15 merges, taken from the agent notes and labelled so, the robustness pass, and this pass). Not touched: L-27..L-51, A-03/A-04/A-09, M-07/08/09/14/16/17/18/20, S-04..S-07, S-09. Nothing is marked device-verified.

## Verification
See "Results" at the bottom (filled from the last runs).

## Honest limits
- Web preview only (Expo web, Playwright). Nothing on a device.
- Hindi: first pass by me, needs a native reader. The Hindi table does not cover every screen (1,524 strings missing in the audit, mostly out of scope).
- Home strip: the Money Score chip shows the last saved score even if inputs changed since; its label carries the date it was worked out.
- `lib/retirementPlan.ts` (age 30, spend 50,000, website parity) and the Life cover calculator (`COVER_DEFAULTS` age 30 / 60 / 25 yrs / 6%) show visible default inputs. Left as they are (calculator inputs mirroring the website, not recorded facts); PENDING row 17 notes them.
- `lib/trackers.ts` Health Score still uses a neutral DNA baseline and a 60,000 income fallback (website parity, flagged on the Health screen) .
- Failures outside this pass: see Results.

## Files for `git add` (mine; files also carrying other agents' hunks are marked *)
```
git add -- \
  "mobile/app/(tabs)/dashboard.tsx"* "mobile/app/(tabs)/portfolio.tsx"* mobile/app/settings.tsx mobile/app/privacy.tsx \
  mobile/app/tracker/budget.tsx mobile/app/tracker/goals.tsx mobile/app/tracker/insurance.tsx mobile/app/tracker/watchlist.tsx mobile/app/tools/score.tsx \
  mobile/components/PersonaStrip.tsx mobile/components/TrackerUI.tsx \
  mobile/lib/persona.ts mobile/lib/personaStorage.ts mobile/lib/privacy.ts mobile/lib/i18nHi.ts mobile/lib/storageKeys.ts mobile/lib/trackerSync.ts mobile/lib/onboarding.ts \
  mobile/lib/retirement.ts mobile/lib/trackers.ts mobile/lib/lifeEvents.ts mobile/lib/moneyScoreStorage.ts mobile/lib/pulseCards.ts* mobile/lib/learn.ts* \
  mobile/__tests__/persona.test.mts mobile/__tests__/privacy.test.mts mobile/__tests__/logic.test.mts* \
  mobile/scripts/smoke-routes.py \
  docs/RELEASE_RUNBOOK.md docs/DEVICE_TEST_CHECKLIST.md docs/PENDING.md* docs/MOBILE_APP.md mobile/README.md docs/MOBILE_PARITY_TRACKER.xlsx \
  docs/agent-notes/mobile-polish.md
```
(`lib/aryaTools.ts` also contains my one-line edit but the file is being rewritten by the Arya agent: leave it to their commit.)

```
git commit -F - <<'EOF'
Mobile polish: cross-links, honest Home greeting and strip, no assumed ages, Hindi first pass, release docs

- Budget to Forecast, Goals to Life goals, Portfolio to Growth, Insurance tracker to hub, Watchlist rows to research,
  feedback prompt on the Money Score result
- Home: greeting names the person only when a name is recorded, N-day streak, strip of savings rate / net worth /
  Money Score from recorded facts, hideable (Settings brings it back)
- an unknown age is never replaced by 30 (insurance gaps, Money Score, PULSE, life events); privacy notice says an
  unreadable value is kept on the phone until erase, with a guard test
- Budget / Goals inputs no longer clip long figures; Portfolio header wraps; smoke script now renders populated Portfolio
- Hindi: about 200 short first-pass entries (unreviewed)
- runbook and device checklist brought up to date; parity tracker rows audited against the code; build log extended

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

## Results
(filled below)

- `npx tsc --noEmit`: clean at the last run.
- `npm test`-equivalent over all `__tests__/*.test.mts` except `portfolioSimulate.test.mts` (another agent's new file: `npm test` itself stalled at that file twice): **952 tests, 938 pass, 6 fail**, all outside this pass:
  `insuranceHub.test.mts` x2 (`extract-insurance.py` vs the website's HTML, which other sessions are editing), `learn.test.mts` x2 (manifest / lesson files while the Learn agent adds lessons), `search.test.mts` x1 (lesson index vs the manifest, same cause), `privacy.test.mts` "news links open the publisher": `components/LearnBlocks.tsx` (Learn agent) opens a web page the notice does not yet describe. That agent must add the flow to `lib/privacy.ts` or the test will stay red. My new/changed tests (`persona`, `privacy` kept-aside, `logic` age guard, `i18n.parity`, `releaseConfig`, `releaseAssets`) pass; the age guard and the Hindi parity were mutation-checked / re-run.
- `scripts/smoke-routes.py` on /dashboard /portfolio /settings /privacy /tracker/budget /tracker/goals /tracker/insurance /tracker/watchlist /tools/score (own Metro on :8195, stopped afterwards): 9 screens x 4 runs, **0 problems**. `theme-audit.py` on the same 9: **0 low-contrast** (616 text nodes, light).
- Playwright flows at 430 px: Budget/Goals/Insurance/Portfolio/Watchlist (stock and fund) links land on the right routes; feedback Yes + Save stores a redacted entry; Home with name, 4-day streak, 3 chips, hide cross.
- Not verified: anything on a device or in Hindi on screen (Hindi entries only checked through the lookup and parity tests, not visually); the persona hide/show round trip through Settings was covered by unit tests of the preference, not driven in the browser; the xlsx was re-opened with openpyxl and recalculated with LibreOffice (Summary counts: 180 Done, 20 Partial, 43 Pending, 7 Blocked, 4 Not planned of 254).
- Shared ports used: Metro 8195 (stopped). Others' Metro servers on 8082 / 8191 were left alone.
