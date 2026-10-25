# Money Reels: the guide

Short animated lessons with Mitra the owl, in the FIN-OS phone app (Reels tab, `/learn/reels`) and in a smaller web version (`html/reels.html`). A reel is **data, not video**: 4 to 9 scenes with captions in English and Hindi, an optional picture or character, at most one thing to do (a "beat"), and one quiz question. The phone draws it, so a reel is a few kilobytes, works offline, follows language and text size, and a wrong figure is fixed by editing one line.

**This is the one reference.** What is built and what still needs people is on `docs/REELS-STATUS.md`. Per-feature detail is in `docs/reels/` (one file per feature, linked below). Adding a reel: `docs/REELS-AUTHORS.md`. The older plans (`docs/REELS-MVP-PLAN.md`, `docs/REELS-400-PLAN.md`) are history with a status header. Verified against the code on **24 Oct 2026** (the date the numbers below were produced).

## 1. What it is, and the principles

The loop: open the app, see **today's episode** (one to three reels chosen for this person), answer a question, tap through to the tool that applies it to their own numbers (or pledge to do it), and come back tomorrow. Reels are the "hook" side; the trackers, calculators, Money Score and Arya are the "do" side.

Principles, and what enforces each:

| Principle | In practice | Enforced by |
|---|---|---|
| Education, not advice | No named stock, fund or product; no "you should buy"; no return promise; every percentage is an assumption or an example | `lib/reels/validate.ts` (banned wording, assumption cues), `qa.ts` (softer wording, links, PAN/Aadhaar, e-mail), compliance read (a person) |
| Every figure is computed | Captions use `fill()` and `money()` over `lib/reels/figures.ts`, `figures-play.ts` and `lib/taxcore.ts`; a "How this is worked out" note says formula, assumptions and date | known-answer tests; a month-by-month ledger re-derives sliders and guesses; `reels-trust2` re-derives shared formulas |
| On the phone | Own figures, taste, moves and counters are read and kept on the device; nothing about the person is in a route, a share or a notice | `lib/privacy.ts` registry, host-coverage test, transparency screen, tests that scan for stray keys |
| No manipulation | One-to-three reel episodes then a calm stop; a streak that forgives a rest day; copy with no fear, urgency, guilt or comparison; no leaderboard; no points | copy wording scans in `reels-notify2`, `reels-home`, `reels-more`; `streak.ts` |
| Distress-aware | A person under strain (EMI at or above half of income, or an active loss of income) is never offered a "put in more" reel | `signals.ts` + `ranker.ts`, 300-person test |
| Steerable | Every pick shows why; "I know this" and "less of this topic" exist; every pledge and reset is the person's | `ranker.ts` reasons, `transparency.ts` |
| Finite | An episode of at most 3, then "That's enough for today" | `episode.ts` |
| Human gate | A draft is not live until a native Hindi reader and a compliance reader both sign it off | `lib/reels/review.ts` |

**What we will never build** (any of these needs a decision to change, not a pull request): tips on what to buy or sell, return promises, ads, social feeds or leaderboards of wealth, loss-framed streak copy or countdowns, sending the person's reel activity or figures off the phone without consent, background tasks that read their money, reels that quote a named product.

## 2. Map of the code

All paths under `mobile/` unless stated. 80 modules in `lib/reels/`.

