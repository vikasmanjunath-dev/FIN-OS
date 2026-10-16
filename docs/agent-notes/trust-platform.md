# trust-platform agent notes (Oct 14-15 2026)

## What was built
| Task | Where |
|---|---|
| R-13 crash notes (no service) | `lib/diagnostics.ts` (pure), `lib/diagnosticsStorage.ts` (handlers: ErrorUtils, Hermes rejection tracker in release, web error events), `components/ErrorBoundary.tsx` (inside the lock), `app/diagnostics.tsx`, `components/SharePreview.tsx` |
| Redaction + parity | `lib/redact.ts`: `redactBase` == website `FinosFeedback.redact` (parity test, 4,000 random + corpus); `redact` adds UPI handles, spaced digits, lower-case PAN, IFSC, other-script digits (Devanagari phone numbers), amounts in words |
| Opt-in usage counters | `lib/usage.ts`, `lib/consents.ts` (same `finos_consents` shape as the website), default off, shown + shareable on Diagnostics |
| P-11 feedback | `lib/feedback.ts`, `lib/feedbackStorage.ts`, `components/FeedbackPrompt.tsx` (drop into any screen), `app/feedback.tsx`. Endpoint is `null`; `send()` decisions equal the website's (tested). Share goes through the share sheet only; no mail composer (no inbox address exists, no new dependency) |
| P-08 onboarding | `lib/onboarding.ts` (state machine), `lib/onboardingStorage.ts`, `lib/onboardingActions.ts`, `app/onboarding/welcome.tsx`, `app/index.tsx` decides. Opens by itself at most twice, never for phones that already hold data, re-open from Settings, writes only answered fields |
| R-06 erase | `lib/dataControls.ts eraseEverything`, `lib/eraseDeps.ts`, `lib/eraseEpoch.ts`, `lib/tempFiles.ts`, `lib/storageKeys.ts`, `supabase/delete_account.sql` |
| P-10 Google | `lib/googleAuth.ts`, `hooks/useAuth.tsx`, `app/login.tsx` (button hidden unless `EXPO_PUBLIC_GOOGLE_SIGNIN=1`) |
| R-10 permissions | `lib/permissions.ts` copy + `enableRemindersFlow`, `lib/permissionPrompt.ts`; Settings, onboarding and the biometric switch explain first, then the OS prompt |
| Security | see below |

## Gaps found and fixed (real ones)
1. **"Forgot PIN" re-synced everything**: it cleared AsyncStorage but the in-memory Supabase session stayed, so the next sync pulled the person's cloud data straight back, without the PIN. Now one `eraseThisPhone()` signs out first.
2. **Erase left data in memory** (`holdingsStore`, tracker sync state) that could be written back or uploaded to a different account that signs in next. Added additive `resetForErase()` / `resetAccountLink()` exports to `lib/holdingsStore.ts` and `lib/trackerSyncStore.ts` (outside my list; additive only).
3. Settings "Clear all data" did not sign out and left delivered notifications (which can name a policy and amount) and cache files (picker copies of statements/backups).
4. **`delete_my_account()` left rows behind**: alerts schema tables have a bare `user_id` with no cascade (alerts, push_subscriptions, alert_preferences, health_score_history, memory_embeddings, user_behavior, document_ai_log, couple links). `supabase/delete_account.sql` now deletes them explicitly (skips tables that do not exist). Guard test `deleteAccountSql.test.mts`. NOT run against any project. **Owner decision**: deleting a couple link also removes the partner's shared goals.
5. `signOut()` was global (ended the website and other phones too); now `scope: 'local'`.
6. PIN attempt counted *after* the check (kill during check = free guess): now counted before (`tryPin`), from stored state; wait clamped to 15 min so a wrong clock cannot lock out for days.
7. Lock failed **open** when secure storage could not be read; now fail closed with "Try again".
8. Device-only keys synced to the cloud: `finos_theme_mobile`, `finos_reminders_mobile` (a "reminders on" switch could arrive on a phone with no permission), `finos_applock_*` on web preview. Added to `lib/trackerSync.ts` never-lists (website parity test still green).
9. Backup/restore accepted `finos_consents`, `finos_holdings_owner`, `finos_tracker_sync_meta` etc.; now device-only (`lib/storageKeys.ts`). Export no longer includes lock verifier on web preview.
10. Session tokens were plain AsyncStorage (in phone backups): now AES-GCM under a key in SecureStore (`lib/secureSession.ts`), old sessions migrated on first read.
11. Backup temp file left in cache; picked backup copies left in cache. Swept at launch, deleted after share (iOS) / at next launch (Android, because share may still be reading it), deleted after reading a picked file.
12. Biometric switch only stored a flag, so the Face ID prompt first appeared at the next lock; now confirmed at toggle time.
13. Weak backup passphrases ("aaaaaaaa", "12345678") now refused.
14. App-switcher snapshot: a cover is drawn whenever the app is not active **and a lock is on** (no new native module).

