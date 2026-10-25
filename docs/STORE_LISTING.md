# FIN·OS mobile: store listing, data-safety and privacy-label answers

Status: **draft for the owner**. Written from what the code in `mobile/` does on 14 Oct 2026. Nothing here has been
reviewed by a lawyer. Hindi is a first pass and needs a native reader. Where this document and the app disagree, the app
(and `mobile/lib/privacy.ts`, guarded by `mobile/__tests__/privacy.test.mts`) is the source of truth: fix this file.

Read section 1 first. There are things the code does that make some natural marketing sentences untrue.

## 0. Things to settle before you paste anything into a console

| # | Issue | Evidence | What to do |
| --- | --- | --- | --- |
| 1 | **Live prices and Arya chat do not work out of the box in a store build.** The backend address defaults to the computer running Expo's dev server, or `10.0.2.2` / `127.0.0.1`. A store build has neither. The user would have to type their own backend address in Settings. | `mobile/constants/endpoints.ts` (host resolution), `mobile/lib/privacy.ts` flow `arya` ("software you run yourself, not a FIN·OS-operated server") | Do not advertise live market prices or the Arya assistant as features. This copy lists them only as "optional, needs your own backend". If you host a backend, set the default, add the host to `privacy.ts`, and redo section 4. |
| 2 | **Plain `http://` backend addresses are blocked in release builds.** Android blocks cleartext traffic by default (target SDK 28+) and iOS App Transport Security is on (`NSAllowsArbitraryLoads=false`; only local-network addresses are exempt). The app builds `http://<host>:<port>` URLs. | `mobile/constants/endpoints.ts` `build()`; prebuilt `Info.plist`; no `usesCleartextTraffic` in `app.json` | Either host the backend over HTTPS, or accept that a self-hosted backend only works on iOS over a local-network address. Do not "fix" with `usesCleartextTraffic: true` without a decision: it weakens the whole app. |
| 3 | **"Delete my account" only deletes everything once `supabase/delete_account.sql` has been run on the project.** Deleting `auth.users` alone leaves `alerts`, `push_subscriptions`, `alert_preferences`, `health_score_history`, `memory_embeddings`, `user_behavior`, `document_ai_log`, `couple_links` (and `profiles` on the live project): no foreign key. The file in the repo now deletes those explicitly (updated by the trust-platform pass; never run against a project from here). Both stores require real in-app deletion. | `mobile/scripts/release-sql-check.py` creates the schema in a real Postgres and lists the rows left behind by a cascade-only deletion; `mobile/__tests__/deleteAccountSql.test.mts` guards the repo file. | Run `supabase/delete_account.sql` (runbook step 5, order 7) before submission. The privacy screen says "Deleting the account also removes what the website saved for it": that sentence is only true after this. |
| 4 | **No web page for account deletion or support exists.** Google Play requires a web URL where a person can ask for deletion; both stores require a support URL and a privacy-policy URL. `html/privacy.html` and `html/terms.html` exist on the website, but they are drafts and name no operator. | `html/` listing; `ENTITY` is all `null` in `mobile/lib/privacy.ts` | Owner decision: name the operator (legal entity or yourself), a contact e-mail and a grievance officer (IT Rules 2021), then publish a privacy URL. Do not invent these. |
| 5 | **Declared permissions differ from the notice.** The prebuilt manifest also holds `VIBRATE` (expo-haptics), `USE_FINGERPRINT` (expo-local-authentication) and, from the notifications library, `RECEIVE_BOOT_COMPLETED` (so reminders survive a reboot). `privacy.ts` `PERMISSIONS` lists only Internet, Notifications and Fingerprint or face. None of them prompts the user, but Play shows them. | `expo prebuild` output and `node_modules/*/android/src/main/AndroidManifest.xml` | Add "Vibration" and "Run at start-up (to keep reminders after a restart)" to `PERMISSIONS` (shared file; the guard test lists the exact array). Confirm on the real `.aab` with `aapt dump permissions` (device checklist D-1). |
| 6 | **Export compliance (Apple) is an owner declaration.** The app uses AES-256-GCM / PBKDF2 for its own encrypted backup and app lock, beyond HTTPS. `ITSAppUsesNonExemptEncryption` is deliberately **not** set in `app.json`. | `mobile/lib/vaultCrypto.ts` | Answer the App Store Connect encryption questions yourself, then optionally set the flag. India-based developers should check the French/EU document requirement if distributing there. |
| 7 | **The financial-services declarations on both stores** (Play "Financial features", Apple Finance category rules) ask about loans, trading, advice. The app does none of these and says it is not SEBI registered. | `mobile/lib/privacy.ts` `TERMS` ("not SEBI registered") | Answer "no loans, no trading, no advice, no money movement". Keep the in-app disclaimers visible in screenshots (the Privacy screenshot does). |
| 8 | **Resolved:** Settings > About used to hard-code "Mobile v1.0.0". It now reads the version through `expo-constants` (`mobile/lib/appInfo.ts`), so it follows `app.json` `version` (1.2.0 on 22 Oct 2026). | `mobile/app/settings.tsx` | Confirm the number on a real build (device checklist D-6). |

