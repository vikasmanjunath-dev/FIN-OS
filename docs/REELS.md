# Money reels

Short animated lessons with Mitra the owl, in the app under Learn → Money reels (`/learn/reels`). A reel is **data**, not a video: scenes with captions in English and Hindi, a picture for some scenes, and one quiz question. The app draws it on the phone, so a reel is a few kilobytes, works offline, follows the language and text size, and a wrong figure is fixed by editing one line.

## Where things are

| What | File |
|---|---|
| The reels (scripts, quiz) | `mobile/lib/reels/content.ts` |
| Numbers used in captions (SIP, EMI, inflation, rule of 72, fund units, 100 minus age), `money()`, `fill()` | `mobile/lib/reels/figures.ts` |
| Types (scene, prop, mood, quiz) | `mobile/lib/reels/types.ts` |
| The clock: which scene at which millisecond | `mobile/lib/reels/engine.ts` |
| The rules every script must pass | `mobile/lib/reels/validate.ts` |
| Mitra (vector owl, moods: happy, think, worry, surprised, cheer) | `mobile/components/reels/Mitra.tsx` |
| Pictures: counter, bars, line, donut, coins, shield, steps | `mobile/components/reels/Scenery.tsx` |
| Player and quiz | `mobile/components/reels/ReelPlayer.tsx` |
| The swipe feed and topic chips (All, Investing, Loans, Protection, Basics) | `mobile/app/learn/reels.tsx` |
| Optional voice (phone text-to-speech) | `mobile/lib/reels/speech.ts` |
| Progress ("watched", quiz right) | `mobile/lib/reelsStorage.ts` (key `finos_reels_watched`) |
| Tests | `mobile/__tests__/reels.test.mts` |

## Adding a reel

1. Add an object to `content.ts` (with a `topic`: `basics`, `invest`, `loans` or `protect`, which drives the filter chips in the feed) and put it in `REELS`. Every text is `{ en, hi }`; use `fill()` and `money()` for figures and put the maths in `figures.ts`, never type a figure into a caption.
2. Run `cd mobile && npm test`. `validateReel` checks, for every reel: 20 to 45 seconds, 4 to 9 scenes, 2.5 to 6.5 seconds a scene, caption length, both languages present (and Devanagari in Hindi), no promise or advice wording ("guaranteed returns", "you should buy", "risk-free"), percentages described as assumptions or illustrations, picture text that fits its box, a valid quiz, a checklist of at most 4 rows, a plain counter that names its unit, and a reading speed under 28 characters a second.
3. Add a known-answer test for any new figure to `reels.test.mts`, and for what the caption must say.
4. Look at it: `npx expo start --web`, open `/learn/reels?id=your-id`.

## Rules for content

- Education, not advice. Say "assumed", "about", "illustration", "not guaranteed". Never tell the viewer to buy, sell or expect a return.
- Base reels on the lessons in Learn where one exists (`lesson:` field); a test checks the lesson id is real.
- Hindi must be written for Hindi readers, not machine-translated word for word; have a Hindi speaker review before release.

## What this is not

