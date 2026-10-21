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
- Sharing is text or an image: see "Share as an image" below. Both come from the example reel.
- To personalise another reel: add a builder in `personal.ts`, add the figures to `mine.ts`, and extend the fuzz test (`own figures: every personal reel passes the script rules`).

## Playable reels, trust ribbon and today's episode (blueprint Phase 1)

- **Beats.** A reel can carry one `poke` (`{ after, beat }`): the reel stops after scene `after`, the viewer does something, then it plays on. Three kinds: **guess** (drag a marker on a log scale, lock it in, see the gap), **slider** (a what-if slider driven by a `SliderModel` that calls `figures.ts`, so the slider holds no formula of its own) and **myth** (3 to 5 cards, Myth or Fact). Types are in `lib/reels/types.ts`; all the decisions (where the clock stops, how a guess is judged, what the slider shows, how cards are scored, the rules each beat must keep) are pure functions in `lib/reels/beats.ts`; the screens are in `components/reels/Poke.tsx`.
- **No-touch path.** With no input for 8 s (`IDLE_MS`) a beat reveals itself and, for a passive viewer, plays on after 6 s more. Every beat has Skip or Continue, and the slider has plus and minus buttons and screen-reader increment and decrement actions. A wrong guess is never a failure screen.
- **Rules.** `validateReel` checks the beat position (not the first or last scene) and runs the beat's texts through the same Hindi, wording and `{gap}` checks as scenes, and `validateBeat` checks ranges, step counts, model sanity and card counts. The slider takeaway is checked as the viewer first sees it, and a test fills it at every position.
- **Where they live.** `lib/reels/content-play.ts` holds six playable reels (guess-sip, guess-emi, delay-cost, inflation-slide, myths-money, myths-scams). `lib/reels/library.ts` joins them to the main reels as `LIBRARY` (the feed, Home card and share text read from it) and holds their tool links as `PLAY_ACT` (`ACT_ALL` is both maps). A scam reel points at no tool, as for the other scam reels.
- **Trust ribbon.** `lib/reels/trust.ts` maps a reel id to the formula, the assumptions and an as-of date. Reels with an entry show "How this is worked out" under the picture and on the question screen, which opens `TrustSheet` and pauses the reel. A test checks every entry belongs to a real reel, reads in both languages, and labels percentages as assumptions. Add an entry whenever a reel quotes a figure. Since Oct 19 2026 every live reel that quotes a figure has one (the author checklist, `npm run reels:check -- --summary`, reports 0 without). Reels with the same maths share one formula constant in `trust.ts` (SIP, EMI, goal SIP, cost-later, unpaid card balance, tax saved = deduction × slab × 1.04, and so on) and differ only in `assumes`; tax notes name the year (FY 2025-26, as in `lib/taxcore.ts`); scam reels get a note that says nothing is calculated. `__tests__/reels-trust2.test.mts` re-derives each shared formula from the note's own words against `figures.ts`, and checks every rate a note calls "assumed" is used in the reel. Hindi in these notes is a draft for a native reviewer.
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

## Your Number, wave 2

Seventeen reels now speak in the person's own figures: the six from earlier phases and eleven new ones. Code: `lib/reels/personal-more.ts` (the new builders and the strain rule), `personal.ts` and `personal-play.ts` (the earlier six; `personalisePlay` also applies wave 2 after them, so the feed's existing call covers everything), maths in `figures-play.ts`, notes in `trust.ts`. Tests: `__tests__/reels-yournumber.test.mts`.

