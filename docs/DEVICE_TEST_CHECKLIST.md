# FIN·OS mobile: device test checklist

Everything here can only be verified on a real phone (or cannot be trusted from the web preview or a desktop test).
The web preview and the node tests already cover logic, layout at 430 px and theme contrast; this list is what is left.

How to use: install the **preview** build (APK / TestFlight) on a **low-end Android** (about 3 GB RAM, Android 10-12, the
slowest phone you can borrow), a **current Android** (13+) and an **iPhone** (iOS 16+). Tick per device. Write what you saw
in the Result column: "ok" is not evidence for anything that is a number or a sentence.

Mark each failing line with the screen, device model and OS version. Start a fresh install (not an update) for section A.

## A. The build itself

| ID | Check | How | Expected |
| --- | --- | --- | --- |
| D-1 | Permissions in the shipped binary | Android: `aapt2 dump permissions app.apk` (or `bundletool dump manifest --bundle app.aab`). iOS: unzip the IPA, open `Info.plist` and the embedded entitlements | Android: INTERNET, POST_NOTIFICATIONS, USE_BIOMETRIC, USE_FINGERPRINT, VIBRATE, RECEIVE_BOOT_COMPLETED only. No RECORD_AUDIO, storage, overlay. iOS: only `NSFaceIDUsageDescription`; no `aps-environment`; ATS arbitrary loads false |
| D-2 | Icon | Home screen, app drawer, Settings > Apps, app switcher | The hexagon with purple core, not clipped, no white border (Android adaptive mask: try circle and squircle launchers) |
| D-3 | Themed icon (Android 13+) | Wallpaper & style > Themed icons | A single-colour hexagon, recognisable |
| D-4 | Splash | Cold start from killed state | Dark #080B14 background, mark centred, no white flash before it, no stretched image. Android 12+: the system splash shows the icon in a circle |
| D-5 | Notification icon | Trigger a reminder (see C-1) | A white hexagon outline in the status bar, tinted by the system, not a solid white square |
| D-6 | App name and version | Home screen label; Settings > About | "FIN·OS" renders the middle dot; Settings shows the version read from the native config (`lib/appInfo.ts`, `expo-constants`): v1.0.0 for this build, not "(version not available)". Bump `app.json` `version` for a test build and confirm the number follows |
| D-7 | Install size and first-launch time | Play / App Store size; stopwatch cold start to dashboard | Record both. Bundle is about 3.5 MB of Hermes bytecode (measured 14 Oct); cold start under 3 s on the low-end phone is the target, write the real number |

## B. Files, share, links

| ID | Check | How | Expected |
| --- | --- | --- | --- |
| D-10 | Bank statement picker | Track > Import a bank statement > choose a CSV from Downloads, from Drive, from a USB/SD location | Picker opens (system UI, no storage permission prompt); the preview shows the rows; Cancel in the picker returns cleanly with no error banner |
| D-11 | Holdings file picker | Same with a broker holdings CSV, and with a wrong file type (a photo, a PDF) | Plain message for the wrong file; nothing saved |
| D-12 | Large file | A 5-10 MB CSV | Preview appears; the UI does not freeze past a few seconds; no crash on the low-end phone |
| D-13 | Share sheet: Money Score | Tools > Money Score > Share | System share sheet opens; text has scores and no rupee amounts; works to WhatsApp, Messages, Copy |
| D-14 | Share sheet: backup file | Security > encrypted backup > Save/Share | File arrives in Drive/Files/WhatsApp with a `.json` name; open it on desktop: it must be ciphertext, no readable amounts |
| D-15 | Restore a backup | Erase app data, import that file, enter the passphrase | Data returns; wrong passphrase gives a plain message and changes nothing |
| D-16 | Feedback / Diagnostics share | Settings > Feedback > Share | The preview text shown equals the text that arrives; no e-mail addresses or long numbers in it |
| D-17 | News link | Markets > News (needs a backend) or skip | Opens in the in-app browser, back returns to the app |

## C. Notifications and background