| Area | Files | What it does |
|---|---|---|
| Data and rules | `lib/reels/types.ts`, `kit.ts` (`t`, `sc`), `validate.ts`, `figures.ts`, `figures-play.ts`, `lib/taxcore.ts` | Reel type, authoring helpers, the script rules, all the maths |
| Library | `content.ts` (exports all), `content-tax.ts`, `content-life.ts`, `content-play.ts`, `content-more-a..d.ts`, `content-w3-*.ts` (5 files), `library.ts` (`LIBRARY`, `ACT_ALL`), `act-more.ts`, `meta.ts`, `journey.ts` (`ACT`, Money Score pillars) | The 177 live reels, their tool links and ladder entries |
| Drafts and gate | `content-w4-*.ts` (3), `drafts.ts`, `drafts-meta.ts`, `drafts-act.ts`, `review.ts` | 50 reels held until `REVIEWED` has them; `EXPO_PUBLIC_REELS_DRAFTS=1` shows all |
| Clock and player | `engine.ts`, `frame.ts`, `hooks/useClock.ts`, `components/reels/ReelPlayer.tsx`, `Mitra.tsx`, `Cast.tsx`, `Scenery.tsx`, `Caption.tsx` | Which scene when, 30 fps frame loop, the owl, 14 cast figures, 7 picture kinds |
| Beats | `beats.ts`, `components/reels/Poke.tsx`, `BeatBoundary.tsx` | guess, slider, myth, spot, path, sort, order: rules, marking, screens |
| Personalise | `mine.ts`, `personal.ts`, `personal-play.ts`, `personal-more.ts`, `signals.ts`, `triggers.ts`, `ranker.ts`, `followup.ts`, `coldstart.ts`, `episode.ts`, `quizorder.ts`, `hooks/useReelsJourney.ts` | Own figures, signals, ranker v3, first week, today's episode |
| Habit loop | `streak.ts`, `moves.ts`, `milestones.ts`, `seasons.ts`, `facts.ts`, `together.ts`, `weekly.ts`, `stats.ts`, `challenges.ts`, `homecard.ts`, `reelsProfile.ts`, `map.ts`, `series.ts` | Streak, pledges and receipts, milestones, challenges, Money Map, series |
| Reminders | `reminders.ts` (plan), `reminders-native.ts` (OS calls), `lib/reelRemindersStorage.ts`, `lib/notificationTaps.ts`, `hooks/useMoveReminder.ts` | Local notices and what a tap opens |
| Voice | `voice.ts`, `speech.ts`, `narration.ts`, `voicePrefs.ts`, `voicePrefsStorage.ts`, `hooks/useVoice.ts` | Phone text-to-speech made to sound like a person |
| Trust and control | `trust.ts`, `components/reels/TrustSheet.tsx`, `transparency.ts`, `transparencyStorage.ts` | "How this is worked out", "What the reels know about you" |
| Share, Ask, Arya | `share.ts`, `sharecard.ts`, `components/reels/ShareSheet.tsx`, `ShareCard.tsx`, `ask.ts`, `AskSheet.tsx`, `aryaLink.ts`, `AryaReelChip.tsx` | Text and image share, what-if questions, Arya both ways |
| Storage | `lib/reelsStorage.ts`, `reelsProfileStorage.ts`, `reelsStatsStorage.ts`, `reelsChallengesStorage.ts`, `reelRemindersStorage.ts` | The keys in section 6 |
| Screens | `app/learn/reels.tsx` (feed), `app/(tabs)/reels.tsx` (redirect), `app/learn/{series,series/*,map,moves,challenges,health,reels-data,voice}.tsx`, `components/ReelsHomeCard.tsx` | See section 9 |
| QA and review tools | `qa.ts`, `qa-allowlist.ts`, `claims.ts`, `hindi-lint.ts`, `hindi-glossary.ts`, `hindi-sheets.ts`, `compliance-sheets.ts`, `review-texts.ts`, `review-corpus.ts`; `scripts/*.mts` | Section 8 and 10 |
| Web | repo root: `html/reels.html`, `js/reels.js`, `js/reels-eval.js`, `css/reels.css`, `js/reels-data.json` (generated), `tests/reels-web.test.js`; `mobile/scripts/export-reels-web.mts` | Section 9 |

## 3. The player and beats

