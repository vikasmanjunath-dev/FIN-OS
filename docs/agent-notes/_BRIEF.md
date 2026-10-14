# Brief for every agent working on FIN·OS (read this first, then your task)

Project root: `/Users/vkm/Desktop/Finos/Initial Deployment` (git repo; static website + `arya-ai/` FastAPI backend + `mobile/` Expo 53 / RN 0.79 / React 19 app).
The owner (Vikas) wants **excellent, deeply verified work**, not padding. Time is not the constraint; correctness and honesty are.
Nothing may be committed or pushed by you (see "Git" below).

## Standing product rules (non-negotiable)
- **Never assume or invent user data.** An unknown figure is shown as "Not recorded" / left out, never defaulted. No fabricated demo data in shipped code.
- **Honest labelling.** If a number is an estimate, an approximation or rests on an assumption, the screen says so. No prescriptive financial advice; "estimates for planning, not advice".
- **Privacy.** On-device by default. No new third-party hosts, analytics SDKs, push tokens or permissions without recording it in your notes (guard tests in `mobile/__tests__/privacy.test.mts` will fail on a new host / fetch caller / permission: if your task genuinely needs one, update the guard AND the notice in `mobile/lib/privacy.ts` consciously and say so in your notes).
- Draft legal pages stay "Draft for legal review". Do not invent operator/legal details. Hindi wording is a first pass needing native review.
- Real data only: if a source is missing, say what is missing; do not fabricate to make a screen look complete.

## How the phone app is built (patterns to follow)
- Pure cores in `mobile/lib/*.ts` (no React, no storage, "now" is a parameter) → storage wrappers `*Storage.ts` (AsyncStorage, same `finos_*` keys as the website when the concept exists there) → screens in `mobile/app/**` (expo-router, file based).
- **Parity tests** compare a port with the website's own file (see `mobile/__tests__/*.parity.test.mts`, `webCalc.parity.test.mts`, `helpers/webCalc.mts`): load the real web JS (createRequire / vm with a stub DOM) and compare on random + edge inputs. Do this for every port of website logic.
- UI components: `mobile/components/TrackerUI.tsx` (TrackerScreen, Card, SectionLabel, Bar, inr, inrShort), `CalcUI.tsx` (CalcField, Segmented, CheckRow, Collapsible, Bullet, toNum). Colours only from `mobile/constants/theme.ts` (a runtime mapper makes light theme work: `lib/themeCore.ts`; keep colours idempotent-safe; do not write `useRef<TextInput>` — the a11y guard regex flags it).
- **Accessibility guard** (`__tests__/a11y.test.mts`): every `TouchableOpacity`/`Pressable`/`TextInput` needs `accessibilityRole` or `accessibilityLabel`. No nested touchables (invalid on web).
- New screens go in **your own folder** under `mobile/app/<your-area>/` (not `app/tools` or `app/tracker`: those folders are covered by the search-index guard test, which only I update). Dynamic routes are fine.
- Backend: `arya-ai/` (FastAPI, `server.py`, `data/market.py`, `data/news.py`, `intelligence/`). The phone reaches it via `ENDPOINTS.aryaAI` (`mobile/constants/endpoints.ts`); use `fetchJSON` from `@/lib/holdingsStore` (timeouts). Offline must degrade gracefully (cached last good value marked with its time, or a plain message), never an endless spinner or a thrown error.
- Hindi: mobile strings go through `mobile/lib/i18nHi.ts`; you may NOT edit it directly (shared): list the entries in your notes.

## Verification you must do before declaring done
1. `cd mobile && npm test` (node:test; currently ~360 tests) and `npx tsc --noEmit` both green. If something unrelated fails because another agent is mid-edit, wait a few minutes and re-run; do not "fix" other agents' files.
2. Website side (only if you touched it): `node --test tests/*.test.js`, `python3 tests/static_audit.py`, relevant `python3 -m pytest tests/test_*.py -q`.
3. Phone screens: the Expo web preview should be running at `http://localhost:8082` (if not: `cd mobile && npx expo start --web --port 8082` in the background). Run `python3 mobile/scripts/smoke-routes.py <your routes>` (auto-discovers routes; checks errors / NaN / empty, empty+populated, dark+light) and `python3 mobile/scripts/theme-audit.py <your routes>` (WCAG contrast in light mode). Also drive your real flows with Playwright (python, `channel='chromium'`) and LOOK at screenshots.
4. Test the offline path (abort non-localhost requests; backend is not running unless you start it).
5. Mutation-check at least your most important tests (break the code, see the test fail, restore).

## Git and shared files
- **Never run `git commit`, `git push`, `git add -A`, `git checkout --`, `git reset`, `git stash`.** The working tree holds hundreds of other sessions' uncommitted files; do not touch or revert anything you did not create for your task. Hand over commits as text.
- You may create and edit files in the areas you own (listed in your task). **Do not edit these shared files**; put what is needed in `docs/agent-notes/<your-agent-name>.md` (exact snippets / entries) and I will integrate them:
  `mobile/lib/search.ts`, `mobile/lib/privacy.ts`, `mobile/lib/i18nHi.ts`, `mobile/app/(tabs)/dashboard.tsx`, `mobile/app/_layout.tsx` (unless your task owns it), `mobile/app.json` (unless owned), `mobile/package.json`/lockfile (if you need a dependency: `npx expo install <pkg>` once, and record it), `mobile/.expo/types/router.d.ts`, `mobile/README.md`, `docs/MOBILE_APP.md`, `docs/MOBILE_PARITY_TRACKER.xlsx`, `docs/PENDING.md`, anything in `mobile/lib/theme*.ts`.
- Edit files with Python in binary mode if they may have CRLF (Python's text mode silently converts CRLF to LF and makes a noisy diff); macOS `sed -i` needs a backup suffix.
- Your final deliverables: (a) the working code + tests, (b) `docs/agent-notes/<your-agent-name>.md` with: what you built, decisions and honest limits, how to run the tests, entries needed in shared files, and a ready-to-use `git add -- <explicit files>` + a detailed `git commit -F - <<'EOF' ... EOF` message ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, (c) a concise final report as your last message.

## Things already built (do not rebuild; reuse)
Money Score, trackers (net worth, budget, EPF/NPS/PPF, insurance, subscriptions, goals, emergency, fixed income, gold, crypto, passive, harvest, watchlist), 71 calculators hub (`lib/calcs`), tax planner (shared tax core parity), retirement planner (seeded Monte Carlo), reminders, alerts (`lib/alerts.ts`), search, nudges, profile, report, DNA quiz, light theme, app lock + encrypted backup (`lib/vaultCrypto.ts`, `lib/backup.ts`, `app/security.tsx`), real estate, route smoke test, offline Arya reply.
Docs: `docs/MOBILE_APP.md` (architecture), `docs/PENDING.md`, `docs/MOBILE_PARITY_TRACKER.xlsx` (read it to see what is open).