## 1. Copy (English)

**Name:** FIN·OS
**Subtitle (Apple, 30 max):** `Private money tools for India` (29)
**Short description (Play, 80 max):** `Track money, plan goals and tax in one private app. Estimates, not advice.` (74)
**Category:** Finance. **Content rating:** see section 5.

### Full description (Play, up to 4000; Apple description)

> FIN·OS is a set of money tools for people in India, built to work on your phone without an account.
>
> Your numbers stay on your phone. There is no advertising, no analytics and no tracking in this app. You can use every
> calculator and tracker without signing in.
>
> WHAT YOU CAN DO
> • Money Score: a 60-second check of your finances, why it came out that way, and the three moves that would raise it most.
> • Track spending against a monthly budget, your goals, subscriptions, insurance policies and what you own (net worth).
> • Plan: retirement (with a simulation of many possible futures), income tax under the old and new regime for FY 2025-26, home-loan and prepayment, SIP step-up, job-offer comparison and more.
> • Import a bank statement or a holdings file. The file is read on your phone, shown to you as a preview, and only then saved. You can undo any import.
> • Reminders for renewals and dues, scheduled on your phone.
> • Light and dark appearance. English and Hindi.
>
> YOUR DATA, YOUR CALL
> • Export your data, or delete it, from Privacy & your data.
> • Protect the app with a 6-digit PIN, or with fingerprint or face, if you turn app lock on.
> • An encrypted backup file, protected by a passphrase only you know.
> • Signing in is optional. If you do, your holdings and tracker data sync to the FIN·OS website and your other devices, and you can delete your account from the app.
>
> GOOD TO KNOW
> • FIN·OS is an educational tool. It is not SEBI registered and does not give investment, tax or legal advice. Scores and results are estimates for planning, built on stated assumptions. Check important decisions with a qualified professional.
> • Market prices and the Arya assistant are optional and need a backend you run yourself (set in Settings). Without one, the app tells you so and keeps working with what you have entered.
> • Calculations are only as good as what you enter. Anything the app does not know is shown as "Not recorded", never guessed.

**Promotional text (Apple, 170):** `Your money, in one place, on your phone. No ads, no tracking, no account needed. Estimates for planning, not advice.` (113)