- **A reel**: `{ id, topic, lesson?, tags, title, scenes[4-9], poke?, quiz }`. A scene is `{ ms, mood, say, big?, who?, prop? }` (mood: happy, think, worry, surprised, cheer). Pictures (`prop`): counter, bars, line, donut, coins, shield, steps. `who` replaces Mitra with one of 14 cast figures (`cast.ts`). Quiz: 2-4 options, valid answer, a "why" that teaches. Every text is `{ en, hi }`.
- **Clock**: `engine.ts` maps a millisecond to a scene; `frame.ts` holds the clock as an object outside React (at most 30 redraws a second), so only the progress bar, the stage and a sliding caption watch it. Details and counts: `docs/reels/performance.md`.
- **Beats**: at most one per reel, after a middle scene (the reel pauses). Seven kinds: `guess` (drag a marker on a log scale), `slider` (what-if driven by one of ten `SliderModel`s that call `figures.ts`), `myth` (3-5 Myth/Fact cards), `spot` (tap the red flags in a message), `path` (choose what a character does), `sort` (cards into bins), `order` (tap first to last). Every beat has a **no-touch path**: after 8 s (`IDLE_MS`) it reveals itself; there is always Skip or Continue; a wrong answer is never a fail screen. `isBeatUsable` plus `BeatBoundary` mean a broken beat is skipped, never a broken reel. Live today: 71 of 177 reels have a beat (slider 16, spot 15, myth 12, guess 10, sort 7, path 6, order 5); 106 are plain explainers. Detail: `docs/reels/beats.md`.
- **After the last scene**: the quiz (options are shown in a fixed shuffle by reel id, `quizorder.ts`; the stored order has the right answer first in 85% of reels), then the verdict, this reel's tool ("Try it with your numbers"), and KEEP OR SHARE (Save, I'll do this, Remind me, Play together, Share) and TUNE YOUR REELS (I know this, Less of this).
- **Gestures** (each also a button and a screen-reader action): double-tap the picture = "I'll do this"; swipe right = save; swipe left = steer sheet; hold = how the figures are worked out. Detail: `docs/reels/habit-loop.md`.
- **Trust ribbon**: every reel that quotes a figure shows "How this is worked out" (`trust.ts`: formula, assumptions, as-of date). `docs/reels/trust.md`.

## 4. Personalisation

- **Signals** (`signals.ts`, `deriveSignals` pure, `loadSignals` reads): Money Score pillar scores and the weakest, own figures (`mine.ts`: SIP, spending, emergency fund, loans, all range-checked), declared life events active today, age and income from the profile, months of emergency fund, whether there is a loan, and **strain** (`STRAIN_RATIO` 0.5: biggest EMI at or above half of income, or an active loss of income; a placeholder that a finance professional must set).
- **Moments and meta** (`triggers.ts`, `meta.ts`): calendar (tax-saving season Jan-Mar, regime choice Apr-May, filing Jun-Jul, advance-tax dates), states and life events become named triggers; every reel has a ladder rung (`myth`, `concept`, `decision`, `action`), pillar needs, triggers and a `growth` flag. A test fails if a reel has no entry.
- **Ranker v3** (`ranker.ts`, `followup.ts`): a fresh reel scores `40 + 60 x (0.5 Need + 0.35 Timeliness + 0.15 Readiness + season + milestone + saved) x Fit x (1 - Fatigue)`, capped at 109 so nothing outranks a missed question (110); a right answer a week old is a refresher (20); a pledge not yet started is "Still on your list" (50, at most twice per pledge, never under strain); once a week the last place goes to the best unseen reel for the weakest pillar (blind spot). Known/finished reels go last. Determinism and fairness are tested (500 made-up people: every reel reachable, no topic starved). `docs/reels/ranker.md`.
- **Distress guard**: under strain, `growth` reels are removed from the ranking and reels about easing debt or building a safety net are labelled "gentler pick". The All tab is unchanged.
- **Today's episode** (`episode.ts`, `EPISODE_SIZE` 3): best-ranked, then best playable, then next best preferring new topics, minus those finished today; then the calm stop with a "Tomorrow:" teaser. Fixed for the visit.
- **Cold start** (`coldstart.ts`, `Welcome.tsx`): a one-time welcome (language only if none stored, goals, comfort level; Skip always visible), a first-week nudge that is exactly nothing from day 7 (`BIAS_DAYS`), and a first episode of two reels (a playable myth, then a concept). `docs/reels/coldstart.md`.
- **Your Number**: 17 live reels are rebuilt from the person's own figures when present and sane, else the example stays. The quiz, topic and lesson never change; sharing always uses the example. Under strain the asks-for-more reels keep their examples. `docs/reels/your-number.md`.