| ID | Check | How | Expected |
| --- | --- | --- | --- |
| D-20 | Permission prompt timing | Fresh install; browse for 5 minutes | **No** notification prompt until reminders are turned on |
| D-21 | Reminders on | Settings/Reminders > turn on; allow | Prompt appears once; a test reminder (or one set 1-2 minutes ahead) arrives with sound off/on as the system setting says |
| D-22 | Deny, then re-enable | Deny the prompt; turn reminders on again | A plain message that points to system settings; the toggle does not claim "on" |
| D-23 | Reboot persistence (Android) | Schedule a reminder for tomorrow morning, reboot the phone, leave it | It still fires (needs RECEIVE_BOOT_COMPLETED, D-1) |
| D-24 | Tap the notification | Tap it from the shade and from the lock screen | App opens on the right screen; with app lock on, the lock screen appears first |
| D-25 | Doze / battery saver | Android battery saver on, phone idle overnight | Reminder arrives within the system's allowed delay; note the delay. Vendor skins (Xiaomi, Oppo, Vivo) may kill it: record the model |
| D-26 | Time zone / clock change | Change the time zone | Reminders do not duplicate and do not all fire at once |

## D. App lock, biometrics, privacy surfaces

| ID | Check | How | Expected |
| --- | --- | --- | --- |
| D-30 | Store screenshots (optional upgrade) | Capture the 7 screens from the real device or simulator with the same synthetic data (`release-screenshots.py` seed) | Replace the web captures if you want device frames; keep the same order |
| D-31 | Turn on PIN lock | Security > app lock; set a 6-digit PIN | Weak PINs (111111, 123456) are refused with a reason |
| D-32 | Fingerprint / Face ID | Turn it on after the PIN; background and return | System biometric sheet appears; cancel falls back to the PIN; Face ID shows the app's usage string |
| D-33 | No biometrics enrolled | Remove all fingerprints, open Security | The option is unavailable with a plain message, not a crash |
| D-34 | Wrong PIN back-off | 5+ wrong PINs | Waits get longer; force-quit the app mid-wait and relaunch: the wait is **still** running (count survives) |
| D-35 | App switcher privacy | Open the app, show the Net worth screen, press Home, open the app switcher | Document whether the thumbnail shows amounts. (If it does, say so in the store copy or add a blur: this is a known gap to decide on.) |
| D-36 | Screenshot / screen recording | Take a screenshot on Android | Note whether it is allowed (no `FLAG_SECURE` is set: expected to be allowed) |
| D-37 | Forgot PIN path | Follow the on-screen path | Erase and restore works; nothing keeps showing data |
| D-38 | Erase everything | Privacy > erase | Returns to first-run; the secure-store key is gone (reinstall check: no old session) |

## E. Accessibility

| ID | Check | How | Expected |
| --- | --- | --- | --- |
| D-40 | Largest text | Android Settings > Display size and text > Font size max and Display size max; iOS Larger Accessibility Sizes max (about 310%) | Every screen scrolls; no clipped buttons; amounts do not overlap labels. Right-aligned inputs on Budget and Goals used to clip long values; fixed 17 Oct (`minWidth: 0` in `TrackerUI`, checked in the web preview at 430 px with 7-digit amounts): confirm on a device at the largest font, and check the Portfolio title no longer breaks mid-word beside its three buttons |
| D-41 | TalkBack (Android) | Settings > Accessibility > TalkBack; swipe through Home, Budget, Money Score, Tax planner | Every control has a spoken name and role; order is sensible; charts have a text equivalent; no "unlabelled button" |
| D-42 | VoiceOver (iOS) | Same screens | Same; the tab bar announces the selected tab; the Arya button has a name |
| D-43 | Switch access / keyboard | Bluetooth keyboard: Tab through a form | Focus order is logical; Enter submits |
| D-44 | Reduce motion | OS setting on | No essential info is conveyed by motion only |
| D-45 | Colour and contrast outdoors | Light theme in sunlight | Muted text is still readable (the audit passes WCAG AA numerically; this is the human check) |
| D-46 | Dark / light follow system | Switch system theme while the app is open | App follows (`userInterfaceStyle: automatic`) unless the person chose a theme in Settings; no flash of the wrong theme at launch |

## F. Network behaviour