**Keywords (Apple, 100 max, comma separated):** `budget,net worth,sip,tax,retirement,goals,savings,india,rupee,expense,finance,calculator,insurance`
(97 characters. Apple's field is 100 and a space after a comma counts.)

**What's new (1.0.0):** `First release.`

**Review notes (Apple "Notes for review", Play "App access"):**
> Signing in is optional; every feature works without an account. If you want to see the sign-in flow, create an account
> with any e-mail; no demo account is needed. The app does not request camera, microphone, contacts, photos or location.
> Notifications are local reminders only (no push service). Market prices and the Arya assistant need a backend the user
> runs and are off by default.

(If the Supabase project is not live at review time, say so truthfully rather than leaving the sign-in button to fail:
see runbook step 5.)

## 2. Hindi first pass (needs a native reader before use)

**नाम:** FIN·OS
**उपशीर्षक:** `भारत के लिए निजी मनी टूल्स`
**छोटा विवरण (80):** `पैसा, लक्ष्य और टैक्स एक निजी ऐप में। अनुमान हैं, सलाह नहीं।`

**पूरा विवरण:**

> FIN·OS भारत के लोगों के लिए पैसों के औज़ारों का एक सेट है, जो बिना अकाउंट के आपके फ़ोन पर चलता है।
>
> आपके आँकड़े आपके फ़ोन पर रहते हैं। इस ऐप में न विज्ञापन हैं, न एनालिटिक्स, न ट्रैकिंग। हर कैलकुलेटर और ट्रैकर साइन इन किए बिना इस्तेमाल हो सकता है।
>
> आप क्या कर सकते हैं
> • मनी स्कोर: 60 सेकंड में आपकी आर्थिक स्थिति की जाँच, उसका कारण, और वे तीन कदम जो स्कोर सबसे ज़्यादा बढ़ाएँगे।
> • मासिक बजट के मुक़ाबले खर्च, लक्ष्य, सब्सक्रिप्शन, बीमा पॉलिसी और आपकी कुल संपत्ति (नेट वर्थ) ट्रैक करें।
> • योजना: रिटायरमेंट (कई संभावित भविष्यों का सिमुलेशन), वित्त वर्ष 2025-26 के लिए पुरानी और नई व्यवस्था में आयकर, होम लोन और प्रीपेमेंट, SIP स्टेप-अप, जॉब ऑफ़र की तुलना और बहुत कुछ।
> • बैंक स्टेटमेंट या होल्डिंग्स की फ़ाइल इम्पोर्ट करें। फ़ाइल आपके फ़ोन पर ही पढ़ी जाती है, पहले आपको प्रीव्यू दिखता है, और उसके बाद ही सेव होती है। हर इम्पोर्ट को वापस किया जा सकता है।
> • नवीनीकरण और बकाया के रिमाइंडर, जो आपके फ़ोन पर ही शेड्यूल होते हैं।
> • लाइट और डार्क रूप। अंग्रेज़ी और हिंदी।
>
> आपका डेटा, आपका फ़ैसला
> • अपना डेटा "Privacy & your data" से एक्सपोर्ट या डिलीट करें।
> • ऐप लॉक चालू करने पर 6 अंकों का PIN, या फ़िंगरप्रिंट या चेहरे से ऐप सुरक्षित रखें।
> • एन्क्रिप्टेड बैकअप फ़ाइल, जो सिर्फ़ आपके जाने हुए पासफ़्रेज़ से खुलती है।
> • साइन इन करना वैकल्पिक है। करने पर आपकी होल्डिंग्स और ट्रैकर डेटा FIN·OS वेबसाइट और आपके दूसरे डिवाइस से सिंक होते हैं, और आप ऐप से अपना अकाउंट डिलीट कर सकते हैं।
>
> ध्यान रखें
> • FIN·OS एक शैक्षणिक टूल है। यह SEBI में पंजीकृत नहीं है और निवेश, टैक्स या क़ानूनी सलाह नहीं देता। स्कोर और नतीजे योजना के लिए अनुमान हैं, जो बताई गई मान्यताओं पर आधारित हैं। ज़रूरी फ़ैसलों के लिए किसी योग्य पेशेवर से सलाह लें।
> • बाज़ार भाव और Arya सहायक वैकल्पिक हैं और इनके लिए आपका अपना चलाया हुआ बैकएंड चाहिए (Settings में सेट होता है)। उसके बिना ऐप यह बता देता है और आपके दर्ज किए डेटा के साथ काम करता रहता है।
> • नतीजे उतने ही सही हैं जितना आपने दर्ज किया है। जो ऐप को नहीं पता, वह "Not recorded" दिखता है, अनुमान से नहीं भरा जाता।

**Notes for the reader:** "मनी स्कोर", "नेट वर्थ", "SIP", "PIN" are kept in the form Indian users already see. The quoted
screen names ("Privacy & your data", "Not recorded") stay in English because the Hindi UI strings live in
`mobile/lib/i18nHi.ts`: use whatever that file shows for them once reviewed.

## 3. Screenshots

Generated by `mobile/scripts/release-screenshots.py` from the real app code in the Expo **web** preview, at phone
viewport size, using a **synthetic** profile named "Sample User" with invented figures (seed is in the script). They
are not device captures: no status bar, no home indicator. Both stores accept screenshots of the app running, but if you
want store-grade device captures, take them after the first EAS preview build (device checklist D-30) and replace these.

| Folder | Pixels | Use |
| --- | --- | --- |
| `mobile/assets/store/ios-1290x2796/` | 1290 x 2796 | App Store 6.7 inch (App Store Connect scales it for 6.5 and 6.9 inch slots). iPad is not needed: `supportsTablet` is false. |
| `mobile/assets/store/android-1080x1920/` | 1080 x 1920 | Google Play phone (9:16, minimum 2 per form factor, maximum 8) |

Per theme (`dark-`, `light-`): 01 home, 02 Money Score result, 03 budget, 04 net worth, 05 tax planner, 06 goals,
07 privacy. (Retirement was captured and removed from the set: on the synthetic profile it shows a 1% chance of the money
lasting, which is honest but not what a store page should lead with. Keep it out unless the profile is changed on purpose.)

Order suggestion: 02 score, 01 home, 05 tax, 03 budget, 06 goals, 04 net worth, 07 privacy. Caption each with
what it is, not a promise ("Money Score and the three moves that would raise it").

Known defects visible in the captures, to fix before using them on a store page: on the Budget and Goals screens a
right-aligned input value is clipped at the field edge (`95000` shows as `950`); on the Home screen the market ticker
shows index values whenever the local backend is running (it would be empty on a phone with no backend: re-shoot with
the backend stopped if you want the store page to match what a new user sees). The Portfolio screen is omitted because
its title wraps ("Portfoli / o") at 430 px width.

Graphics: `mobile/assets/store/play-icon-512.png` (Play hi-res icon), `play-feature-graphic.png` (1024 x 500).
`mobile/assets/icon.png` is the 1024 x 1024 no-alpha App Store icon.

## 4. Data-safety (Google Play) and App Privacy (Apple), derived from the code

How to read this: *collected* means data leaves the device to a server the developer controls or whose data the
developer can access. Everything below was traced to a file. Re-derive it whenever `privacy.test.mts` is changed.

### 4.1 Network flows (every one)

| Flow | Destination | What is sent | When | Proof |
| --- | --- | --- | --- | --- |
| Sign-in and sync | Supabase project from `EXPO_PUBLIC_SUPABASE_URL` (HTTPS) | e-mail + password (sign-in); holdings rows; the tracker snapshot (`finos_*` keys except device-only ones) | Only if the person signs in. Off without credentials in the build. | `mobile/lib/supabase.ts`, `lib/holdingsStore.ts`, `lib/trackerSyncStore.ts`, `lib/dataControls.ts` (delete) |
| Google sign-in | Google's own page in the system browser, then Supabase | a one-time code returns to the app | Only if `EXPO_PUBLIC_GOOGLE_SIGNIN=1` was set at build and the owner allow-listed the redirect | `mobile/lib/googleAuth.ts`, `app/login.tsx` |
| Market data and Arya chat | The backend address in Settings (default: the dev machine, so nothing in a store build) | symbols; chat text plus name, income, spending, net worth, portfolio value, SIP total, health score as context | When the person opens Markets, looks up a price or asks Arya | `hooks/useMarketData.ts`, `hooks/useSectors.ts`, `hooks/useAryaChat.ts`, `lib/holdingsStore.ts` `fetchJSON` (fetch allow-list in `privacy.test.mts`) |
| News links | The publisher's site, opened in the in-app browser | nothing from the app; the person's device contacts the site | When the person taps a news item | `mobile/app/market/news.tsx` (`WebBrowser.openBrowserAsync`) |
| Share sheet | Whatever the person picks | Money Score text (no rupee amounts); or a redacted feedback/diagnostics text the person has read | Only on tap | `components/SharePreview.tsx`, `app/tools/score.tsx` |
| Chosen files | none | the file is read locally (`fetch` of a `file:`/`blob:` URI is not a network call) | Import screens | `app/tracker/import.tsx`, `app/tracker/holdings-import.tsx` |

Not present (guarded): analytics or ad SDKs, crash reporters, push tokens (`getExpoPushTokenAsync` etc. absent),
contacts, photos, camera, microphone, location, background location, advertising ID.
`aps-environment` (push capability) is removed by `mobile/plugins/withLocalNotificationsOnly.js`; verified on the
prebuilt `.entitlements` (empty).

### 4.2 Permissions in the built app

| Permission | Why | Prompts? | Proof |
| --- | --- | --- | --- |
| `INTERNET` | Sign-in/sync, optional backend | no | `app.json` |
| `POST_NOTIFICATIONS` | Local reminders | yes, when reminders are turned on (Android 13+) | `lib/remindersNative.ts` |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | App lock with fingerprint or face | system prompt when used | `app/security.tsx`, expo-local-authentication |
| `VIBRATE` | Haptics | no | expo-haptics manifest |
| `RECEIVE_BOOT_COMPLETED` | Re-schedule local reminders after a restart | no | expo-notifications manifest |
| iOS `NSFaceIDUsageDescription` | Face ID for app lock | yes, when used | `app.json` plugin config |

Explicitly blocked in the manifest: `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `READ/WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`.
`expo-av` is installed but unused; remove it from `package.json` when convenient (it is what adds the microphone permission).

### 4.3 Google Play Data safety form

Does the app collect or share any of the required user data types? **Yes, only when the person signs in.**

| Data type (Play) | Collected | Shared | Optional | Purpose | Notes |
| --- | --- | --- | --- | --- | --- |
| Personal info > Email address | Yes | No | Yes (account is optional) | Account management | Supabase (a service provider processing for you is not "sharing" under Play's definition) |
| Personal info > Name | Yes (signed in) | No | Yes | App functionality | `finos_user_name` and `finos_age` are not in the device-only list of `mobile/lib/trackerSync.ts`, so they sync with the snapshot |
| Financial info > Other financial info (holdings, budgets, goals, transactions, insurance, balances) | Yes | No | Yes | App functionality | synced as the tracker snapshot and `holdings` rows |
| Financial info > User payment info / credit score | No | | | | not requested |
| App activity, App info and performance, Device or other IDs, Location, Contacts, Photos and videos, Audio, Files and docs | **No** | No | | | Files the person picks are read on the device and not uploaded |

Security practices: data encrypted in transit **Yes** (HTTPS to Supabase). Users can request deletion **Yes**: in app
(Privacy & your data > Delete my account); you must also give a web URL (section 0, item 4). Independent security
review: **No**. Follows the Families policy: **No** (18+).

Arya backend: data sent to an address the person types goes to *their* server, not to you, so it is not "collected" by
you. If you later run a hosted backend and make it the default, that becomes collection (financial info, name) and this
table must change.

If you ship **without** Supabase credentials in the build (guest-only), answer "No data collected" and remove the
sign-in screen text from the review notes. That is the simplest honest first release.

### 4.4 Apple App Privacy ("nutrition label")

With Supabase configured:

| Apple data type | Collected | Linked to the user | Used for tracking | Purpose |
| --- | --- | --- | --- | --- |
| Contact Info > Email Address | Yes (only if signed in) | Yes | No | App Functionality |
| Contact Info > Name | Yes if synced (see above) | Yes | No | App Functionality |
| Financial Info > Other Financial Info | Yes (only if signed in) | Yes | No | App Functionality |
| Usage Data, Diagnostics, Identifiers, Location, Contacts, User Content (photos, audio) | No | | | |

Tracking: **No** (no ATT prompt; no `NSUserTrackingUsageDescription`). Without credentials in the build: **Data Not Collected**.

## 5. Ratings and declarations

- Apple age rating: no objectionable content categories apply; the in-app terms say 18+. Choose 4+ in the questionnaire
  and state 18+ in the terms; or choose 17+ if you prefer the rating to match the terms. This is your call.
- Play content rating (IARC): finance app, no user-generated content, no violence, no gambling (the app has no betting
  features), no location sharing, users cannot interact. Expected result: Everyone / 3+.
- Play "Financial features" declaration: none of: personal loans, banking, trading, crypto exchange or wallet, advice.
  (The crypto tracker is a manual list, not an exchange; say so if the form asks.)
- Play target audience: 18 and over, not designed for children.
- Government/ads/news declarations: not a government app; no ads; not a news app (market news is a link list).
