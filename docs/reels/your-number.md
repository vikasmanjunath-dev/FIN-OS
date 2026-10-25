# Your Number: reels rebuilt from the person's own figures

Part of the Money Reels guide (`docs/REELS.md`, section 4). 17 live reels speak in the person's own SIP, spending, fund, loan or income. Nothing is written or sent; sharing always uses the example reel.

## The first three and sharing safety

- `lib/reels/mine.ts` reads figures the person already entered (SIP `finos_sip_total`/`finos_sip_monthly`, spending `finos_monthly_expense`/`finos_budget_expenses`, `finos_emergency_fund`, and the home, car or personal loan keys). Values outside a sane range (a SIP under ₹500, an EMI that does not cover its interest) are dropped. Nothing is written or sent.
- `lib/reels/personal.ts` rebuilds three reels from them: **start-early** (their SIP over 30 vs 20 years), **emi-trap** (their loan: interest vs principal in the next EMI) and **emergency-fund** (3 to 6 months of their spending and how many months they hold). With no figures the reel keeps its example. A personal reel carries `mine: true` and the player says "Your own numbers, from this app. They stay on this phone."
- The quiz and its "why" are never personalised, and **sharing** uses the example reel (`lib/reels/share.ts`), so a shared lesson cannot contain a figure the person entered. Share opens a preview of the exact text first (`SharePreview`); the person chooses where it goes.
- Sharing is text or an image: see `share.md`. Both come from the example reel.
- To personalise another reel: add a builder in `personal.ts`, add the figures to `mine.ts`, and extend the fuzz test (`own figures: every personal reel passes the script rules`).

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
- **Strain.** `PersonalCtx` is `{ strain?, income? }`; a `Signals` object fits it, so call `personaliseReels(LIBRARY, mine, signals)` and `personalisePlay(..., mine, signals)`. When `strain` is true (EMI at or above half of income, or an active job loss) the reels that talk of growth or ask for more (`start-early`, `guess-sip`, `delay-cost`, `goal-step-up`, `slide-sip-length`, `corpus-spend-slide`, `home-loan-prepay`, `slide-emi-tenure`) keep their examples; the others are still rebuilt, without any "money should grow" line, and `home-loan-affordability` switches to a calm closing ("it can be talked through; ask early"). The new asks-for-more reels also stay as examples when no context is passed at all (strain unknown). A test checks 300 made-up people. **Gap found on 24 Oct 2026:** `hooks/useReelsJourney.ts` passes `{ strain, income }` to `personalisePlay` (so waves 1 play reels and wave 2 honour strain) but calls `personaliseReels(LIBRARY, mine)` with no context, so `start-early` is rebuilt from the person's SIP even under strain on the All tab. The ranker still drops it (it is `growth` in `meta.ts`), so For you, the episode and the Home card never offer it to a strained person. The fix is one argument in the hook (not made here: code was out of scope).
- **To personalise another reel:** add a builder and a row to `PERSONAL_MORE`, set `asksMore` from `meta.ts`'s `growth` flag (a test fails if they disagree), add the `trust.ts` entry, add a known-answer test for any new formula, and list it above.
