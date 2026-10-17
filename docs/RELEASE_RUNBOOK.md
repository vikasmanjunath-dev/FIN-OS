# FIN·OS mobile: release runbook (owner steps, in order)

Everything marked **OWNER** needs your accounts, money, or a legal decision: an agent cannot do it. Everything else is
already in the repository and has a command that checks it. Written 14 Oct 2026 against Expo SDK 53 / EAS CLI 16; brought in line
with the code on 17 Oct 2026 (after the October merges: onboarding, crash notes, feedback, erase flow, `expo-av` removed,
Settings reads the real version). Nothing in this file has been run on a device or against a Supabase project.

Read `docs/STORE_LISTING.md` section 0 first: it lists the product problems (no hosted backend, cleartext HTTP, account
deletion incomplete) that decide *what* you are shipping. This runbook is *how*.

## What "the first release" is, in one paragraph

A guest-first app. All trackers and calculators work offline on the phone. Sign-in/sync is built, but needs a live
Supabase project with the SQL below applied. Live prices and Arya need a backend the person runs themselves, so they are
not a store feature today. Feedback has no inbox (`FinosFeedback` endpoint is `null`): it is saved on the phone and shared through
the share sheet only, and crash notes are kept on the phone (Settings > Diagnostics), never sent. Google sign-in is built but
hidden unless `EXPO_PUBLIC_GOOGLE_SIGNIN=1` (step 5 item 2). There is **no over-the-air update channel** (`expo-updates` is not installed; asserted by
`mobile/__tests__/releaseConfig.test.mts`): every fix is a new store build and review.

## 0. Decisions only you can make (do these first; each blocks a step below)

1. **Legal operator.** Developer-account holder, privacy-policy URL, support e-mail, grievance officer. `ENTITY` in
   `mobile/lib/privacy.ts` is deliberately all `null`; `html/privacy.html` and `html/terms.html` are drafts.
2. **Ship with sign-in or guest-only?** Guest-only needs no Supabase work and gives the label "Data not collected"
   (store listing 4.3/4.4). With sign-in you must finish step 5 first.
3. **Bundle identifier.** Currently `com.finos.mobile` on both stores. It cannot be changed after the first upload to
   Play. If you own a domain, `com.<yourdomain>.finos` is the usual form. If you change it, edit `app.json`
   `ios.bundleIdentifier` and `android.package` together (a test requires them to match).
4. **Cleartext HTTP backend** (store listing 0 item 2).
5. **Apple encryption export questions** (store listing 0 item 6).

## 1. Accounts and tools (OWNER)

| Need | Cost / lead time | Notes |
| --- | --- | --- |
| Expo account + EAS | free tier is enough to start | `npm i -g eas-cli` (needs >= 16), `eas login` |
| Apple Developer Program | USD 99/year; enrolment can take days (organisation: D-U-N-S) | needed for TestFlight and the App Store |
| Google Play Console | USD 25 once; identity verification can take days | personal accounts created after Nov 2023 must run a closed test with 12+ testers for 14 days before production access: plan for it |
| Supabase project (only if sign-in ships) | free tier works | see step 5 |

## 2. One-time project wiring (OWNER, ~15 min)

```bash
cd mobile
eas init                      # creates the EAS project; writes extra.eas.projectId + owner into app.json: commit that diff
eas build:configure           # accepts the existing eas.json; do not let it overwrite the profiles
```

