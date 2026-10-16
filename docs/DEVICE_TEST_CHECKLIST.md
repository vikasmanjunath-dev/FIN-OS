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
| D-6 | App name and version | Home screen label; Settings > About | "FIN·OS" renders the middle dot; Settings shows v1.0.0 (hard-coded: expected to match `app.json`) |
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
| D-40 | Largest text | Android Settings > Display size and text > Font size max and Display size max; iOS Larger Accessibility Sizes max (about 310%) | Every screen scrolls; no clipped buttons; amounts do not overlap labels. **Known**: right-aligned inputs on Budget and Goals clip long values in the web preview: check them first |
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

## Sign-off

Device(s), OS version(s), build number, date, tester. Any failing row blocks the production build unless the owner
accepts it in writing in the release notes of that build.