## Residual risks (honest)
- Everything in AsyncStorage (all financial data) is plaintext at rest, protected by the OS sandbox and disk encryption only. The app lock is a UI gate. Only the session and the PIN verifier are in/under secure storage.
- 6-digit PIN: if the Keychain item is extracted from a compromised device, the verifier (PBKDF2 20k) falls offline in hours. Wall-clock lockout can be bypassed by moving the clock forward.
- App-switcher cover is JS-driven: on iOS usually in time, not guaranteed; on Android the recents thumbnail needs `FLAG_SECURE` (`expo-screen-capture` = new native module; not added). Screenshots are not blocked.
- Android auto-backup: set `"android": { "allowBackup": false }` in `app.json` (shared file, not edited by me) or AsyncStorage goes to Google Drive backups.
- Fatal native crashes may kill the process before the note is written (1.5 s grace on JS fatals). Crash messages can carry a word in plain prose; names cannot be detected. Screen says so.
- Google sign-in is untestable here (no Supabase redirect allow-listed, nothing run against the project): the flow is unit-tested with fakes only.
- Cloud deletion of "cloud copy" covers only the 2 tables this app writes; the screen says so.
- `smoke-routes.py` auto-discovery maps `folder/index.tsx` to `/folder/index` (invalid); I named the route `onboarding/welcome` to avoid it.

## Google sign-in: what the owner sets (no secret in the repo)
1. Supabase > Authentication > Providers > Google: enabled (already used by the website).
2. Supabase > Authentication > URL Configuration > Redirect URLs: add `finos://auth-callback` (and the `exp://.../--/auth-callback` shown by `Linking.createURL('auth-callback')` for Expo Go testing).
3. Build env: `EXPO_PUBLIC_GOOGLE_SIGNIN=1`. Google Cloud Console needs only Supabase's `https://<ref>.supabase.co/auth/v1/callback` (already there).

## Entries for shared files
- `app.json`: `"android": {..., "allowBackup": false }`.
- `lib/i18nHi.ts` (Hindi, first pass): add entries for the new strings: "Feedback", "Diagnostics", "Welcome to FIN·OS", "Skip for now", "Get started", "A little about you", "Your money personality", "Keep it private", "Language and look", "You are set", "Open Home", "Save feedback", "Share my feedback…", "Delete all my feedback", "Crash notes", "Screen counts (off by default)", "Something went wrong on this screen", "Try again", "Go to Home", "Continue with Google", "Reminders on this phone", "Turn on reminders", "Not now".
- Dashboard/Money Score result: `<FeedbackPrompt topic="money-score" page="/tools/score" question="Did your Money Score feel right?" />`.
- Website `js/finos-feedback.js` redact leaks UPI handles, spaced digits and non-ASCII digits (see `redact.parity.test.mts`); recommend porting the `before`/`after` rules from `mobile/lib/redact.ts`. Team summariser drops phone report pages as `unknown` (screen names are not html paths).
- Privacy notice changes (made in `lib/privacy.ts`, stays true): new `reports` flow, new NOT_DOING line, Google sign-in wording, DATA_ITEMS for feedback/crash/usage/consents/onboarding.