#### Your Number, wave 2: the 17 reels and the figure each uses

`start-early` (SIP), `emi-trap` (loan), `emergency-fund` (spending, fund), `guess-sip` (SIP), `delay-cost` (SIP), `guess-emi` (loan), `emergency-target` (spending, fund), `inflation` (spending), `retire-corpus` (spending), `goal-step-up` (SIP), `slide-sip-length` (SIP), `corpus-spend-slide` (SIP), `home-loan-prepay` (loan), `rbi-and-emi` (loan), `emi-rate-slide` (loan), `slide-emi-tenure` (loan balance and rate), `home-loan-affordability` (loan EMI and income). What each changes is tabulated in `docs/reels/your-number.md`.

## 5. The habit loop

- **Episode and streak**: one finished reel keeps the day. `forgivingStreak` (`streak.ts`) bridges one rest day in any seven silently; a second rest in a week or two missed days together ends the run quietly. Dates only, key `finos_reels_days`.
- **Pledges, moves, receipts** (`reelsProfile.ts`, `moves.ts`): "I'll do this" keeps a pledge (max 20); tapping a reel's tool starts a move on a tracked figure (SIP, emergency fund, loan balance). If the figure later genuinely improves, the next visit shows a "You did it" receipt; a tap alone never earns one; unfinished moves expire after 60 days. A pledge not started after 5 days can come back as "Still on your list" (never under strain). `app/learn/moves.tsx` lists pledges, receipts and saved reels (Saved is capped at 60).
- **Milestones, seasons, facts**: real milestones from figures already on the phone (first SIP, 3 and 6 months of cover, a cleared loan; the first check is a silent baseline) show once as a gold banner and are never notified. Diwali week, Budget week and March year-end tint the stage and nudge the ranker (dates 2026-2030, to be re-checked yearly). 23 money facts at the calm stop; a gentle weekly line of counts only; Money date (two people, one phone, example figures only).
- **Challenges v2**: eight seven-day challenges (one task a day, ticked by the person, a missed day costs nothing; two original, six added). `suggestChallenge(profile, signals, state)` picks at most one (never a `growth` one under strain) but **no screen calls it yet**: the calm stop shows a fixed "Try a 7-day challenge" button. `docs/reels/challenges.md`.
- **Reminders** (all local, all opt-in or tied to a person's own choice): "when will you do it?" after a reel, an optional daily nudge, a follow-up on a pledge on day 3 (default on only after the person set a nudge or a reminder), an optional Sunday look-back, and one merged plan `planAll`: at most one notice a day, between 8:00 and 21:00, at most 6 scheduled (`MAX_SCHEDULED`) within 14 days, no amount on the lock screen. Taps open a plain in-app route only. `docs/reels/notifications.md`.
- **Reels health** (`stats.ts`, `app/learn/health.tsx`, from Diagnostics): daily counters with no reel names or amounts, shown against the blueprint's starting hypotheses (Money Days, moves per 100 reels, steering taps, minutes, episode finish rate, pledges). Shares are not counted.
- **Map and series**: the Money Map (`/learn/map`, 9 topics x 4 rungs, no points) and 6 live story series (`/learn/series`); 2 draft series (Married and Money, New Parent) appear only when every episode is live.
- Everything in this section: `docs/reels/habit-loop.md`.

## 6. Trust, privacy and storage

Every reels key is in `DATA_ITEMS` in `lib/privacy.ts` (so it is in the person's export, backup and erase), and `reels-transparency` fails if a key is missing from the transparency screen. The `finos_session_` prefix means **never synced**; the two `finos_reels_` keys sync with other tracker data only if the person signs in (and that backend is currently not usable, see `docs/PENDING.md` U1, U8).

| Key | Holds | Written by | Synced |
|---|---|---|---|
| `finos_reels_watched` | which reels, when, quiz right | `lib/reelsStorage.ts` (feed, player) | yes, if signed in |
| `finos_reels_days` | days with a finished reel (streak) | `lib/reelsStorage.ts` | yes, if signed in |
| `finos_session_reels_profile` | known, "less of", saved, pledges, milestones seen, welcome answers (`start`), play style, tips | `lib/reelsProfileStorage.ts` via `reelsProfile.ts` pure helpers (feed, Welcome, steer sheet, My moves) | never |
| `finos_session_reels_moves` | moves started and receipts | `lib/reelsProfileStorage.ts` via `moves.ts` | never |
| `finos_session_reels_stats` | daily counts, no names or amounts | `lib/reelsStatsStorage.ts` (`recordStat`) | never |
| `finos_session_reels_challenges` | challenges started, tasks ticked | `lib/reelsChallengesStorage.ts` (challenges screen) | never |
| `finos_session_reels_voice` | speed, style, breaths, voice per language | `lib/reels/voicePrefs.ts` / `voicePrefsStorage.ts` (voice screen) | never |
| `finos_session_reels_nudge` | daily nudge on/off and hour | `lib/reelRemindersStorage.ts` (reminders sheet) | never |
| `finos_session_reels_reminders` | reminders set after a reel | `lib/reelRemindersStorage.ts` (`WhenSheet`, `useMoveReminder`) | never |
| `finos_session_reels_notify` | follow-ups, look-back, when each follow-up was placed | `lib/reelRemindersStorage.ts` | never |
| `finos_session_reels_web_*` (`seen`, `days`, `episode`, `stats`, `saved`, `pledges`) | the web page's own record, in the browser only | `js/reels.js` | never (the site does not sync `finos_session_*`) |

Also: the trackers' own figures (SIP, spending, fund, loans) are only **read** (`mine.ts`); the reels never write them. `/learn/reels-data` shows everything in plain words, why today's first reel was picked, and a reset per part (and for all); resetting "reels finished" removes the phone copy only, a signed-in cloud copy can bring it back until deleted in Privacy & your data. `docs/reels/transparency.md`.

Two human gates stay open: legal review of the privacy and terms text (U2) and the compliance read of the reels (section 8).

## 7. Voice, accessibility, performance

- **Voice** (sound is off until the person turns it on; never autoplays): the phone's text-to-speech reads captions, each beat's question and reveal, and the quiz and its verdict. `speechText` makes amounts, percent, acronyms and the 1930 helpline speakable; scenes are stretched to what the voice needs (`withVoiceTiming`, about 31 s for a 23 s reel); the caption lights the word being spoken; mood changes rate and pitch; `pickVoice` prefers enhanced voices. A voice screen (`/learn/voice`) sets speed, style, breaths and the voice per language. **Nobody has listened to it on a real phone.** A recorded voice is not built: a recording brief exists (`docs/voice/recording-brief-en.md`, `-hi.md`) but playing clips needs `expo-audio`, which is not a dependency. `docs/reels/voice.md`.
- **Accessibility**: one 44 px adjustable scene control; the picture is the one pause/play button; off-screen reels are hidden from screen readers; live regions hold words only (`announce()` on iOS); every beat has a no-touch path and Skip; reduce-motion and large text honoured (audited at 320 px, 1x/1.35x/2x, English and Hindi). Checked in the web preview and DOM only; **VoiceOver and TalkBack have not been tried on a phone**. `docs/reels/accessibility.md`.
- **Performance**: target under 30 KB a reel (largest is 4.3 KB; library 422 KB as JSON), no network, about 30 fps, no sound autoplay. The clock is not React state; a settled picture is not redrawn; Mitra's still parts are built once. Counted: 689 of 936 scenes have no picture, worst scene is 20 of 30 animated pieces (`npm run reels:perf`); in a laptop web preview, render time per second fell 2.5-3.5 times. **Never measured on a phone.** `docs/reels/performance.md`.
- **Haptics** (light/medium impact and success/warning on beats, answers and Money date, `expo-haptics`) are in the code and untried on a phone.

## 8. Content pipeline

1. **Brief**: topic, rung, format, the one thing it teaches, the tool it leads to. `npm run reels:check -- --summary` shows empty topic x rung cells (today: Goals/Myth and Scams/Decision).
2. **Write** with `t()`/`sc()` (`kit.ts`) in a content file; draft waves go in a `content-w*` file listed in `drafts.ts`. Figures only from `figures*.ts` via `fill()`/`money()`.
3. **Register**: `META` (draft: `DRAFT_META`), a tool link in `ACT`/`act-more.ts`/`PLAY_ACT` (not for scam reels), a `TRUST` note if it quotes a figure, optionally a series.
4. **Check**: `npm run reels:check -- <id>` (add `--drafts` for a draft); `-- --all` and `npm test` fail on any blocking line. Known findings are in `qa-allowlist.ts` with a reason each (11 draft entries today; the live library has 1 known library-wide finding: quiz answers skew to option 1 in storage).
5. **Test the maths**: a known-answer test for any new figure (by hand or a plain loop, never by the function under test).
6. **Review gate** (`review.ts`): a draft goes live when `REVIEWED[id]` holds `{ hindi, compliance, on }`. `REVIEWED` is empty today, so the 50 wave-4 drafts are out of the app. `npm run reels:hindi` and `npm run reels:compliance` write the sheets the two readers work from (`docs/hindi-review/`, `docs/compliance-review/`); `node ... scripts/review-sheet.mts > docs/review/<wave>-review-sheet.md` writes the draft side-by-side sheet. The live 177 were built before the gate and have no sign-off record either (0 signed off).
7. **Web**: after any reel change run `export-reels-web.mts` (section 10); `tests/reels-web.test.js` fails if `js/reels-data.json` is stale.
8. **Phone check** (`docs/DEVICE_TEST_CHECKLIST.md` section J): text size, screen reader, reduce motion, notifications, haptics, voice, share image, on a real device.

Library today (`npm run reels:check -- --summary`): **177 live reels** (investing 30, safety/scams 31, goals 21, tax 19, loans 18, protection 17, basics 16, retirement 14, credit 11), ladder myth 45 / concept 59 / decision 51 / action 22; 106 explainers + 71 with beats; 6 live series, 138 reels in no series (all reachable on the Money Map); 0 reels quoting a figure without a trust note. **50 drafts** (safety 16, goals 8, loans 6, basics 6, invest 4, credit 4, retire 3, protect 2, tax 1). Wave 5 to 9 of `docs/REELS-400-PLAN.md` are not started.

Checkers' Hindi and compliance findings so far are in `docs/reels/review-sheets.md` and the generated READMEs; the tax reels are tied to FY 2025-26 constants (`lib/taxcore.ts`) and need a check against FY 2026-27 (`mobile/docs/REELS-FIGURE-FINDINGS.md`). Details of every check: `docs/reels/checkers.md`; the library history by wave: `docs/reels/library.md`.

## 9. Surfaces

| Surface | Where | Notes |
|---|---|---|
| Reels tab | second of six tabs (Home, Reels, Markets, Arya, Track, Portfolio) | Pressing it pushes the full-screen feed `/learn/reels`, so close returns to the previous tab; `app/(tabs)/reels.tsx` only redirects a deep link. Badge: a tick when today is done, the streak number when alive and open, a dot when today's reel is ready (`reelsTabState`, `useReelsTab`) |
| Feed | `app/learn/reels.tsx` | 11 tabs: For you, Saved, All and the nine topics. Today's episode then calm stop, welcome, banners, steer sheet, reminders, share, Ask Mitra |
| Home card | `components/ReelsHomeCard.tsx` (`homeCard` in `homecard.ts`) | Anchor reel and reason, "1 of 3 today", forgiving streak, Start/Continue/Done, a gold line for a fresh receipt or milestone, "N moves on your list". States: new, mid, done, rest. Strained person: no streak, calm title. `docs/reels/habit-loop.md` |
| Learn | `app/learn/index.tsx` cards | Reels, My moves, Reel voice, What the reels know about you, Story series; also Money Map, challenges, health (Diagnostics) |
| Web page | `html/reels.html` (Learn hub foot link) | Today's three, all seven beats, English and Hindi, saved and My moves, offline via service worker; no personal ranker, voice, reminders, share or Ask. Data 672 KB raw / 169 KB gzipped (budget 720/190). `docs/reels/web.md` |
| Share | `ShareSheet.tsx`, `share.ts`, `sharecard.ts` | Image (1080x1350 PNG via `react-native-view-shot` + `expo-sharing`, saved to downloads on the web) or text; built from the **example** reel, no personal figure, no link. Needs a native rebuild; capture and share sheet untested on a phone. `docs/reels/share.md` |
| Arya bridge | `aryaLink.ts`, `AryaReelChip.tsx`, `AskSheet.tsx` | Arya answer: one chip "Watch a 30-second reel on this" when a reel clearly fits (silent for buy/sell, named products, own figures). Reel: "Ask Arya more" opens Arya with only a reel id (and `mine=1` for four reels on an explicit tap). `docs/reels/ask-and-arya.md` |
| Ask Mitra | `ask.ts` | What-ifs on the reel's example through Arya's phone calculators; refuses buy/sell, never goes online or writes |
| Notices | `reminders*.ts`, `notificationTaps.ts` | Lock screen carries only fixed words and a lesson's public title |

## 10. Testing and tools

Run from `Initial Deployment/mobile` unless noted. Counts are from 24 Oct 2026.

| Command | What it does / prints |
|---|---|
| `npm test` | all mobile tests: **1,567 pass, 0 fail** (about 2.5 minutes). 22 `__tests__/reels*.test.mts` files (about 450 test blocks) cover the library, beats, ranker, personal figures, habit loop, notifications, voice, a11y, perf, share, review tools, QA |
| `npm run typecheck` | `tsc --noEmit`; clean on 24 Oct |
| `npm run lint` | eslint, `--max-warnings 0`; clean on 24 Oct |
| `npm run reels:check -- <id>` | the author's checklist for one reel (validator, Hindi/compliance state, ladder, tool, trust, beat, duration with the voice, quiz, wording, size). Live library first, then drafts |
| `npm run reels:check -- --all` | one line per reel with problems, then library-wide; exit 1 if anything blocks. Today: 177 reels, 163 clean, 0 blocking, 15 warnings, 1 known. With `--drafts`: 50 reels, 29 clean, 0 blocking, 14 warnings, 11 known |
| `npm run reels:check -- --summary` | coverage: topic x rung map, formats, pillars, answer positions, tool links, reachability, trust notes, review state, size. `--summary --drafts` for drafts. (`--drafts` alone prints usage) |
| `npm run reels:perf` | rendering cost counted from the data (pieces per scene, nodes per picture, Mitra nodes, ten heaviest reels); `-- <id>`, `-- --all`, `--drafts` |
| `npm run reels:hindi` | writes `docs/hindi-review/` (CSV per topic, glossary, variants, spelling, index, README); `-- --check` compares without writing (exit 1 if stale) |
| `npm run reels:compliance` | writes `docs/compliance-review/` (`claims.csv`, summaries, README); `-- --check` as above |
| `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs scripts/review-sheet.mts > ../docs/review/<wave>-review-sheet.md` | the side-by-side sheet for draft reels, with sign-off boxes |
| same prefix with `scripts/export-reels-web.mts` (`--check`, `--parity`) | writes `../js/reels-data.json` and prints raw and gzipped KB against the budget; `--check` says whether it is current |
| same prefix with `scripts/verify-numbers.mts` | the phone calculators re-checked by a second method; prints NOTE lines where two screens legitimately differ |
| same prefix with `scripts/voice-brief.mts en` (or `hi`) `> ../docs/voice/recording-brief-en.md` | the recording brief for a voice artist |
| `node --test tests/reels-web.test.js` (repo root) | 21 tests: the data file is current, web maths match the app's TypeScript, offline and tool links |
| `python3 scripts/smoke-routes.py`, `python3 scripts/layout-audit.py` (need `npx expo start --web` running) | every screen opened for errors / text clipping at large text and 320 px; usage in each file's header |
| `npx expo start --web`, open `/learn/reels?id=<id>` | look at one reel |
| `EXPO_PUBLIC_REELS_DRAFTS=1 npx expo start` | include the 50 drafts (review or test build) |

`docs/REELS-INTEGRITY.md` and `docs/REELS-SWEEP.md` (an integrity review and an end-to-end sweep) were being written by other sessions at the time of writing. A device checklist is `docs/DEVICE_TEST_CHECKLIST.md` section J; there is no `reels:smoke` npm script today.

Two tests read this file, so do not rename these: `Challenges v2` and `suggestChallenge` (section 5) and the heading `Your Number, wave 2` with all 17 reel ids in backticks (section 4) (`reels-challenges2.test.mts`, `reels-yournumber.test.mts`).

## 11. Known limits

- **Nothing here has run on a real phone**: notifications (scheduling, permission, delivery, tap), haptics, text-to-speech quality in either language, share as image, VoiceOver/TalkBack, frame rate on a mid-range Android, gestures against the system back swipe.
- **Review gates are open**: no reel has a Hindi or compliance sign-off (0 of 177 live, 0 of 50 drafts). Hindi first pass flagged 360 of 4,764 texts, mostly inconsistent terms (income, salary, tax regime, emergency fund) for a native reader to decide; 473 claims in 161 of 227 reels are waiting for a source and verdict; 8 rates are stated without an assumption cue.
- **Tax year**: the tax reels use FY 2025-26 constants; it is FY 2026-27. Re-check slabs, limits and dates (`tax-dates`, `section-80c`, `section-80d`, `hra-basics`).
- **Figure caveats** (right figure, unstated assumption or rounding): `path-spare-monthly`, `choose-bonus`, `no-cost-emi`, `path-card-bill`, `car-buying-math`, `lifestyle-creep`, `real-return-fd`, `standard-deduction` (`mobile/docs/REELS-FIGURE-FINDINGS.md`). Content was not edited for them.
- **Personal reels are not in the review sheets** (their sentences are built at run time from `personal*.ts`).
- **Code gaps found while writing this guide**: `suggestChallenge` is not wired into any screen; `useReelsJourney` calls `personaliseReels(LIBRARY, mine)` without the strain context, so `start-early` is rebuilt from a strained person's SIP on the All tab (the ranker still never offers it to them); no helpline-style resource card for a person under strain exists (the blueprint lists one); the accessibility pass 2 "not fixed" list (feed top bar wrapping at 1.35x, English-only feed labels, caption and voice both announced with a screen reader) was not re-checked.
- **Not built** (needs assets, people or a backend): recorded voice and commissioned art, more Indian languages (Marathi, Tamil, Telugu, Bengali: would need a per-language review record in the types), backend sync and push, a Money date over the network, share counters, background milestone notices, waves 5 to 9 of the content plan (about 270 more reels). Ask Mitra's tool answers are English even in Hindi; Hindi UI strings on the web page are drafts.
- **Web page** has no personal ranker, so no receipts or milestones; its data file must be regenerated after every reel change and would need splitting by 400 reels.
- **Tool paths**: scam reels deliberately have no tool button and may name only 1930 and cybercrime.gov.in (a test enforces it).