| Reel | Figure it uses | What changes |
| --- | --- | --- |
| `start-early` | SIP | 30 vs 20 years of their SIP |
| `emi-trap` | loan balance, rate, EMI | interest vs principal in their next EMI |
| `emergency-fund` | spending, fund | 3 to 6 months of their spending; months held |
| `guess-sip` | SIP | the guess is about their SIP over 30 years |
| `delay-cost` | SIP | the slider runs on their SIP |
| `guess-emi` | loan balance, rate, EMI | interest still to pay (months left worked out from the EMI) |
| `emergency-target` | spending, fund | 3 and 6 months of everything they spend, as a ceiling for their essentials; months held |
| `inflation` | spending | their monthly spending in 10 years at an assumed 6% |
| `retire-corpus` | spending | their spending in 25 years and the rough 25-times corpus |
| `goal-step-up` | SIP | flat against a 10% yearly rise for 20 years (money put in, and where it could end) |
| `slide-sip-length` | SIP | the "years" slider runs on their SIP |
| `corpus-spend-slide` | SIP | the corpus is their SIP grown 25 years at an assumed 12%; the slider is the withdrawal against an assumed 7% |
| `home-loan-prepay` | loan balance, rate, EMI | an example extra of about a tenth of the EMI each month: months and interest saved |
| `rbi-and-emi` | loan balance, rate, EMI | their EMI after a half-point rise, same months left |
| `emi-rate-slide` | loan balance, rate, EMI | the rate slider runs on their loan, with a range around their rate |
| `slide-emi-tenure` | loan balance, rate | their balance as a fresh loan over the years on the slider |
| `home-loan-affordability` | loan EMI and **income** (profile, via signals) | their EMI as a share of income, the 40% guide in rupees, the loan that EMI repays at their rate |

- **Fallback.** A reel is rebuilt only when its figure is present and sane; otherwise the example stays (the very same object). `saneMine` re-applies the limits of `mine.ts` (a SIP of ₹500 to ₹5 lakh, spending ₹5,000 to ₹10 lakh, an EMI that covers its interest, a rate of 1 to 40%), so a figure built by hand is held to them too, and a test checks the two agree at every edge. Income must be ₹5,000 to ₹1 crore a month and above the EMI. After building, the script goes through `validateReel`; if an unusual figure breaks a rule (a caption too long, a bad slider range) the example is shown instead.
- **What never changes.** The lesson, the topic, the title, the picture type, the beat type and the whole quiz are the example's. Sharing uses the example (`share.ts` reads the library, which a test shows is never altered).
- **Says where it came from.** Each rebuilt script has a caption saying the figure is from this app and stays on this phone, in both languages, and the player's "Your own numbers" line stays. The Hindi is a draft for a native reviewer.
- **Trust notes.** Every reel has an entry in `trust.ts` with the formula, the assumptions and an as-of date (2026-10-19). For a rebuilt reel `trustFor(id, true)` shows the assumptions for the person's own figures (and `formulaMine` where the maths has an extra step, as for the rate rise). Every percentage is called an assumption, an example or a common guide.
- **Strain.** `PersonalCtx` is `{ strain?, income? }`; a `Signals` object fits it, so call `personaliseReels(LIBRARY, mine, signals)` and `personalisePlay(..., mine, signals)`. When `strain` is true (EMI at or above half of income, or an active job loss) the reels that talk of growth or ask for more (`start-early`, `guess-sip`, `delay-cost`, `goal-step-up`, `slide-sip-length`, `corpus-spend-slide`, `home-loan-prepay`, `slide-emi-tenure`) keep their examples; the others are still rebuilt, without any "money should grow" line, and `home-loan-affordability` switches to a calm closing ("it can be talked through; ask early"). The new asks-for-more reels also stay as examples when no context is passed at all (strain unknown). A test checks 300 made-up people. **Needs the caller to pass the signals:** `hooks/useReelsJourney.ts` currently calls both functions with `mine` only.
- **To personalise another reel:** add a builder and a row to `PERSONAL_MORE`, set `asksMore` from `meta.ts`'s `growth` flag (a test fails if they disagree), add the `trust.ts` entry, add a known-answer test for any new formula, and list it above.

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

## Accessibility pass on the player and the beats

- **Scene progress** is one full-width, 44 px control (`accessibilityRole="adjustable"`, value "3 of 7"). A tap jumps to the scene under the finger; a screen reader steps scenes with increment and decrement. It replaces one button per scene, which were 35 px wide on a 320 px phone when a reel had seven scenes (the layout audit counted them as too small).
- **Beats** were audited at 1x on 390 px and at 1.35x and 2x on 320 px, both while asking and after the no-touch reveal (`scratchpad` script reusing `AUDIT_JS` from `scripts/layout-audit.py`). Findings and fixes are in the list below.
- Findings from the beat audit, and what changed: (1) a slider takeaway printed "5 years years" because `{x}` had started to include its unit; `{x}` is a plain number again, `{xu}` has the unit, and a test covers every slider in the library; (2) a tall reveal pushed the page up under the top bar on the web preview, fixed with `minHeight: 0` on the beat's scroll area (and on the question screen's); (3) on a reveal the beat scrolls to its end so Continue stays in view, and the reel's title is hidden while a beat is on to give it room; (4) bar labels and values no longer overflow at large text. What the audit still reports is scrolled-out content counted as clipped, which is expected: it measures at rest, and a long reveal is scrolled. At 1.35x text on a 320 px phone the question screens of the longest beats (the scam message) need a scroll to reach Check; the reveal and Continue are in view.