Environment variables live in EAS, not in git (`eas.json` profiles each name an `environment`; `.env` is git-ignored and
EAS does not upload ignored files):

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL      --value https://<ref>.supabase.co --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key>               --visibility plaintext
# repeat for --environment preview and development (a separate Supabase project for them is better than sharing production)
# EXPO_PUBLIC_GOOGLE_SIGNIN=1 only after step 5 item 4 is done
```

The anon key is public by design (it ships in every build and in `js/auth.js`); Row-Level Security is the protection,
which is why step 5 matters. Never put the `service_role` key anywhere in `mobile/`: the config test fails on it.

Apple: `eas credentials` (let EAS manage the certificates and provisioning), create the app record in App Store Connect
with the bundle id, then put `ascAppId` into `eas.json` `submit.production.ios`. Google: create the app in Play Console,
upload a service-account JSON key through `eas credentials` or `eas submit` (**never commit it**; `*.json` key files are
not git-ignored by default: add the path to `.gitignore` first).

## 3. Check before every build (agent-run, takes about 2 minutes)

```bash
cd mobile
npm test && npx tsc --noEmit                  # includes privacy, a11y, releaseConfig, releaseAssets guards
python3 scripts/release-assets.py --check     # brand images equal what the script generates (needs the macOS fonts for the Play graphic)
python3 scripts/release-sql-check.py          # real Postgres: syntax, idempotency, RLS, delete-account completeness
npx expo-doctor                               # SDK/package compatibility
npx expo prebuild --no-install --clean        # then inspect android/app/src/main/AndroidManifest.xml and ios/*/*.entitlements
```

Expected after prebuild (verified 14 Oct 2026; `expo-av` was removed from the project on 15 Oct, which only removes
RECORD_AUDIO / MODIFY_AUDIO_SETTINGS from what libraries add): Android permissions INTERNET, POST_NOTIFICATIONS,
USE_BIOMETRIC, USE_FINGERPRINT, VIBRATE, RECEIVE_BOOT_COMPLETED (the last three come from the libraries' own manifests and are
named in the privacy notice, `lib/privacy.ts` PERMISSIONS, which `__tests__/privacy.test.mts` checks against those manifests) and
`tools:node="remove"` for RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE; `android:allowBackup="false"`;
iOS entitlements file empty (no `aps-environment`), `NSFaceIDUsageDescription` present, `NSAllowsArbitraryLoads=false`. `prebuild` creates `android/` and `ios/`: delete them afterwards (the project is managed
workflow; they are not committed).

## 4. Build and test

```bash
cd mobile
eas build --profile preview --platform android     # APK you can sideload; give it to the device checklist
eas build --profile preview --platform ios         # internal distribution needs registered devices (eas device:create)
```

Run `docs/DEVICE_TEST_CHECKLIST.md` on at least one low-end Android phone and one iPhone **before** a production build.
Then:

```bash
eas build --profile production --platform all      # versions are auto-incremented by EAS (appVersionSource: remote)
eas submit --profile production --platform android # lands on the *internal* track as a draft (eas.json)
eas submit --profile production --platform ios     # TestFlight first
```

Versioning: `app.json` `version` is the human version (1.0.0). The iOS build number and Android version code are
created and incremented by EAS on each production build; do not add `buildNumber` / `versionCode` (a test fails if you
do). To release 1.0.1, bump `version` only. To set the first number explicitly: `eas build:version:set`.
Settings > About shows the `version` from `app.json` through `expo-constants` (`lib/appInfo.ts`; it was hard-coded until 15 Oct), so
the number on screen cannot drift from the config. Confirm it on the preview build (device checklist D-6): it is read from the
native config at run time, which the web preview cannot prove.

## 5. Supabase SQL (only if sign-in ships) (OWNER, ~20 min)

Run in the SQL editor of the project whose URL you put in EAS. Back up first (Database > Backups), though every file
below is additive. All of this was executed against a real local PostgreSQL 16 with a stub `auth` schema by
`mobile/scripts/release-sql-check.py` (parse with the Postgres parser, run twice, assert RLS, cross-user isolation, anon
isolation, account deletion).

| Order | File | Verdict from the check |
| --- | --- | --- |
| 1 | `supabase/profiles_rls.sql` | Idempotent. Closes the open `profiles` table (13 rows were readable with the anon key on 11 Oct). **Run this first even if you do nothing else.** |
| 2 | `supabase/core_tables.sql` | Idempotent; RLS + own-rows policy on `profiles`, `transactions`, `goals`, `budgets`. |
| 3 | `supabase/holdings.sql` | Idempotent; its unique-index step fails if the live table already has duplicate `(user_id, asset_type, symbol)` rows: merge them and re-run. |
| 4 | `supabase/tracker_snapshot.sql` | Idempotent; RLS on. |
| 5 | `alerts/schema.sql` | Re-runnable since 15 Oct 2026 (every `CREATE POLICY` is now preceded by `DROP POLICY IF EXISTS`; it used to stop on a second run with "policy already exists"). All its tables get RLS. pgvector must be enabled (Extensions > vector) for `memory_embeddings`. |
| 6 | `voiceagent/schema.sql` | Re-runnable and non-destructive since 15 Oct 2026 (it used to start with `DROP TABLE IF EXISTS agent_memories`, which deleted every user's voice memory on a second run; now `CREATE TABLE IF NOT EXISTS`, columns added in place). |
| 7 | `supabase/delete_account.sql` | Run last. It already deletes the caller's rows from every table without a cascading key (see below); `mobile/scripts/release-sql/delete_account_complete.sql` is the earlier proposal and is equivalent apart from adding `pg_temp` to `search_path` (a hardening the shipped file lacks: an owner call). |

Why step 7 matters: the first version of `delete_my_account()` deleted only `auth.users`. The check showed it left rows in
`alerts`, `push_subscriptions`, `alert_preferences`, `health_score_history`, `memory_embeddings`, `user_behavior`,
`document_ai_log`, `couple_links`, and `profiles` (on the live project, where `profiles` pre-dates the files and has no
foreign key). The trust-platform pass rewrote `supabase/delete_account.sql` to delete those first (guarded by
`to_regclass`, so a missing table is skipped) and it keeps `REVOKE ... FROM PUBLIC, anon`; `mobile/__tests__/deleteAccountSql.test.mts`
fails if a schema file adds a table with a `user_id` column that the function does not handle. The proposal in
`mobile/scripts/release-sql/` additionally puts `pg_temp` last in `search_path` (the standard SECURITY DEFINER hardening).
Nothing here was run against any project.

After running, verify from outside the app with only the anon key (each must return `[]`, not rows):

```bash
for t in profiles transactions goals budgets holdings tracker_snapshot alerts push_subscriptions; do
  curl -s "$SUPABASE_URL/rest/v1/$t?select=*&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"; echo " <- $t"; done