| ID | Check | How | Expected |
| --- | --- | --- | --- |
| D-50 | Airplane mode | Turn on, kill and relaunch the app, open every tab and 5 trackers | No spinner that never ends, no red error screen; screens that need a backend say so in plain words; trackers and calculators work |
| D-51 | Flaky network | Network Link Conditioner (iOS) / throttled hotspot | Timeouts end in a message within the timeout; the app stays usable |
| D-52 | Sign-in offline | Try to sign in in airplane mode | Plain message; nothing stored |
| D-53 | Sign-in, sync, second device | Sign in on two phones; add a transaction on one | Appears on the other after sync; delete on one does not resurrect |
| D-54 | Delete account | Privacy > Delete my account (after runbook step 5 item 7) | Account gone, signing in again fails, the website shows no data for that user, local data policy as described on screen |
| D-55 | Cleartext backend | Settings > backend: `http://192.168.x.x` (your LAN IP), then Markets | **Expected to fail on a release Android build and on iOS for non-local addresses** (store listing 0.2). Record exactly what the person sees; it must be a plain message |
| D-56 | HTTPS backend | Same with an `https://` address | Works, or a plain message |

## G. Performance (the only way to know)

| ID | Check | How | Expected |
| --- | --- | --- | --- |
| D-60 | PBKDF2 speed for backup / unlock | Security > create encrypted backup with a passphrase, and restore it. The app uses PBKDF2-SHA256 at 310,000 iterations in pure JavaScript (`lib/vaultCrypto.ts` `PHONE_ITER`). Stopwatch each, three times, on the **slowest** Android and on the iPhone | Record seconds. Anything over about 10 s on the low-end phone is a product problem: the progress state must show and the UI must not freeze (it yields with `asyncTick: 8`). A restore of a backup from a faster device must work (`MAX_ITER` 5,000,000 is refused with a message) |
| D-61 | Cold start, warm start | Stopwatch | Numbers recorded (see D-7) |
| D-62 | Long lists | A ledger with 2,000+ transactions (import a big CSV) | Scrolling stays smooth; Transactions opens in a few seconds |
| D-63 | Monte Carlo | Retirement planner (4,000 simulated futures) | Result in a few seconds on the low-end phone; no ANR dialog |
| D-64 | Memory | Android: use all tabs for 10 minutes, then background and return | No restart to splash with lost input |
| D-65 | Battery | Leave for an hour with reminders on | Not in the top battery users |

## H. Platform behaviour

| ID | Check | Expected |
| --- | --- | --- |
| D-70 | Back button / swipe-back | Android back from every screen returns sensibly, never exits mid-form without saving a draft or warning; iOS edge-swipe works |
| D-71 | Rotation | Locked to portrait (`orientation: portrait`) on phones; on iPad the app is not offered (`supportsTablet: false`) |
| D-72 | Keyboard | Fields are not hidden by the keyboard; number pad for amounts; "Done" dismisses |
| D-73 | Edge-to-edge, notch, gesture bar | Content is not under the status bar or the gesture bar on Android 15; Dynamic Island on iPhone 15/16 |
| D-74 | Hindi | Switch language: no truncated strings, correct digits and the rupee sign; native reader signs off the wording |
| D-75 | Locale and numbers | System language Hindi/English-US/English-IN: Indian digit grouping (1,23,456) is used, not the system grouping |
| D-76 | Install over an older build | Update from the previous preview build: data kept, no migration crash |
| D-77 | Restore from phone-to-phone backup | Android auto-backup is off (`allowBackup: false`); iCloud backup of app data: check what is included (AsyncStorage is) and whether that matches the privacy statement |

## I. Screens and flows added after 14 Oct (built and web-preview checked only; nothing here has run on a device)