## Voice for beats and the quiz, and the episode finish rate

- **Read aloud.** With sound on (the speaker button in the reels top bar), the phone's voice now reads more than the scene captions: each beat's question and what it asks you to look at (`askText`), what it reveals (`revealText`: the answer, the red flags and what to do, the paths and the verdict, the correct order, a card's reason), the quiz question with numbered options (`quizText`), and then right or not and why (`quizVerdictText`). Amounts are spoken as rupees ("18 lakh rupees", "18 लाख रुपये") and symbols a voice would spell out are dropped (`speakable`). Text builders are pure in `lib/reels/narration.ts` and tested over every beat in the library in both languages; speaking is `useVoice` in `Poke.tsx` and an effect in `ReelPlayer.tsx`, started after a short pause so the reel's own voice has stopped. Phone text-to-speech is the same voice as before (no recorded voice yet) and was not heard on a real phone.
- **Episode finish rate.** Reels health counts episodes opened (`eps`) and finished (`epfin`: every reel in the episode answered in the same visit) and shows the share against the 70% starting hypothesis.

## Robustness

- **A broken beat never breaks a reel.** `isBeatUsable` (in `beats.ts`) applies the same rules the tests hold every beat to (valid ranges, model figures, card counts, pause point) before a reel pauses for it; a reel whose beat fails simply plays without it. `BeatBoundary` wraps the beat as well: if it throws while drawing, it writes the redacted crash note (Diagnostics) and the reel plays on. A test checks every beat in the library is usable and that bad ones are refused.
- **Backgrounding.** Leaving the app pauses the reel and silences the voice.

## The Reels tab

- **A bottom tab of its own.** Reels is the second of six tabs (Home, Reels, Markets, Arya, Track, Portfolio), in the thumb zone next to Home, the most-visited screen. Pressing it does not show a tab screen: `listeners.tabPress` in `app/(tabs)/_layout.tsx` stops the tab switch and pushes `/learn/reels`, the full-screen feed, so the close button returns to the tab you came from. `app/(tabs)/reels.tsx` is only a redirect for the case where the tab route is opened directly (a deep link).
- **Badge.** `reelsTabState` (in `lib/reels/streak.ts`, pure and tested) reads the day list the streak uses: a tick when today's episode is done, the streak number when a streak is alive and today is still open, a small dot otherwise ("today's reel is ready"). The accessibility label says the same in words. `hooks/useReelsTab.ts` refreshes it on route change and when the app returns to the foreground. Nothing leaves the phone.
- The Home screen's "Today's reel" row is unchanged.

## The voice

With sound on, a reel is read aloud by the phone's own text-to-speech. It is built to sound like a person telling the story, and to stay exactly in step with the words on screen.

- **Text made speakable** (`lib/reels/voice.ts`, `speechText`): rupees ("₹3.49 crore" is said as "3.49 crore rupees"), percent, Indian digit grouping, ranges, symbols, acronyms ("EMI" is "E M I", and in Hindi "ई एम आई"), and the helpline 1930 digit by digit. The caption on screen does not change.
- **Phrases and breaths**: each caption is cut at sentence ends and colons with pauses that fit the punctuation; questions rise; sentences that carry a figure slow down a little; a few big words are said first as a hook.
- **Mood**: worried is slower and lower, cheering is quicker and brighter, surprised lifts the pitch.
- **Best voice**: `pickVoice` chooses the installed voice for the language, preferring the right country and enhanced or neural quality over compact.
- **Timing**: the scripts were written for silent reading, which is about twice as fast as speech, so with sound on `withVoiceTiming` stretches each scene to what the voice needs (a reel of 23 s becomes about 31 s in English and 34 s in Hindi). The voice starts 180 ms after the caption appears and ends 300 ms before the next scene. The measured speed of the phone's voice is remembered, so later scenes are fitted more exactly, and the clock waits at the end of a scene (at most 1.6 s) until the sentence is really finished.
- **Caption in step** (`components/reels/Caption.tsx`): the word being said is lit, the words already said stay white and the ones to come are dimmer; the caption rises and fades in as its scene starts and fades out as it ends. Progress comes from the voice's own word boundaries, or from a clock on phones that give none.
- **Tests**: `__tests__/reels-voice.test.mts` covers the text rules, pauses, mood, fitting for every scene in both languages, voice choice, word following, motion and the clock hold.
- **Limits**: a phone's built-in voice is not an actor. The quality depends on which voices are installed (on iPhone, Settings > Accessibility > Spoken Content > Voices; on Android, the text-to-speech engine's voice data). Nothing here was heard by a person yet: it needs a listen on a real phone in both languages. A recorded voice from a voice artist is the next step up and would use the same timing.