## Tests
`cd mobile && npm test` (new: redact.parity, feedback.parity, diagnostics, onboarding, erase, storageKeys, secureSession, googleAuth, deleteAccountSql, appLock additions). Mutation-checked: removing write-ahead in `tryPin`, and the UPI rule in `redact`, each fail tests. At the time of writing, 23 failures remain in calculator parity tests caused by other agents' in-progress website calculator edits (not this area). `npx tsc --noEmit` clean. Smoke (8093 dev server) + manual: first run opens welcome, skip persists, reload goes Home, thrown error recorded redacted.

## Commit
```
git add -- mobile/lib/redact.ts mobile/lib/consents.ts mobile/lib/usage.ts mobile/lib/feedback.ts mobile/lib/feedbackStorage.ts mobile/lib/appInfo.ts mobile/lib/diagnostics.ts mobile/lib/diagnosticsStorage.ts mobile/lib/onboarding.ts mobile/lib/onboardingStorage.ts mobile/lib/onboardingActions.ts mobile/lib/permissions.ts mobile/lib/permissionPrompt.ts mobile/lib/storageKeys.ts mobile/lib/eraseEpoch.ts mobile/lib/eraseDeps.ts mobile/lib/tempFiles.ts mobile/lib/secureSession.ts mobile/lib/googleAuth.ts mobile/lib/dataControls.ts mobile/lib/appLock.ts mobile/lib/appLockStorage.ts mobile/lib/backup.ts mobile/lib/supabase.ts mobile/lib/privacy.ts mobile/lib/trackerSync.ts mobile/lib/holdingsStore.ts mobile/lib/trackerSyncStore.ts mobile/hooks/useAuth.tsx mobile/components/ErrorBoundary.tsx mobile/components/SharePreview.tsx mobile/components/FeedbackPrompt.tsx mobile/components/LockGate.tsx mobile/app/_layout.tsx mobile/app/index.tsx mobile/app/onboarding/welcome.tsx mobile/app/feedback.tsx mobile/app/diagnostics.tsx mobile/app/login.tsx mobile/app/settings.tsx mobile/app/security.tsx mobile/app/privacy.tsx supabase/delete_account.sql mobile/__tests__/redact.parity.test.mts mobile/__tests__/feedback.parity.test.mts mobile/__tests__/diagnostics.test.mts mobile/__tests__/onboarding.test.mts mobile/__tests__/erase.test.mts mobile/__tests__/storageKeys.test.mts mobile/__tests__/secureSession.test.mts mobile/__tests__/googleAuth.test.mts mobile/__tests__/deleteAccountSql.test.mts mobile/__tests__/appLock.test.mts docs/agent-notes/trust-platform.md
git commit -F - <<'MSG'
Trust platform: crash notes, feedback, onboarding, erase flow, lock hardening

- On-device redacted crash notes, ErrorBoundary, Diagnostics screen, opt-in screen counts (no service, nothing automatic)
- Feedback loop ported from the website (endpoint null, share sheet), redaction parity-tested and hardened
- First-run onboarding: skippable, resumable, shown at most twice, writes only answered fields
- One erase flow: signs out first, resets memory, notifications, cache files, secure storage; leftover check
- delete_my_account() now removes rows of tables without cascading foreign keys
- Lock: attempts counted before the check, fail closed, privacy cover, biometric confirmed at toggle
- Session tokens encrypted under a secure-storage key; device-only keys kept out of sync and backup
- Google sign-in code path gated by EXPO_PUBLIC_GOOGLE_SIGNIN (nothing run against a project)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
```