| ID | Check | How | Expected |
| --- | --- | --- | --- |
| D-80 | Welcome tour | Fresh install, first launch; then Settings > Welcome tour | Opens by itself at most twice, never on a phone that already holds data; Skip leaves nothing written; answers write only what was answered |
| D-81 | Crash note | Settings > Diagnostics after forcing an error (debug build) or a real one | A redacted note (no amounts, e-mails, links); Share sends exactly the text shown; screen counts are off until switched on. A fatal native crash may leave no note: record whether one appeared |
| D-82 | Feedback | Money Score result and Settings > Feedback: Yes, write a line, Save | "Saved on this phone. Nothing was sent."; Share opens the share sheet with the redacted text; Delete removes it |
| D-83 | Home facts strip | Home with income and spending recorded, a Money Score worked out, two days in a row | Greeting with the first name only when a name is recorded (no stand-in name), "N-day streak" from day two, chips only for recorded facts; the cross hides the strip, Settings > Facts strip on Home brings it back |
| D-84 | Learn | Learn tile: open a lesson, mark it learned, kill and relaunch | Progress kept; offline works (lessons are bundled); Home tile count matches |
| D-85 | PULSE and Arya memory | PULSE, then Settings > What Arya remembers: add a note, turn memory off, delete all | Memory and life events are off until switched on; "what is sent" matches what is shown; delete empties it; offline Arya still answers a question about your own figures |
| D-86 | Insurance hub | Insurance tracker > Insurance guides; record a policy first | Hub lists it against the cover types; answering questions persists; nothing ranks or recommends a product |
| D-87 | Funds and market research (needs an HTTPS backend) | Markets > Mutual fund search, Market research, Watchlist row > Research | With a reachable backend: results with the date of the data; without one: a plain offline message and the last saved answer marked with its time; no spinner that never ends |
| D-88 | Calendar export | Settings > Your dates: add a monthly date, Export | Share sheet gets an .ics; the phone's calendar app imports it with the repeat; on Android the file is removed at the next launch |
| D-89 | Planners | Spending forecast, Life goals, Growth projection, Couple finance, Benchmarks | Each shows "Not recorded" where data is missing, never a default; couple figures are not synced (they are in your own export and backup) |
| D-90 | Erase everything | Privacy > erase after setting reminders, a lock, and signing in | Signed out first, scheduled and delivered notifications cleared, cache files gone, lock removed, first-run state back |
| D-91 | Unreadable stored value | Not testable on a device without a corrupted store: covered by `corruptData.test.mts` (170 tests) | Listed so nobody looks for it on a device |
| D-92 | Hindi first pass | Settings > Language > Hindi, open the screens above | No clipped text; the new strings are a **first pass**: a native reader must sign them off (PENDING U10) |

## J. Money Reels (built and web-preview checked only; nothing here has run on a device)

| ID | Check | How | Expected |
| --- | --- | --- | --- |
| D-100 | Reels tab and badge | Open the app; look at the second tab; finish today's episode; come back the next day | Reels is the second of six tabs; pressing it opens the full-screen feed, not a tab screen; the badge shows a dot when today's reel is ready, the streak number when a streak is alive and today is open, a tick when today is done |
| D-101 | Read-aloud voice | Sound on, one reel in English and one in Hindi, with at least two voices installed | The caption is spoken in step with the lit word; rupees, percent and E M I are said as words; pauses fall at sentence ends; no overlap with the next scene. Write down which voice you heard: quality depends on the installed voices |
| D-102 | Reel voice settings | Learn > Reel voice: change speed, style, breaths and the voice for each language; play the sample; kill and relaunch | The sample follows the choices, the choices are kept, enhanced voices are listed first |
| D-103 | Share as image | A reel's Share > Share as image, then Share as text | The system share sheet gets a 4:5 PNG with the topic, Mitra and the takeaway and **no personal figure**; on a build made before `react-native-view-shot` was added, the sheet says it could not make the picture and falls back to text |
| D-104 | Screen reader on the feed | VoiceOver / TalkBack through one reel, the question and the calm stop | The picture is one pause/play button; the caption and big words are read; reels off screen are not read; the verdict is announced once; after the answer the verdict, the move and Next come before Keep / Tune |
| D-105 | Gestures | Double-tap the picture; swipe right; swipe left, with gesture navigation on | Double-tap = "I'll do this", swipe right keeps the reel, swipe left opens "I know this / fewer on this topic"; none of them triggers the system back gesture |
| D-106 | My moves and reminders | Learn > My moves: add a move from a reel, tap Remind me, pick a time, then deny and re-allow notifications | The reminder arrives at that time with a plain message; a denied permission gives the plain message of D-22; the button fits a 320 dp screen |
| D-107 | Small screen, large text, reduce motion | 320 dp width or Display size max, text at 1.35x and 2x, then toggle reduce motion while a reel is open | Nothing is clipped or overlapping on the question, the calm stop, the sheets and the banners (known: the feed's top bar wraps into the topic chips from 1.35x text); the motion setting takes effect without a restart |

## Sign-off

Device(s), OS version(s), build number, date, tester. Any failing row blocks the production build unless the owner
accepts it in writing in the release notes of that build.