```

Supabase dashboard settings (OWNER):

1. Authentication > Providers: e-mail on. Decide whether "Confirm e-mail" is required (the app shows a message for it).
2. Authentication > URL Configuration: add the redirect `finos://` (scheme in `app.json`) **only** if you enable Google
   sign-in (`EXPO_PUBLIC_GOOGLE_SIGNIN=1`). Google needs its own OAuth client in the Google console and the provider
   enabled in Supabase. Leave it off for the first release unless you have tested it.
3. Authentication > Rate limits and password policy: set a minimum length of 8+.
4. Project status: on 2 Oct the mobile project's host did not resolve; on 11 Oct `supabase/README.md` recorded it
   reachable. Check `https://<ref>.supabase.co/auth/v1/health` returns 200 before pointing a build at it.
5. Do **not** expose the `service_role` key to the app or website. The backends (`alerts`, `voiceagent`, `arya-ai`) read it
   from their own `.env`.

## 6. Backend restart (only if you run an Arya backend)

The store app does not need one (listing section 0 item 1). To restart the one you run for yourself:

```bash
cd arya-ai
./start.sh --prod        # 2 workers on 7475; reads arya-ai/.env (SUPABASE_URL / SUPABASE_ANON_KEY only for /api/portfolio/*)
curl -s localhost:7475/api/market/overview | head -c 200      # smoke test
```

After editing `.env`, restart: the file is read once at start. The alert engine and voice agent run separately
(`alerts/`, `voiceagent/`, `docker-compose.yml`); restart them after a schema change only if they cache table shapes.
In the phone app, Settings > backend address must be reachable from the phone (same Wi-Fi, an IP, not `localhost`).

## 7. Store submission (OWNER)

1. Upload screenshots from `mobile/assets/store/` (see listing section 3) and the icon / feature graphic.
2. Paste listing text from `docs/STORE_LISTING.md`; fill the Data-safety form and App Privacy answers from sections 4.3 and
   4.4 (re-check them against the build you are submitting).
3. Privacy-policy URL, support URL, account-deletion URL (Play): from decision 1.
4. Apple: Notes for review; Play: App access = "all functionality available without special access".
5. Google internal testing track first, then closed testing (14 days / 12 testers for new personal accounts), then production.
6. Apple: TestFlight internal group, then submit for review. First review commonly asks about the "financial" category and
   the disclaimer: the in-app Terms page and the screenshots carry it.

## 8. Rollback

There is no OTA channel, so rollback is a store action:

| Situation | Action |
| --- | --- |
| Bad build, not yet public | Play: halt the release in the track / do not promote the draft. Apple: remove the build from the submission or "Developer Reject". |
| Bad build, live, Android | Play Console > Release > the previous bundle > "Roll out as new release" (a bundle with a **higher** version code is required: rebuild the last good commit with `eas build --profile production`, EAS will auto-increment) and use staged rollout (5-10%) for every production release so a halt is possible. |
| Bad build, live, iOS | Submit a new build from the last good commit (an old build cannot be re-released); use phased release for automatic updates, and "Pause phased release" if needed. Expedited review can be requested. |
| Bad SQL | Every supabase/*.sql file is additive. To undo a policy: `DROP POLICY "<name>" ON <table>;` To undo a function: `DROP FUNCTION public.delete_my_account();` (the app's Delete-account button then shows an error: it does not crash). Never `DROP TABLE` user tables: restore from the Supabase backup instead. |
| Backend change | `git revert` and `./start.sh --prod`. The phone caches the last good price with its time and degrades to a message. |

## 9. After release

- Record the build number, git commit and date in `docs/PENDING.md` (shared file; give the integrator the line).
- Watch Play Console "Android vitals" and App Store Connect crash reports: these are the only automatic crash signals, because
  the app has no crash reporter by design. Users can share the redacted note from Settings > Diagnostics (a JS error is caught
  by the error boundary and noted on the phone; a fatal native crash can kill the process before the note is written).
- Calendar items: tax-slab changes each February budget (`docs/TAX_RULES.md`), store policy deadlines (Play target-SDK
  rule each August), certificate expiry (EAS shows it).