The characters are vector drawings animated in code: clear and friendly, not film-quality animation, and there is no recorded voice (the optional voice is the phone's own text-to-speech). If you later commission an illustrator or a voice artist, their artwork and audio can replace Mitra and the speech module without changing the reel data or the feed.

## The library (40 reels)

Content files: `content.ts` (the first 13), `content-tax.ts` (tax and retirement), `content-life.ts` (credit, home loan, scams, goals). Helpers for writing a reel: `lib/reels/kit.ts` (`t`, `sc`: a scene whose length follows its caption).

| Topic (chip) | Reels |
|---|---|
| Basics | inflation, cash flow beats salary |
| Investing | start early (SIP), rule of 72, fund units and NAV, direct vs regular, 100 minus age |
| Loans | the EMI trap, good vs bad debt, RBI and your EMI, how big a home loan is safe, 20 or 30 years, what prepaying does, costs beyond the loan |
| Protection | emergency fund, what insurance is, how much life cover |
| Tax | old vs new regime, section 80C, TDS and refunds, capital gains, tax dates |
| Retirement | how big a corpus, EPF, NPS, PPF, how fast you withdraw |
| Credit | what a credit score is, utilisation, the minimum-due trap, loan enquiries |
| Scams | never share OTP/PIN/CVV, UPI collect requests, "digital arrest", fake investment tips, fake KYC links |
| Goals | work backwards from a goal, match money to time, inflation on goals, step-up SIP |

Facts that change (tax slabs, EPF/PPF rates, withdrawal rules) are not typed into captions: tax figures come from `lib/taxcore.ts` (FY 2025-26, the same maths the tax screens use) and every reel tells the viewer to check the current rules. Scam reels deliberately have no tool button (`ACT` is skipped for the `safety` topic); they name only the national cyber-fraud helpline 1930 and cybercrime.gov.in, which a test enforces (no other number may appear).

## The learning loop (Phase 1 of `docs/REELS-MVP-PLAN.md`)

- **For you** is the first tab. `lib/reels/journey.ts` ranks the reels: a question you missed (after a day) → new reels about your weakest Money Score pillar (`PILLAR_REELS`) → other new reels → a refresher of a right answer after a week → the rest. The order is fixed for a visit so a finished reel never jumps.
- **Try it with your numbers**: `ACT` in `journey.ts` maps every reel to the tool that applies it. A test checks the route or calculator exists, so adding a reel without a link fails the build.
- **Streak**: days with a finished reel, kept as dates only in `finos_reels_days` (registered in `lib/privacy.ts`). Yesterday's streak stays alive until the end of today; one missed day resets it quietly.
- **Home** shows "Today's reel" with the streak.
- To add a reel: also add it to `ACT` and (if it speaks to a Money Score pillar) to `PILLAR_REELS`.

## Your own numbers and sharing (Phase 2)

- `lib/reels/mine.ts` reads figures the person already entered (SIP `finos_sip_total`/`finos_sip_monthly`, spending `finos_monthly_expense`/`finos_budget_expenses`, `finos_emergency_fund`, and the home, car or personal loan keys). Values outside a sane range (a SIP under ₹500, an EMI that does not cover its interest) are dropped. Nothing is written or sent.
- `lib/reels/personal.ts` rebuilds three reels from them: **start-early** (their SIP over 30 vs 20 years), **emi-trap** (their loan: interest vs principal in the next EMI) and **emergency-fund** (3 to 6 months of their spending and how many months they hold). With no figures the reel keeps its example. A personal reel carries `mine: true` and the player says "Your own numbers, from this app. They stay on this phone."
- The quiz and its "why" are never personalised, and **sharing** uses the example reel (`lib/reels/share.ts`), so a shared lesson cannot contain a figure the person entered. Share opens a preview of the exact text first (`SharePreview`); the person chooses where it goes.
- Sharing is text, not an image: an image card needs a screenshot library (`react-native-view-shot`) that is not in the app.
- To personalise another reel: add a builder in `personal.ts`, add the figures to `mine.ts`, and extend the fuzz test (`own figures: every personal reel passes the script rules`).

## Playable reels, trust ribbon and today's episode (blueprint Phase 1)

- **Beats.** A reel can carry one `poke` (`{ after, beat }`): the reel stops after scene `after`, the viewer does something, then it plays on. Three kinds: **guess** (drag a marker on a log scale, lock it in, see the gap), **slider** (a what-if slider driven by a `SliderModel` that calls `figures.ts`, so the slider holds no formula of its own) and **myth** (3 to 5 cards, Myth or Fact). Types are in `lib/reels/types.ts`; all the decisions (where the clock stops, how a guess is judged, what the slider shows, how cards are scored, the rules each beat must keep) are pure functions in `lib/reels/beats.ts`; the screens are in `components/reels/Poke.tsx`.
- **No-touch path.** With no input for 8 s (`IDLE_MS`) a beat reveals itself and, for a passive viewer, plays on after 6 s more. Every beat has Skip or Continue, and the slider has plus and minus buttons and screen-reader increment and decrement actions. A wrong guess is never a failure screen.
- **Rules.** `validateReel` checks the beat position (not the first or last scene) and runs the beat's texts through the same Hindi, wording and `{gap}` checks as scenes, and `validateBeat` checks ranges, step counts, model sanity and card counts. The slider takeaway is checked as the viewer first sees it, and a test fills it at every position.
- **Where they live.** `lib/reels/content-play.ts` holds six playable reels (guess-sip, guess-emi, delay-cost, inflation-slide, myths-money, myths-scams). `lib/reels/library.ts` joins them to the main reels as `LIBRARY` (the feed, Home card and share text read from it) and holds their tool links as `PLAY_ACT` (`ACT_ALL` is both maps). A scam reel points at no tool, as for the other scam reels.
- **Trust ribbon.** `lib/reels/trust.ts` maps a reel id to the formula, the assumptions and an as-of date. Reels with an entry show "How this is worked out" under the picture and on the question screen, which opens `TrustSheet` and pauses the reel. A test checks every entry belongs to a real reel, reads in both languages, and labels percentages as assumptions. Add an entry whenever a reel quotes a figure.
- **Today's episode.** `lib/reels/episode.ts` composes the For you tab into at most three reels (`EPISODE_SIZE`) minus those already finished today: the best-ranked reel first, then the best-ranked playable reel so there is always something to touch, then the next best, preferring topics not yet used. After them comes `EpisodeEnd`, a calm "That's enough for today" page with the one move, a "Tomorrow:" teaser and an optional way to keep exploring. The episode is fixed for the visit, like the order. The All and topic tabs are unchanged.
- **Tests.** `__tests__/reels-play.test.mts`.

## Personal ranker, steering, moves and receipts (blueprint Phase 2)

- **Signals.** `lib/reels/signals.ts` gathers what the phone already knows into one object: Money Score pillar scores and the weakest pillar, own figures (`mine.ts`), declared life events that are active today (`phaseOf` in `lifeEvents.ts`), age and income from the profile, emergency-fund months, whether there is a loan, and **strain** (the biggest loan's EMI at or above `STRAIN_RATIO`, 0.5 of income, a placeholder a finance professional should set, or an active loss of income). `deriveSignals` is pure and tested with made-up people; `loadSignals` only reads.
- **Moments.** `lib/reels/triggers.ts` turns the calendar (tax-saving season Jan to Mar, regime choice Apr to May, filing Jun to Jul, advance-tax dates), states (has a loan, emergency fund under 3 months) and life events into named triggers with a sentence each. A reel lists the triggers it answers in `meta.ts`.
- **Meta.** `lib/reels/meta.ts` gives every reel a ladder level (`myth`, `concept`, `decision`, `action`), pillar needs (0 to 1), triggers, and a `growth` flag for reels whose message is "put in more". A test fails if a reel has no entry, an entry has no reel, or a trigger name is unknown. **Whoever adds a reel adds its entry.**
- **Ranker v2.** `lib/reels/ranker.ts`: a fresh reel scores 40 + 60 × (0.5 Need + 0.35 Timeliness + 0.15 Readiness) × (1 − Fatigue). Need comes from the Money Score gap on the pillars the reel speaks to; Timeliness is 1 while one of its triggers is active; Readiness halves if an earlier rung of the same topic is unseen; Fatigue comes from "less of this" and a topic seen in the last day. A question missed a day ago still comes first (110); a right answer a week old is a refresher (20); a finished reel 10; a reel marked known 5. `rankReels` in `journey.ts` is kept for its tests; the feed and Home card use v2 through `useReelsJourney`.
- **Distress guard.** A person under strain is never offered a `growth` reel (it is removed from the ranking, so it cannot reach the episode or the Home card; the All tab is unchanged), and reels about easing debt or building a safety net get a "gentler pick" reason. A 300-person test holds this.
- **"I know this" and "Less of this topic".** Buttons on the answer screen; stored in `finos_session_reels_profile` (`reelsProfile.ts`, `reelsProfileStorage.ts`), never synced.
- **Moves and receipts.** Tapping a reel's tool (for reels in `METRIC_OF` in `moves.ts`) remembers the figure it is about: SIP, emergency fund or loan balance. If that figure later genuinely improves (not a wobble), the next visit shows a "You did it" banner with the change and, for a SIP, an assumed-12% effect labelled an illustration. A tap alone never earns one; unfinished moves expire after 60 days. Stored in `finos_session_reels_moves`, never synced; both keys are in the privacy inventory.
- **Your Number, more reels.** `lib/reels/personal-play.ts` rebuilds guess-sip and delay-cost from the person's SIP and guess-emi from their loan (months left from balance, rate and EMI), using the same `Mine` as `personal.ts`. The trust note for a rebuilt reel says it uses the person's own figures instead of quoting the example's (`trustFor(id, mine)`).
- **Tests.** `__tests__/reels-personal.test.mts`.

## Reminders and Ask Mitra (blueprint Phase 3, the non-content pieces)

- **When will you do it?** On the answer screen, "Remind me when I'll do it" (for reels with a tool) opens `WhenSheet`: tonight 8 pm (only while it is still ahead), tomorrow 9 am, Saturday 10 am, the start of next month 9 am (`whenOptions` in `lib/reels/reminders.ts`). Picking one asks the phone for notification permission once, keeps one local reminder for that reel (`finos_session_reels_reminders`), starts a move so a receipt can follow, and schedules it. The lock screen shows only "Your money move" and the tool's name, never an amount.
- **Daily nudge.** The bell in the reels top bar opens `NudgeSheet`: off until turned on, an hour from 8, 9, 12, 18 or 20 (`NUDGE_HOURS`, never before 7 or after 21), one a day for the next 3 days, naming the public title of a lesson the next episode would offer. A day on which a reel was already finished gets none, and every app start and return to the app re-plans, so it stays silent once the day is done. No streak or guilt wording (a test checks the copy). Stored in `finos_session_reels_nudge`.
- **Plumbing.** Pure planning in `lib/reels/reminders.ts`; OS calls in `lib/reels/reminders-native.ts` (ids start `finosreel-`, so the calendar reminders in `lib/remindersNative.ts`, ids `finos-`, never cancel them); choices and the sync in `lib/reelRemindersStorage.ts`, called from `app/_layout.tsx` at start and on foreground. Notices follow the app language. **Tapping a notice** opens its screen: `lib/notificationTaps.ts` reads `data.route` from a plain tap (not a dismissal or an action button), accepts only a plain in-app path (`ROUTE`: slash-separated words, no scheme, host, dots or query), handles each notice once, and also handles the tap that launched the app; `app/_layout.tsx` starts it and retries briefly while the navigator mounts. It covers the calendar reminders too. Native scheduling and tap handling are untested on a real device (the web preview shows "Reminders work in the phone app"); `__tests__/notification-taps.test.mts` drives it with a fake notifications module.
- **Ask Mitra.** A "Ask Mitra" button under every reel opens `AskSheet`. `lib/reels/ask.ts` understands a what-if on the reel's own example ("what if the rate is 10%?", "and for 20 years?", "what if I put in 1 lakh") by merging the named parts into the reel's amount, rate and years and running Arya's phone calculators (`runDeviceTool`), or any other phone tool in `ALLOWED` (the calculators, savings rate, emergency fund, debt, Money Score, goal SIP, tax dates and 80C, tax estimate). It refuses to say what to buy or sell, never goes online (no price, market, crypto or news tools) and never writes (no memory or open-screen tools). A reel rebuilt from the person's own figures uses them as the base. Answers carry their source and time; the tool text is English even in Hindi (the wrapper sentences are bilingual).
- **Tests.** `__tests__/reels-remind-ask.test.mts`.

## Wave 2: 98 reels, story series and the Money Map

- **Content files**: `content-more-a.ts` (basics, investing), `-b.ts` (loans, credit, protection), `-c.ts` (tax, retirement), `-d.ts` (scams, goals). Tool links for them are in `act-more.ts` (`ACT_MORE`, merged into `ACT_ALL` by `library.ts`); the ladder level, pillar weights, triggers and the `growth` flag of every reel are in `meta.ts`, and a test fails if a reel has no entry.
- **New maths** (all in `figures.ts`, each with a known-answer test checked against a plain loop): `lumpsumValue`, `sipThenHold`, `averageCost`, `realReturn`, `driftedShare`, `potLoss`, `impliedMonthlyRate`, `hraExempt`, `proportionalClaim`, `superTopUpSplit`, `taxAtSlab`, `annuityMonthly`, `grownCost`, `mean`, `sipNeeded`, `stepUpSipFutureValue`, `monthsToDeplete`, `loanFromEmi`.
- **Series** (`series.ts`): First Salary, Safety Net in 30 Days, Scam-Proof, Tax-Ready (timely Jan to Mar and Jun to Sep), Home Loan from Zero, Retire at Your Number. A series orders existing reels and frames each with a story line about the cast member; it does not change the reels. Screens: `/learn/series` and `/learn/series/<id>`.
- **Money Map** (`map.ts`, `/learn/map`): nine topics by the four ladder rungs from `meta.ts`, filled from the watched record, each row opening the next reel on the lowest unfinished rung. No points or levels.
- **Adding a reel now**: write it in a `content-more-*.ts` file and export it through `content.ts`, add `ACT_MORE` (not for scam reels) and a `META` entry, then run `npm test`.

## Round three: more beats, kinder streak, smarter ranker, health and challenges

- **Streak.** `lib/reels/streak.ts` (`forgivingStreak`) replaces the strict reset in the app: one rest day in any seven is bridged automatically (rest days are not counted, only bridged); a second rest within a week, or two missed days together, ends the run. `streakOf` in `journey.ts` stays for its tests.
- **Ranker.** Fresh score is now 40 + 60 × (0.5 Need + 0.35 Timeliness + 0.15 Readiness) × Fit × (1 − Fatigue). **Fit** (`pokeFit`, 0.85 to 1.15) is learned on the phone from whether the person plays with interactive beats or skips them (`profile.fmt`). **Blind spot** (`blindSpot` in `ranker.ts`): once a ISO week (`weekKey`, stored as `profile.blindWeek`), the last place in the episode goes to the best unseen reel for the weakest Money Score pillar, even from a topic the person asked for less of; never a reel hidden for strain.
- **New beats.** `spot` (tap the red flags in a message split into 4 to 9 pieces; 2 to 4 flags, at least one normal piece; reveal explains each; to-do line), `path` (choose what a character does; each path shows its result; no path may be called best or wrong unless `clear`), `sort` (cards into 2 or 3 bins, one at a time), `order` (tap items first to last; the deck is a fixed shuffle). All have the 8 s no-touch reveal and no penalty. Screens in `components/reels/Poke.tsx`, which now scrolls when its content is tall.
- **Slider models.** Besides sip-years, sip-delay and inflation-years: `emi-rate`, `emi-tenure`, `goal-sip`, `step-up`, `tax-income`, `corpus-spend`, `card-interest`, all from existing `figures.ts` and `taxcore.ts` functions. `evalModel` returns value, put, base, lost and the always-positive `diff`; `sliderBars` draws the two bars; `xFormat: 'inr'` shows the slider's own value as rupees; takeaway keys are `{x} {value} {put} {base} {lost} {diff}`. Extra figures live in `lib/reels/figures-play.ts`.
- **Cast.** A scene may name `who` (one of the people in `lib/reels/cast.ts`, drawn by `components/reels/Cast.tsx`) and the player draws that person instead of Mitra. Add a new person to both files; a test checks they agree.
- **Playable reels.** `content-play.ts` now holds 14: guess-sip, guess-emi, delay-cost, inflation-slide, myths-money, myths-scams, spot-kyc-sms, spot-invest-group, choose-bonus, sort-needs-wants, order-first-salary, emi-rate-slide, goal-sip-slide, corpus-spend-slide. Sample links in scam reels are written without `http://` because the privacy test treats any `https?://host` in source as a place the app contacts.
- **Reels health.** `lib/reels/stats.ts` and `lib/reelsStatsStorage.ts` keep daily counters (reels finished, right first time, beats shown and played, "I know this" and "less" taps, moves started, receipts, Ask Mitra questions, minutes on screen), with no reel names or amounts, in `finos_session_reels_stats` (never synced, deletable). `app/learn/health.tsx`, opened from Diagnostics, shows the last 28 days against the blueprint's starting hypotheses (Money Days 8 or more in 28, 15 or more moves per 100 reels, under 8 steering taps per 100, under 3 minutes a day).
- **Seven-day challenges.** `lib/reels/challenges.ts` and `app/learn/challenges.tsx` (cards on Learn and on the end-of-episode page): "Find your leak in 7 days" and "Scam-proof your phone in 7 days". One task a day, ticked by the person, a missed day costs nothing (the next task simply waits), a run untouched for 30 days is dropped. Progress in `finos_session_reels_challenges`, never synced.
- **Player layout.** The "Tap to pause" hint is gone (a paused reel shows ▶), the picture minimum is smaller, and the caption's minimum height is lower, so the large-text audit (320 px, 1.35x) shows no overlap on the reels sampled.
- **Tests.** `__tests__/reels-more.test.mts`.

## Wave 3: interactive reels (64 added; see `docs/REELS-400-PLAN.md`)

New content files (all exported through `content.ts`, with `META` and `ACT_MORE` entries):
- `content-w3-spot.ts`: 12 spot-the-scam reels (realistic made-up messages in pieces; tap the red flags). Sample links are written without `https://` so the privacy host-coverage test does not mistake them for app traffic.
- `content-w3-myth.ts`: 10 myth-or-fact decks (SIP, credit score, insurance, tax, loans, retirement, UPI, gold, mutual funds, saving).
- `content-w3-play.ts`: 8 guess-first reels, 4 what-if sliders and 5 choose-your-path reels (each path reel has a character, `who`).
- `content-w3-explain.ts`: 8 explainers (stocks, IPO, ETF, demat and KYC, credit report, claim steps, which ITR form, FD ladder).
- `content-w3-beats.ts`: 6 sort-it reels, 4 put-in-order reels and 7 reels on the new slider kinds (EMI against tenure, goal SIP, step-up, tax against income, card interest, car-loan rate, withdrawal).
- `components/reels/Cast.tsx` and `hooks/useClock.ts`: eleven animated vector characters (`lib/reels/cast.ts` holds the list of names, one source for the type, the validator and the test).

The beats themselves (guess, slider, myth, spot, path, sort, order) are drawn by the player and validated by `lib/reels/beats.ts`; this wave only supplies content for them. Every beat keeps a no-touch path (8 seconds without a touch reveals the answer).

## Wave 4: 50 draft reels and the review gate

Wave 4 is written and machine-checked but **held out of the app** until a native Hindi reader and a compliance reader sign it off.

- **Where they live**: `content-w4-spot.ts` (14 spot-the-scam), `content-w4-play.ts` (8 choose-your-path with cast, 4 guess-first, 6 sliders), `content-w4-more.ts` (6 sort-it, 4 put-in-order, 6 myth decks, 2 explainers). `drafts.ts` collects them (`DRAFT_REELS`, `DRAFT_IDS`, `liveDrafts()`); their ladder entries and tool links are in `drafts-meta.ts` and `drafts-act.ts`. Two draft series, **Married and Money** (Neel and Isha) and **New Parent** (Sana), are in `series.ts` and appear only when every episode is live.
- **The gate**: `review.ts`. A draft is live when its id is in `REVIEWED` with the Hindi reader, the compliance reader and the date, or when the build sets `EXPO_PUBLIC_REELS_DRAFTS=1` (a review or test build). With neither, the library is exactly what it was before wave 4, and `META`, `ACT_MORE` and the series list leave the drafts out too.
- **To review**: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs scripts/review-sheet.mts > ../docs/review/wave4-review-sheet.md` writes every caption, picture label, interaction and quiz in both languages side by side with sign-off boxes and flags for the facts to check (the sheet is checked in at `docs/review/wave4-review-sheet.md`). To see them in the app: `EXPO_PUBLIC_REELS_DRAFTS=1 npx expo start`.
- **Tests**: `__tests__/reels-drafts.test.mts` (rules, gate, figures, and a run with every draft switched on). The full suite passes both with and without the flag.
