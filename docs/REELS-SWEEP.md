# Money Reels end-to-end sweep (Oct 25 2026)

One walk through every Money Reels screen in English and Hindi, after about fifteen sessions had each tested only their own screen. It produced a repeatable script, `mobile/scripts/reels-smoke.py` (`npm run reels:smoke`), and the defect list below. Nothing in `lib/reels`, `components/reels`, `hooks` or the storage files was edited by this sweep; those findings are for their owners.

## How it was run

- **App**: the Expo web preview of `mobile/` on `http://localhost:8082` (`npx expo start --web --port 8082`, already running from another window; `preview_start finos-mobile-web` could not take that port and exited, so the existing server was used). **Web page**: `html/reels.html` from the repository's static server on `http://localhost:4200`.
- **Driver**: Playwright for Python with Chromium 149, the same driver as `smoke-routes.py` and `layout-audit.py`. The layout numbers come from `layout-audit.py`'s `AUDIT_JS` (hscroll, clipped, small targets, overlap), plus three checks of its own: a named control that sticks out past the right edge, named controls the audit skips because they sit inside a bigger control (a sheet inside its backdrop button), and a filter that drops overlap pairs which are not really drawn on screen (text scrolled out of its area, pages of the feed below the one in view).
- **Viewport**: 375 x 812, both languages, text at 1x. One extra pass of the screens that need no interaction at **320 wide with text at 2x** (the audit's text-scale emulation, which multiplies every font size and line height the way the phone's font-size setting does).
- **The Browser pane** (375 x 812) was used for a visual check of the defects below; it is back on its desktop size.
- Date of the run: Oct 25 2026. Other sessions were editing labels (for example the feed's "Close reels" button became Hindi during the sweep), so a finding about a label can already be stale: rerun `npm run reels:smoke` before acting on one.

## Result

**1103 PASS, 38 FAIL, 35 warn, 0 skip** over 1176 checks on 101 screens and steps (English 501 / 9 / 1, Hindi 602 / 29 / 34, as pass / fail / warn). The 38 failures come from 11 distinct defects (D1 to D11 below), several of them seen on more than one screen or size; D12 and D13 are observations the script does not flag. The warns are the Hindi table notes (strings with no Hindi entry yet), "no beat / no guess beat on this reel" notes, and nothing else.

| Check | English pass / fail | Hindi pass / fail |
|---|---|---|
| loads | 66 / 0 | 63 / 3 |
| console | 65 / 1 | 65 / 1 |
| no-hscroll | 65 / 1 | 66 / 0 |
| no-clipping | 61 / 5 | 65 / 1 |
| targets>=44 | 65 / 1 | 65 / 1 |
| no-overlap | 65 / 1 | 65 / 1 |
| no-raw-keys | 66 / 0 | 66 / 0 |
| hindi-text | n/a | 59 / 7 |
| hindi-a11y | n/a | 40 / 15 |
| entry / back / close rows | 27 / 0 | 27 / 0 |

## What the script covers

`python3 mobile/scripts/reels-smoke.py` (or `npm run reels:smoke` in `mobile/`):

| Part | What it does |
|---|---|
| Flows (default) | A new person (storage cleared, language unset): Home card, Reels tab, welcome (language, goal, level), first episode of two reels: pause, trust sheet, Ask Mitra sheet, double-tap pledge, swipe right (save) and left (steer sheet) with synthetic mouse drags, the interactive beat (myth or fact, then cards), the quiz and its answer, the shelf (Save toggles, I'll do this, Remind me, Share as image and as text, I know this), reel 2, the calm stop (week line, money fact), My moves and its Remind me sheet (picks a time), all eight challenges (starts them and follows a task link), the Saved tab, the voice switch long-press, closing the feed, Home card after the episode, every Learn card with Back returning to it, Money Map to a topic, Series list to a series, What the reels know about you with one reset (Cancel keeps the data, OK forgets it), Settings to Diagnostics to Reels health, the Arya chip on "What is a SIP?" opening the SIP reel, and Play together on that reel (it has a guess beat). Then `html/reels.html`. |
| `--routes` | Only the screens that need no interaction (about a minute a language). |
| `--large` | Adds the 320 wide, 2x text pass of the routes. |
| `--lang en` / `--lang hi` | One language. |
| `BASE`, `SITE`, `SMOKE_SHOTS` | App server, static server, where screenshots of failing screens (with the offending boxes outlined), `results.json` and `results.md` go (default `/tmp/reels-smoke`). |

Per screen and language it prints PASS / FAIL / warn / skip for: **loads** (not the 404 page, no NaN / undefined, expected words present), **console** (no error or warning; known web-only warnings are counted and named, not failed), **no-hscroll**, **no-clipping**, **targets>=44** (with the smallest control found), **no-overlap**, **no-raw-keys**, and in Hindi **hindi-text** (no visible English word except product terms such as EMI, SIP, Arya, DICGC and the names of story people, listed in `HINDI_OK`), **hindi-a11y** (the same for accessible names), and an **i18n-table** note listing strings the app asked to translate that have no Hindi entry (`window.__finosMissing()`). Navigation checks (**entry**, **back**, **close**) are separate rows. Without Playwright or Chromium the script prints how to install them and exits 2; without the app it prints how to start it. Exit code 1 when anything FAILs. The Arya check is skipped (not failed) when Arya's backend does not answer in 90 s; the web page is skipped when nothing serves `SITE`.

## Screen by screen, both languages

PASS means every check on that screen passed in that language; `-` means the step does not exist in that language. `PASS (warn)` has a note that is not a failure. Rows with `@320/x2` are the large-text pass.

| Screen / step | English | Hindi | Failing checks and notes |
|---|---|---|---|
| Home card (new person) | FAIL | PASS | en: no-clipping: 'Short lessons with Mitra the owl, about 30 seconds' (y); 'Short lessons with Mitra the owl, about 30 seconds' (ellipsis) |
| Reels tab -> feed | PASS | PASS |  |
| Welcome (cold start) | PASS | PASS |  |
| Welcome: language step | PASS | PASS |  |
| Welcome: goal step | PASS | PASS |  |
| Welcome: level step | PASS | PASS |  |
| Reel 1: scene (paused) | PASS | PASS |  |
| Ask Mitra sheet | FAIL | PASS | en: no-hscroll: control past the right edge: How many months does my emergency fund cover? right=385; no-clipping: 'How many months does my emergency fund cover?' (x) |
| Gesture: double-tap pledge | PASS | PASS |  |
| Gesture: swipe right (synthetic mouse) | PASS | PASS |  |
| Gesture: swipe left (synthetic mouse) | PASS | PASS |  |
| Steer sheet | PASS | PASS |  |
| Reel 1 | PASS | PASS |  |
| Reel 1 beat question | PASS | PASS |  |
| Reel 1 beat reveal | PASS | PASS |  |
| Reel 1 beat | PASS | PASS |  |
| Reel 1: quiz | PASS | PASS |  |
| Reel 1 quiz | PASS | PASS |  |
| Reel 1: after the answer (verdict, shelf) | PASS | PASS |  |
| Shelf: Save | PASS | PASS |  |
| Shelf: I'll do this | PASS | PASS |  |
| Remind me sheet (reel) | PASS | PASS |  |
| Shelf: Play together | PASS (warn) | PASS (warn) | en: present: reel 1 has no guess beat (checked on the SIP reel through the Arya chip)<br>hi: present: reel 1 has no guess beat (checked on the SIP reel through the Arya chip) |
| Share sheet (image + text choice) | PASS | PASS |  |
| Share sheet: Share as image | PASS | PASS |  |
| Share sheet (text) | PASS | FAIL | hi: hindi-text: 3 English: This is exactly what will be shared, and you choose where it goes. Not / Share… / Close; hindi-a11y: 1 English names: यह पाठ साझा करें (text to share) -> [text, share] |
| Shelf: I know this | PASS | PASS |  |
| Reel 1: shelf used | PASS | PASS |  |
| Reel 2: playing | PASS | PASS |  |
| Reel 2: after the answer | PASS | PASS |  |
| Calm stop | PASS | PASS |  |
| Calm stop (week line, fact) | PASS | PASS |  |
| Calm stop -> My moves | PASS | PASS |  |
| My moves (with a pledge and a saved reel) | PASS | PASS |  |
| Remind me sheet (My moves) | PASS | PASS |  |
| My moves | PASS | PASS |  |
| Saved tab (one saved reel) | PASS | PASS |  |
| Saved tab | PASS | PASS |  |
| Voice switch long-press -> voice settings | PASS | PASS |  |
| Voice settings (via long-press) | PASS | FAIL | hi: hindi-a11y: 9 English names: Rishi, standard, recommended / Daniel, standard / Eddy (English (United Kingdom)), standard / Flo (English (United Kingdom)), standard |
| Voice settings | PASS | FAIL | hi: hindi-a11y: 9 English names: Rishi, standard, recommended / Daniel, standard / Eddy (English (United Kingdom)), standard / Flo (English (United Kingdom)), standard |
| Reels feed | PASS | PASS |  |
| Home card (after the first episode) | PASS | PASS |  |
| Home card -> feed | PASS | PASS |  |
| Learn index cards | PASS | FAIL | hi: loads: expected text not found: 'मनी रील्स'; hindi-text: 59 English: Short lessons from FIN·OS, on your phone. For education, not advice; c / 🎬 Money reels / Short animated lessons with Mitra the owl: SIP, inflation, EMI and m |
| Learn card: Money Map | PASS | PASS |  |
| Money Map (from Learn) | PASS | FAIL | hi: hindi-a11y: 9 English names: बुनियादी, 2 of 16 reels watched. Next: जब हर इ -> [reels, watched, Next] / निवेश, 0 of 30 reels watched. Next: SIP के मिथ -> [reels, watched, Next] / लोन, 0 of 18 reels watched. Next: लोन के मिथक,  |
| Learn card: Story series | PASS | PASS |  |
| Story series (from Learn) | PASS | PASS |  |
| Series list -> a series | PASS | PASS |  |
| Series screen (from the list) | PASS | PASS |  |
| Series screen | PASS | PASS |  |
| Learn card: Reel voice | PASS | PASS |  |
| Voice settings (from Learn) | PASS | FAIL | hi: hindi-a11y: 9 English names: Rishi, standard, recommended / Daniel, standard / Eddy (English (United Kingdom)), standard / Flo (English (United Kingdom)), standard |
| Learn card: What the reels know | PASS | PASS |  |
| What the reels know about you | PASS | PASS |  |
| Reels data: reset | PASS | PASS |  |
| What the reels know (after a reset) | PASS | PASS |  |
| Learn card: My moves | PASS | PASS |  |
| My moves (from Learn) | PASS | PASS |  |
| Learn card: 7-day challenges | PASS | PASS |  |
| Learn card: Money reels | PASS | PASS |  |
| Reels feed (from Learn, resumed) | PASS | PASS |  |
| Money Map: a topic | PASS | PASS |  |
| Reels feed (from the Money Map topic) | PASS | PASS |  |
| Settings -> Diagnostics | PASS | PASS |  |
| Diagnostics (from Settings) | PASS | FAIL | hi: hindi-text: 10 English: Crash notes and screen counts, kept on this phone. You can read, delet / FIN·OS has no crash-reporting or analytics service. If the app fails,  / App 1.1.0 · web 0.0.0 / Nothing has gone wrong that was  |
| Diagnostics -> Reels health | PASS | PASS |  |
| Reels health (after an episode) | PASS | PASS |  |
| Reels health | PASS | PASS |  |
| Diagnostics -> What the reels know | PASS | PASS |  |
| Arya answer with the reel chip | PASS | PASS |  |
| Arya chip -> reel | PASS | PASS |  |
| Guess beat (SIP reel): question | PASS | PASS |  |
| SIP reel beat reveal | PASS | PASS |  |
| Play together sheet: intro | PASS | PASS |  |
| Play together sheet: first guess | PASS | PASS |  |
| Play together sheet: result | PASS | PASS |  |
| Web page html/reels.html | FAIL | FAIL | en: console: error: Error: <text> attribute y: Expected length, "NaN".; targets>=44: 'Skip to main content' 171x37; 'Open navigation menu' 38x38; '← Back to Learn' 92x19; 'English' 71x36 (+5)<br>hi: console: error: Error: <text> attribute y: Expected length, "NaN".; targets>=44: 'मुख्य सामग्री पर जाएँ' 139x41; 'नेविगेशन मेन्यू खोलें' 38x38; '← Learn पर वापस' 89x19; 'English' 71x36 (+5); hindi-a11y: 3 English names: Langua |
| Reels data: confirmation text | - | PASS |  |
| Home card (returning person) | FAIL | PASS | en: no-clipping: 'Short lessons with Mitra the owl, about 30 seconds' (y); 'Short lessons with Mitra the owl, about 30 seconds' (ellipsis) |
| Learn index | PASS | FAIL | hi: loads: expected text not found: 'मनी रील्स'; hindi-text: 59 English: Short lessons from FIN·OS, on your phone. For education, not advice; c / 🎬 Money reels / Short animated lessons with Mitra the owl: SIP, inflation, EMI and m |
| Reels feed (resumed) | PASS | PASS |  |
| Challenges | PASS | PASS |  |
| Money Map | PASS | FAIL | hi: hindi-a11y: 9 English names: बुनियादी, 0 of 16 reels watched. Next: जब हर इ -> [reels, watched, Next] / निवेश, 0 of 30 reels watched. Next: SIP के मिथ -> [reels, watched, Next] / लोन, 0 of 18 reels watched. Next: लोन के मिथक,  |
| Story series | PASS | PASS |  |
| Series: First Salary | PASS | PASS |  |
| What the reels know | PASS | PASS |  |
| Diagnostics | PASS | FAIL | hi: hindi-text: 10 English: Crash notes and screen counts, kept on this phone. You can read, delet / FIN·OS has no crash-reporting or analytics service. If the app fails,  / App 1.1.0 · web 0.0.0 / Nothing has gone wrong that was  |
| Home card (returning person) @320/x2 | FAIL | FAIL | en: no-clipping: 'Today’s reel' (x); 'Today’s reel' (ellipsis); 'Insurance myths, sorted' (y) (+3)<br>hi: no-clipping: 'आज की रील' (x); 'आज की रील' (ellipsis); 'बीमा के मिथक, छाँटे हुए' (y) (+3) |
| Learn index @320/x2 | PASS | FAIL | hi: loads: expected text not found: 'मनी रील्स'; hindi-text: 59 English: Short lessons from FIN·OS, on your phone. For education, not advice; c / 🎬 Money reels / Short animated lessons with Mitra the owl: SIP, inflation, EMI and m |
| Reels feed (resumed) @320/x2 | FAIL | FAIL | en: no-overlap: 'Insurance is bought in a hurry and misun' / 'Double-tap: I’ll do this · swipe right: '; 'Insurance is bought in a hurry and misun' / '🦉 Ask Mitra'; 'Money reels' / 'For you'<br>hi: no-overlap: '1 / 2' / 'आपके लिए' |
| Voice settings @320/x2 | PASS | FAIL | hi: hindi-a11y: 9 English names: Rishi, standard, recommended / Daniel, standard / Eddy (English (United Kingdom)), standard / Flo (English (United Kingdom)), standard |
| My moves @320/x2 | PASS | PASS |  |
| Challenges @320/x2 | PASS | PASS |  |
| Money Map @320/x2 | FAIL | FAIL | en: no-clipping: 'Action' (x)<br>hi: hindi-a11y: 9 English names: बुनियादी, 0 of 16 reels watched. Next: जब हर इ -> [reels, watched, Next] / निवेश, 0 of 30 reels watched. Next: SIP के मिथ -> [reels, watched, Next] / लोन, 0 of 18 reels watched. Next: लोन के मिथक,  |
| Story series @320/x2 | PASS | PASS |  |
| Series: First Salary @320/x2 | PASS | PASS |  |
| Reels health @320/x2 | PASS | PASS |  |
| What the reels know @320/x2 | PASS | PASS |  |
| Diagnostics @320/x2 | PASS | FAIL | hi: hindi-text: 10 English: Crash notes and screen counts, kept on this phone. You can read, delet / FIN·OS has no crash-reporting or analytics service. If the app fails,  / App 1.1.0 · web 0.0.0 / Nothing has gone wrong that was  |

## Defects (for the owners)

Ranked by what a person meets first. "Owner" is the area, not a promise. Every item reproduces with the script, and most with the quick steps given.

| # | Defect | Language | Owner |
|---|---|---|---|
| D1 | **Learn index is English in Hindi mode** | hi | Hindi / `app/learn/index.tsx`, `lib/i18nHi.ts` |
| D2 | **Ask Mitra sheet: a suggestion chip runs off the screen** | en | `components/reels/AskSheet.tsx` (integrity session) |
| D3 | **`html/reels.html` logs an SVG error and never draws a figure's label** | both | web reels (`js/reels.js`) |
| D4 | **Home card clips its words** (new person at 375 px; heading and title at large text) | both at large text, en at 1x | `components/ReelsHomeCard.tsx` |
| D5 | **Diagnostics screen is English in Hindi mode**, and it is the entry to Reels health and What the reels know | hi | `app/diagnostics.tsx`, `lib/i18nHi.ts` |
| D6 | **Share sheet, text mode, is English in Hindi mode** | hi | `components/SharePreview.tsx` |
| D7 | **Money Map row names mix languages in Hindi** ("बुनियादी, 2 of 16 reels watched. Next: ...") | hi | `app/learn/map.tsx` |
| D8 | **`html/reels.html` controls are under 44 px** and four accessible names are English in Hindi | both | web reels |
| D9 | **Feed top bar and scene text collide at 320 px with large text** | both | `app/learn/reels.tsx`, `components/reels/ReelPlayer.tsx` (already in REELS.md "Not fixed here") |
| D10 | **Money Map legend runs together at 320 px with large text** ("MythConceptDecisionAction", Action cut off) | en | `app/learn/map.tsx` |
| D11 | Voice screen: accessible names carry English words in Hindi ("Rishi, standard, recommended") | hi | `app/learn/voice.tsx` |
| D12 | Calm stop: two of the four buttons need a scroll at 375 x 812 and nothing hints at it | both | `components/reels/EpisodeEnd.tsx` |
| D13 | Feed is an empty dark screen for about three seconds when it opens on a populated phone | en | feed (`app/learn/reels.tsx`) |

**D1. Learn index in Hindi.** Steps: `localStorage.finos_lang = 'hi'` (or Settings, Hindi), open Home, Learn (`/learn`). Only the title ("सीखें") and Back are Hindi; the intro, the seven product cards (Money reels, Money Map, My moves, 7-day challenges, Reel voice, What the reels know about you, Story series: title and body) and all their accessible names are English: 59 visible strings and 40 accessible names, and `window.__finosMissing()` lists them. The lesson catalogue titles under the cards (website lessons) may be meant to stay English; the cards and the intro are the product's own words. The smoke script's own Hindi flow had to look the cards up by their English names for this reason.

**D2. Ask Mitra chip.** Steps: `/learn/reels`, any reel, press "Ask Mitra". The second suggestion, "How many months does my emergency fund cover?", is 360 px wide at x = 25, so it ends at 385 on a 375 px screen: the words are cut ("...emergency fund cov") and there is no way to read them. Layout audit: `control past the right edge`, `clipped (x)`. Fix is a `maxWidth: '100%'` and wrapping on the chip. Hindi passes.

**D3. Web page SVG error.** Steps: open `http://localhost:4200/html/reels.html`, look at the console: `Error: <text> attribute y: Expected length, "NaN"` (twice per load). `js/reels.js` line 207 calls `textLines(t(prop.label), 100, plain ? 188 : 164, 22)`, but `textLines(text, x, y, max, size, ...)` (line 196) wants a size after `max`: the 22 is taken as the line width, `size` is `undefined`, so every `<text>` gets `y="NaN" font-size="undefined"` and the label under a big figure ("EMI p...", "(illu...") is not drawn. A size argument fixes it. Not edited here (web reels owns the file).

**D4. Home card.** Steps (new person): clear the `finos_session_reels*` keys, open `/dashboard`. In English the card's reason, "Short lessons with Mitra the owl, about 30 seconds each...", is cut at two lines (`numberOfLines={2}` in `ReelsHomeCard.tsx`); Hindi fits. At 320 px with 2x text the heading ("Today's reel" / "आज की रील", `numberOfLines={1}`), the title and the reason are cut in both languages. Raise the reason to three lines and let the heading wrap. Not edited: the file was being changed by another session.

**D5. Diagnostics in Hindi.** Steps: Hindi, Settings, Diagnostics (`/diagnostics`). Ten strings are English (the intro, the "no crash-reporting" paragraph, "App 1.1.0 · web 0.0.0", "Nothing has gone wrong that was recorded."), the two links that lead to the reels screens ("Open reels health", "What the reels know about you") and the switch name ("Count which screens I open ...").

**D6. Share sheet text mode in Hindi.** Steps: Hindi, a reel, answer the question, "यह पाठ साझा करें", "पाठ भेजें". The preview (`SharePreview`) says "This is exactly what will be shared, and you choose where it goes. Not ...", "Share…" and "Close" in English, and its accessible name ends "(text to share)".

**D7. Money Map names in Hindi.** The row's `accessibilityLabel` in `app/learn/map.tsx` is an English template (`..., ${watched} of ${total} reels watched. Next: ...`) wrapped around Hindi topic and reel names. Needs a Hindi variant (wording for the native reviewer, so not changed here).

**D8. Web page targets.** At 375 px: "Open navigation menu" 38 x 38, "← Back to Learn" 92 x 19, the English / हिन्दी toggle 71 x 36, "Skip to main content" 171 x 37 (shown on focus) and five more; in Hindi the accessible names "Language", "Mitra the owl" and "Page tools" are English.

**D9. Feed at 320 px, text 2x** (also in REELS.md, "Accessibility pass 2: Not fixed here"). English: the reel's title overlaps the gesture hint and the Ask Mitra pill, and "Money reels" overlaps the first topic chip. Hindi: "1 / 2" overlaps the chip "आपके लिए". Steps: `TEXT_SCALE=2 VIEW_W=320 python3 mobile/scripts/layout-audit.py /learn/reels`.

**D10. Money Map legend.** At 320 px with 2x text the four legend words sit in equal quarter-width cells that are narrower than "Decision": they run together and "Action" is cut. Needs a layout decision (two lines or two by two), so only listed. The same screen's "Next: ..." line, which was cut at two lines at that size, is fixed (see below).

**D11. Voice accessible names.** Nine voice buttons are named like "Rishi, standard, recommended" in Hindi mode; "standard" and "recommended" are English. The OS voice names themselves are the phone's.

**D12. Calm stop.** At 375 x 812 (seen in English) "Done" and "My moves" show, and "Try a 7-day challenge" and "Keep exploring (optional)" need a scroll inside the page, with "Change my answers" pinned underneath and no scroll indicator. Both are reachable; nothing tells a person they are there.

**D13. Empty feed.** Steps: on a phone that already has watched reels, open `/learn/reels`: the top bar and chips draw, the body is empty for about three seconds, then the first reel appears (seen in the Browser pane on a loaded machine; the script does not time it).

## Fixed in this sweep

Three tiny layout or label fixes in `app/learn/` files that nobody else was editing (re-read just before each edit):

- `app/learn/challenges.tsx`: each Start button now names its challenge ("Start: Find your leak in 7 days"); before, all eight were named just "Start", so a screen reader could not tell them apart. (One attribute.)
- `app/learn/map.tsx`: the "Next: ..." line under each topic no longer stops at two lines; at 320 px with 2x text the next reel's title was cut.
- `app/learn/voice.tsx`: the three sample rows may wrap, so the mood word ("surprised", "cheering") is no longer cut at 320 px with 2x text.

Verified with the 320 px / 2x pass: the three clips are gone. `npm test` (1,585 tests), `npx tsc --noEmit` and `npm run lint` are green.

## Not defects, and what was not covered

- **Console**: no console error or warning on any reels screen of the app. Seen and not counted as failures: failed network requests (Arya's and the voice agent's backends, favicon), and on `html/reels.html` a Chrome warning about an iframe with `allow-scripts` and `allow-same-origin` that comes from the site-wide voice widget (`js/finos-widget.js`), not from the reels page.
- **Reminders on the web** say "Reminders work in the phone app, not in the browser preview." after a pick; that is the right message here, and the script checks the sheet says something.
- **Not covered, needs a real phone**: VoiceOver and TalkBack (only the accessibility tree and accessible names were read), the phone's own share sheet (Share as image only ends in "picture saved" or the text fallback in the browser), notifications, spoken voice, haptics, safe-area insets, a real large-text setting (the audit multiplies font sizes instead), and the quality of the Hindi (only whether English is left over).
- **Beats**: the first episode held a myth/fact beat and a cards beat; Play together was exercised on the SIP reel's guess beat. The other beat kinds (slider, spot the red flag, sort, order, paths) are covered by the library tests, not by this walk.
- **The script's own filters**: it drops overlap pairs that are not both drawn on screen, clipped lines inside an area that has scrolled, and glyphs that overhang a line box by under 3 px. If a real problem hides behind one of those, `layout-audit.py` shows the unfiltered numbers.