## The rest of the blueprint's engine: gestures, My moves, milestones, seasons, facts, Money date

- **Gestures** (in `ReelPlayer.tsx`): double-tap the picture = "I'll do this" (a double tap toggles play/pause twice, so playback is unchanged); swipe right = keep the reel for later; swipe left = a small sheet asking "I know this" or "fewer on this topic"; hold the picture = how the figures are worked out. Only clearly sideways moves are captured, so the feed still scrolls. Every gesture also has a button after the quiz (Save, I'll do this, Play together) and a screen-reader custom action. A one-line tip shows on the first reel for the first three visits only (`tips` in the profile).
- **Saved and My moves.** `saved` and `pledges` live in the reels profile (`reelsProfile.ts`: `toggleSaved`, `addPledge`, `removePledge`; bounded at 60 and 20, ids validated; same on-phone key as "I know this", never synced). The feed has a "🔖 Saved" tab (snapshot taken when the tab opens, so un-saving does not pull a reel from under the thumb). `app/learn/moves.tsx` lists pledges with where each stands (not started, watching your figure, improved), the receipts, and the saved reels; it is linked from the Learn index and from the calm stop. For a reel with no tool, "I'll do this" simply keeps it for later.
- **Real milestones** (`milestones.ts`): first SIP, three and six months of cover, a cleared loan, noticed from the figures already on the phone. The first check is a silent baseline (nothing is celebrated that was true before the reels began); later ones show once as a gold banner. A cleared loan needs a loan that was seen earlier.
- **Seasons** (`seasons.ts`): Diwali week (5 days before to 2 after, dates listed for 2026 to 2030 and to be checked each year), Budget week (29 Jan to 4 Feb) and March year-end (15 to 31 March) tint the stage and add a small badge. The lessons do not change.
- **Money fact of the day** (`facts.ts`): 23 short, true facts at the calm stop; figures are computed from the reels' own tested functions and projections say "assumed". Hindi is a draft for the native reviewer like the rest.
- **Money date** (`together.ts`, `TogetherSheet.tsx`): "👫 Play together" on any reel with a guess beat. Two people on one phone each guess the reel's example question, the first guess is hidden, then both are shown against the answer, with a tie when they are within 5%. It uses only the reel's example figures (never the personalised version), keeps nothing and sends nothing.
- **Health counters** gain `saves`, `pledges` and `together`, and a "pledges per 100 reels" row.
- **Voice wiring** (applied for the content session's voice engine): with sound on the player plays `withVoiceTiming(reel)`, so scenes last as long as the voice needs; the clock holds at a scene's end (up to 1.6 s) until the sentence is finished, the beat's pause waits for the same, and the caption lights the word being said (`useVoice`, `Caption`). Turning sound on or off keeps the person in the same place in the same scene.
- **Not built, and why:** a sound set, recorded voice and commissioned art (assets), more Indian languages (translators), backend sync and push (a hosted backend).

## Weekly line and a shared reminder hook

- **A gentle weekly line** at the calm stop (`lib/reels/weekly.ts`): the last seven days (today included) added up from the on-phone health counters, for example "This week: 9 reels on 4 days, 2 moves on your list, 1 move started." It says only what happened, is silent in a week with no reels, and never mentions what was missed (a test checks the wording). It refreshes whenever a reel is finished.
- **"⏰ Remind me" on My moves.** The "when will you do it?" logic moved out of the feed into `hooks/useMoveReminder.ts`, used by both the feed and My moves; a test checks neither keeps its own copy. On the web preview picking a time says reminders run in the phone app only, as before.

### Voice settings, and the route to a recorded voice

- **Reel voice screen** (`/learn/voice`, from Learn, and in search): choose Slower, Normal or Faster; Expressive or Steady; short, normal or long breaths between sentences; and the installed voice for English and for Hindi, listed best first with "enhanced" and "recommended" tags. Tapping a voice plays a sample with the words lighting up in time. If the phone only has standard voices, the screen says how to install an enhanced one on iPhone and on Android. Choices are saved on the phone only (`finos_session_reels_voice`, listed in the privacy registry) and change both how the voice sounds and how long each scene lasts.
- **Replay**: `useVoice` returns `replay()`, which says the current line again.
- **Recording brief for a voice artist** (`docs/voice/recording-brief-en.md` and `-hi.md`, made by `scripts/voice-brief.mts`): every line of the live library (936 clips per language) with the feeling to play, what to say (numbers and acronyms as spoken), and the length it is timed to. A recorded voice is the step above the phone's voice. It is not wired yet: playing clips needs the `expo-audio` module and a manifest of clip lengths and word times, and the clips themselves need a person to record them. The timing, the caption highlight and the voice settings are already built so they can be reused.

## Share as an image

- **What the person gets.** Tapping Share on a reel opens `components/reels/ShareSheet.tsx`: the card as it will be sent, with **Share as image**, **Share as text** and Close. The image is a 1080 x 1350 PNG (4:5, uncropped on WhatsApp): the topic chip, Mitra, the reel's title, its one takeaway line, "Money reels by FIN·OS" and "For education, not advice." In Diwali, Budget and March weeks the card takes the season tint and badge (`seasonOf`). Hindi or English follows the app language.
- **Privacy.** The card is built by `lib/reels/sharecard.ts` from the **library's example reel** (`LIBRARY`), from an id and a language only: it imports no storage and no personal data, so it cannot show a figure the person entered. The takeaway is the reel's own quiz "why"; the title is the reel's title. A test seeds odd personal figures into every personalised reel and checks none reaches the card, that every digit on the card is from the example, and that no card has a link. Nothing is sent until the person picks where it goes in the phone's share sheet.
- **Fitting.** `CARD_MAX` caps title (60), takeaway (160) and topic (24) characters; `fitLine` cuts at a sentence or word end if a future reel runs longer. A test checks every library reel in both languages.
- **Capture.** `shareCardImage` in `lib/reels/share.ts` uses `react-native-view-shot` (`captureRef`, PNG, tmpfile) and `expo-sharing`. The card is drawn at 360 x 450 and captured at 3x, so it is sharp whatever the phone's size; the on-screen preview is scaled by a transform, not by resizing, so the capture is always full size. The temporary file (`finos-reel-card-<time>.png`, cache directory) is deleted as soon as the iOS sheet closes, and two minutes later on Android, where the chosen app may still be reading it.
- **Fallbacks.** If the capture fails, or the device cannot share a file, the sheet switches to the text share with a plain note ("Could not make the picture, so here is the text instead"). On the web there is no share sheet for files: **Share as image** saves the PNG to downloads (html2canvas), and the text share copies instead.
- **Native module.** `react-native-view-shot` is a native module: **a dev client or release build must be rebuilt** (`npx expo run:ios` / `run:android` or a new EAS build). Expo Go already includes it. A build made before this change will fail the capture and show the text share.
- **Not counted.** Shares are not in the health counters: `lib/reels/stats.ts` belongs to another change. When a counter is wanted, add `shareimg` and `sharetxt` beside `saves` and `pledges` there and call `recordStat` in `ShareSheet.tsx`.
- **Test.** `__tests__/reels-shareimage.test.mts`. Not testable in Node: the actual capture and the share sheet, which need a phone.

## Ranker v3

`rankReelsV2` and `composeEpisode` now also read what the person has done in the reels. Everything is on the phone and pure; tests in `mobile/__tests__/reels-rank3.test.mts`.

- **Saved.** A saved reel that has not been watched gets about five points (`W_SAVED`), and the reason "You saved this one for later." when nothing stronger explains it. A fresh reel is capped at 109, so nothing ever outranks a missed question (110).
- **Still on your list** (`lib/reels/followup.ts`). A pledge ("I'll do this") that is 5 days old, whose tool was not started (`startedReelIds(moves)`), that is not marked known, and has not been brought back in the last 5 days is ranked as `why: 'pledge'` (score 50) with a one-line bilingual reason that says where things stand and never how long it has been. Only the oldest due pledge is ranked that way, at most twice per pledge in all (`MAX_RESURFACES`), never for a person under strain, and only for a reel already watched. `composeEpisode` puts at most one in a full-size episode (three or more reels), reports it as `episode.resurfaced`, and gives way to the weekly blind spot when they compete for the last place. The screen then calls `markResurfaced(id)` from `useReelsJourney` so it is not shown again for 5 days (stored as `rs`/`rn` on the pledge).
- **Milestones.** `MILESTONE_SHIFT` in `ranker.ts`: after `first-sip` the "how to start" reels (`first-sip-habit`, `start-early`, `delay-cost`, `slide-start-late`, `guess-small-sip`) keep half of their lift above the base, and the step-up and lump-sum reels get about six points; after `fund-3` the basic emergency-fund reels fall the same way and `where-keep-fund`, `fd-ladder` and `sort-emergency-or-not` rise. A reel that is timely for another reason is not lowered, and the emergency shift switches off while the fund is under three months again. Nothing is hidden.
- **Seasons.** `seasonLiftFor` in `triggers.ts`: Diwali week lifts every reel on the scams topic and `DIWALI_REELS` (spending, cards, budgets); Budget week lifts tax-topic reels; March year-end lifts reels carrying the `cal:tax-season` trigger. The lift is `SEASON_LIFT` (0.12 of the weighted sum, about seven points), smaller than a real trigger. A season works only on reels the ranker already offers, so it can never undo the distress guard.
- **Kept as before:** distress guard (growth reels removed for strain), weekly blind spot, "known" last, review 110 / refresh 20 / done 10, format fit, fatigue. The 300-person distress test is unchanged, and a second one runs it on season days with saved reels, milestones and pledges all set.
- **Determinism and fairness tests.** The same inputs give the same order (also when the maps are built in a different order); in 500 made-up people, every library reel reaches someone's top 30, and no topic gets less than a quarter of its library share of episode places (or more than three times it). If a new reel cannot be reached, the test names it.

## Author tooling and library-wide checks (Oct 2026)

- **Guide for authors:** `docs/REELS-AUTHORS.md` is the one-page "Adding a reel" guide: the steps, the schema, what each checklist line means, what the validator bans, how Hindi review works, and a good and a bad reel side by side.
- **`npm run reels:check -- <reel-id>`** (`mobile/scripts/reel-check.mts`, logic in `lib/reels/qa.ts`) prints the checklist for one reel: validator errors, both languages in proportion, Hindi/compliance review state, ladder entry, tool link and trust note, beat usable and re-derived, duration and the voice's timing in both languages, caption speed, quiz quality, advice and link wording, repeated titles and hooks, topic/cast/lesson, share safety, file size and drawing cost. `--all` checks every reel (exit code 1 when anything blocks); `--summary` prints coverage (reels per topic and ladder rung, per format and per pillar, ids with no tool, unreachable ids, empty topic × rung cells, quiz answer positions, size); `--drafts` checks the 50 draft reels.
- **Library invariants:** `__tests__/reels-library-qa.test.mts` holds every live reel and every draft to those checks and names the reel that breaks one: unique ids and titles, ladder entry and topic chip, share-safe text, 30 KB a reel (library total reported), scenes 1.5-12 s and reels 20-60 s silent and with each voice, slider and guess figures re-derived by a month-by-month ledger rather than `figures.ts`, cast names, Money Map cells and series ids resolving, and a drawing-cost budget (animated pieces per scene, 30; per beat, 30; counted by `sceneCost`).
- **Known findings** are listed, one line and a reason each, in `lib/reels/qa-allowlist.ts`; only errors can be listed, warnings are always printed. Fix the content, then delete the line.

## Web version (html/reels.html)

A small version of the feed for people without the app: **Learn → Money Reels** on the website (`html/reels.html`, linked from the Learn hub `html/foundations.html`, found by site search). Today's episode of three reels, then a calm stop. It plays the same scripts as the app, in English and Hindi, in the browser only.

**Regenerate the data after any change to the reels** (a script, a quiz, a tool link, a trust note, a new reel going live):

```bash
cd mobile
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs scripts/export-reels-web.mts
```

It writes `js/reels-data.json` and prints the size in KB (raw and gzipped) against the budget (720 KB raw, 190 KB gzipped, set at the top of the script; raise it on purpose, never by accident). Add `--check` to see whether the file is current without writing it. `tests/reels-web.test.js` fails when the file is out of date, so a reel edited in the app cannot silently differ on the site. The output is deterministic (no dates, no clock), so the file only changes when a reel does.

What the export holds: every **live** reel (`LIBRARY`, which already excludes drafts that have not passed the review gate; the script refuses to run in a build with `EXPO_PUBLIC_REELS_DRAFTS=1`, and skips any reel built from a person's own figures). Per reel: topic, title, scenes (milliseconds, mood, caption, big words, cast member, picture), quiz, the beat (guess, slider, myth cards, spot the scam, choose a path, sort, put in order), the "how this is worked out" note, and the tool button. Every text is an `[english, hindi]` pair. The reels are the app's example figures only; nothing personal can be in the file.

How the sliders stay honest: the file carries each slider's **inputs** (the model kind and its numbers), not its answers. `js/reels-eval.js` is a line-for-line copy of the app's `evalModel`, `sliderLine`, `sliderBars`, `money`, the guess scale and the fixed shuffle for "put in order"; the tax slider calls the site's own `js/finos-taxcore.js`. `tests/reels-web.test.js` runs the app's TypeScript (through `export-reels-web.mts --parity`) for every slider reel at every slider position and compares every figure, takeaway sentence and bar label. If you add a slider model in `beats.ts`, add it to `reels-eval.js` too; the parity test will fail until you do.

Tool buttons: the app's routes are mapped to the website's equivalent page in `SITE_PAGE` at the top of `export-reels-web.mts`. A reel whose tool has no page on the site (`/funds/expense`, `/insurance/compare`, `/tracker/budget`, `/tracker/holdings-import`, `/tracker/watchlist`) shows no tool button, as scam reels do on purpose. A test checks every target is a real file.

Privacy, as in the app: everything stays in the browser. The page's only request is `js/reels-data.json` (it is cached after the first visit by the service worker, which does not precache it so that visitors who never open the page do not download it). No analytics, no sharing, no sync. What is remembered: `finos_session_reels_web_seen` (reel id, when, whether the quiz was right), `finos_session_reels_web_days` (dates only, for the streak) and `finos_session_reels_web_episode` (today's three ids). The site never syncs `finos_session_*` keys. The page reads the site's language setting (`finos_lang`) and theme.

**What differs from the app**
- No personal ranker, no "your own numbers" reels, no Money Score pillars: the day's three are a fixed daily shuffle of the live library (an unseen reel first, one with something to try, a different topic), the same all day.
- No voice and no word highlighting, no reminders, no Ask Mitra, no saved / "I'll do this" / My moves / receipts, no seasons, milestones, money fact or Money date, no share card.
- Mitra is a small simple drawing and cast members are plain head-and-shoulders figures, not the full artwork in `components/reels/`.
- The day streak keeps the app's rule (one rest day in seven is forgiven) but is its own record, kept per browser. It does not read or change the app's streak.
- Scene lengths are the app's, lengthened a little when the caption needs more reading time (the app waits for the voice instead).
- With "reduce motion" set the pictures show their finished state and a reel waits for Play instead of starting by itself.
- The Hindi interface text (buttons, hints) is a draft for the native reviewer, as the reels' Hindi is.
- Size: the data grows with the library (about 3.5 KB a reel raw, 0.85 KB gzipped). At the 400-reel target it would be about 1.4 MB raw (340 KB gzipped); split it by topic or by episode before then.

## Quiz order and the feed wiring (after the parallel build)

- **Scrambled quiz options** (`lib/reels/quizorder.ts`): the checker found the right answer written first in 85% of live reels. The feed now shows each quiz's options in a fixed order that depends only on the reel id (`permutation`, `withScrambledQuiz`), with the answer index following its option. A quiz with an "all of these" or "none of these" option is left as written. Applied once, in `useReelsJourney`, never to the stored content, so other consumers must apply it themselves if they show quizzes (the web export does).
- **Feed wiring for ranker v3 and Your Number:** `personalisePlay` now gets `{ strain, income }` from the signals (so strained people are not shown growth framing in personalised reels), the ranker gets the started-move ids (so a pledge whose tool was started is not brought back), and the feed calls `markResurfaced` for a "Still on your list" pick when it composes the episode.

## Accessibility pass 2: the gesture UI, the calm stop, the sheets and the banners (Oct 2026)

Audited at 320 px wide, 1x / 1.35x / 2x text, English and Hindi, reduce-motion on, with the layout audit's checks (`scripts/layout-audit.py` `AUDIT_JS`, reused by a scratch script) and DOM semantics. Guards are in `__tests__/reels-a11y2.test.mts`.

- **The picture is the one pause/play button.** The body of the player used to be a single button labelled "Pause", so on a phone the caption, the big words and the season badge inside it were hidden from VoiceOver and TalkBack. The outer body is now a touch surface a screen reader skips (`accessible={false}`), the picture is the button (with the save / pledge / steer custom actions), and the caption, big words and season badge are beside it.
- **Reels that are off screen are hidden from a screen reader** (`aria-hidden` / `importantForAccessibility`); the feed keeps the neighbouring reels drawn, and before this the web tree listed three reels' worth of controls.
- **After the answer**: the verdict, then this reel's move, then Next and Watch again, then "KEEP OR SHARE" (Save, I'll do this, Remind me, Play together, Share) and "TUNE YOUR REELS" (I know this, Less of this), then the two pills. The view scrolls just far enough that the verdict and the main buttons are in view; before, Next sat 1.4 screens down at 1x and 3.2 at 2x. Every button has a spoken label without its emoji or arrow.
- **Live regions** hold words only and each message is in exactly one: the verdict, the "got it" confirmation and the toast are text that stays mounted (empty until used) so they are announced once on Android and the web; iPhone ignores live regions, so `announce()` (iOS only, `components/reels/announce.ts`) says them there. No live region wraps a button any more (the beat reveals, Ask Mitra's answer and the banners did). The readout above a slider is no longer live (the slider announces its own value).
- **Toast** sits over the scene bar instead of over the buttons.
- **Steer sheet**: the backdrop is no longer a button wrapped around the card of buttons.
- **Scene control** exposes `aria-valuetext` (the web ignores `accessibilityValue`), and a tap on the web (no `locationX` on a click) now jumps to the scene under the finger instead of restarting.
- **Reduce motion** follows the setting while the app is open (`reduceMotionChanged`), and the scroll after an answer is not animated.
- **Calm stop**: Done is the first, filled button; "Keep exploring (optional)" is last and quiet; the decorative owl is hidden from a screen reader and does not scale.
- **Money date**: each step is announced; a locked track is a picture, not an adjustable control; stepper labels in Hindi.
- **My moves**: the move button no longer runs off a 320 px screen (it did at every text size); each button names its reel; titles are headings.
- **Banners** (`components/reels/Banner.tsx`, used by the feed): the words are the live region, the OK button is outside it and 44 px, the text scrolls inside the banner and the banner never takes more than 55% of the screen.
- **Not fixed here** (other owners): the feed's top bar (title and "1 / 3 watched" line) wraps into the topic chips from 1.35x text; the top bar comes after the list in reading order; the feed's own labels ("Close reels", "Voice on/off") are English only; the caption is a live region as well as the voice, so with sound and a screen reader both on it is said twice; `next()` scrolls with animation under reduce motion; inactive `EpisodeEnd` is not hidden from a screen reader (it has no `active` prop).
- **Needs a real phone**: everything above that is about VoiceOver or TalkBack (focus order, what is read and when, whether `announce()` and the live regions are heard once) was checked in the DOM only.
