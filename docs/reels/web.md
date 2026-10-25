# The web version (html/reels.html)

Part of the Money Reels guide (`docs/REELS.md`, section 9).

## What it is and how it stays in step

A small version of the feed for people without the app: **Learn → Money Reels** on the website (`html/reels.html`, linked at the foot of the Learn hub `html/foundations.html` as a plain link, not a portal card, because `mobile/scripts/extract-learn.py` builds the app's Learn hub from every `a.portal-card` and from line numbers in that file; found by site search). Today's episode of three reels, then a calm stop. It plays the same scripts as the app, in English and Hindi, in the browser only, and every try-it type is playable: guess, slider, myth or fact, spot the scam, choose a path, sort, put in order.

**Regenerate the data after any change to the reels** (a script, a quiz, a tool link, a trust note, a fact, a new reel going live):

```bash
cd mobile
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs scripts/export-reels-web.mts
```

It writes `js/reels-data.json` and prints the size in KB (raw and gzipped) against the budget (720 KB raw, 190 KB gzipped, set at the top of the script; raise it on purpose, never by accident). Add `--check` to see whether the file is current without writing it. `tests/reels-web.test.js` fails when the file is out of date, so a reel edited in the app cannot silently differ on the site. The output is deterministic (no dates, no clock), so the file only changes when a reel does.

What the export holds: every **live** reel (`LIBRARY`, which already excludes drafts that have not passed the review gate; the script refuses to run in a build with `EXPO_PUBLIC_REELS_DRAFTS=1`, and skips any reel built from a person's own figures), with the quiz options in the app's scrambled order (`withScrambledQuiz`); the 23 money facts; and per reel the topic, title, scenes, quiz, beat, "how this is worked out" note and tool button. Every text is an `[english, hindi]` pair. The reels are the app's example figures only; nothing personal can be in the file.

How the file is kept small: object keys are written short (`KEYS` in `js/reels-eval.js`; a key not in the table is written as it is) and a formula or button label that several reels share is written once in `texts` and pointed at by position. `FinosReelsEval.expand(data)` gives back the long form, which is what the page and the tests read. Hindi is three bytes a letter in UTF-8, so most of the raw size is Hindi; gzipped it is about a quarter.

How the figures stay honest: the file carries each slider's **inputs** (the model kind and its numbers), not its answers. `js/reels-eval.js` is a line-for-line copy of the app's `evalModel`, `sliderLine`, `sliderBars`, `money`, the guess scale, the fixed shuffle for "put in order", how each beat is marked (`scoreMyth`, `scoreSpot`, `scoreSort`, `scoreOrder`), `seasonOf` with the same Diwali table, the fact-of-the-day rule, the weekly line, and the saved / "I'll do this" lists. The tax slider calls the site's own `js/finos-taxcore.js`. `tests/reels-web.test.js` runs the app's TypeScript (through `export-reels-web.mts --parity`) and compares: every slider reel at every position; every day from 2026 to 2031 for the season; sample dates for the fact; sample weeks for the weekly line; a scripted run of taps for saved and moves, including the caps (60 and 20); and every quiz's answer against the app's library. If you add a slider model in `beats.ts`, add it to `reels-eval.js` too; the parity test fails until you do. The Diwali dates are listed to 2030 only, as in the app; check them each year.

Tool buttons: the app's routes are mapped to the website's equivalent page in `SITE_PAGE` at the top of `export-reels-web.mts`. A reel whose tool has no page on the site (`/funds/expense`, `/insurance/compare`, `/tracker/budget`, `/tracker/holdings-import`, `/tracker/watchlist`) shows no tool button, as scam reels do on purpose. A test checks every target is a real file.

The look and the extras, as in the app:
- **Seasons**: Diwali week, Budget week and March year-end tint the stage and add a badge (the same dates). `?season=diwali|budget|yearend` on the page address previews a season out of date.
- **The calm stop** shows the day's fact, one quiet line about the last seven days (only counts, never what was missed, and nothing in a week with no reels), the day streak (one rest day in seven is forgiven) and a teaser.
- **Save for later** and **I'll do this** on every finished reel, and a **My moves** list under the feed: moves with when you added them and the tool button, saved reels with "Watch now" (the reel is added to the feed), remove, and "clear everything this page remembers".
- **Offline**: the page is in the service worker's precache (page, script, maths, styles, tax core); the data file is cached by the existing stale-while-revalidate rule for `.json` after the first visit, so the page then works with no connection (checked by stopping the server in a browser with the worker installed on `finos.localhost`, since `pwa-init.js` switches the worker off on `localhost`). It uses the site's manifest, so it installs like any other page; the manifest has no shortcut to it.

Privacy, as in the app: everything stays in the browser. The page's only request is `js/reels-data.json`. No analytics, no sharing, no sync. What is remembered, all under `finos_session_reels_web_` (which the site never syncs): `seen` (reel id, when, whether the quiz was right), `days` (dates, for the streak), `episode` (today's three ids), `stats` (per day, how many reels finished, moves added and reels saved: numbers only, 90 days), `saved` and `pledges` (reel ids; pledges with the day). The page reads the site's language setting (`finos_lang`) and theme.

**What differs from the app**
- No personal ranker, no "your own numbers" reels, no Money Score pillars, and so no receipts or milestones (they need your figures, which this page never sees): the day's three are a fixed daily shuffle of the live library (an unseen reel first, one with something to try, a different topic), the same all day. "Moves started" in the weekly line is always zero for the same reason.
- No voice and no word highlighting, no reminders, no Ask Mitra, no gestures (swipe to save, hold for the formula: the buttons and the details panel do the same), no Money date, no share card, no "I know this" or "less of this topic".
- Mitra is a small simple drawing and cast members are plain head-and-shoulders figures, not the full artwork in `components/reels/`.
- The streak and the counters are the page's own record, kept per browser. They do not read or change the app's.
- Scene lengths are the app's, lengthened a little when the caption needs more reading time (the app waits for the voice instead).
- With "reduce motion" set the pictures show their finished state and a reel waits for Play instead of starting by itself.
- The Hindi interface text (buttons, hints, My moves) is a draft for the native reviewer, as the reels' Hindi is.
- Size (24 Oct 2026): `js/reels-data.json` is 672 KB raw and 169 KB gzipped for 177 reels, against a budget of 720 and 190 (the trust notes are about a seventh of it): about 3.8 KB a reel raw. At 400 reels it would be about 1.5 MB raw (370 KB gzipped): split it by topic or by episode before then.
