# The library: files, waves, series, the Money Map and the drafts

Part of the Money Reels guide (`docs/REELS.md`, sections 2 and 8). Library numbers change often: run `cd mobile && npm run reels:check -- --summary` for the current ones (177 live, 50 drafts on 24 Oct 2026).

## Wave 2: 98 reels, story series, the Money Map

- **Content files**: `content-more-a.ts` (basics, investing), `-b.ts` (loans, credit, protection), `-c.ts` (tax, retirement), `-d.ts` (scams, goals). Tool links for them are in `act-more.ts` (`ACT_MORE`, merged into `ACT_ALL` by `library.ts`); the ladder level, pillar weights, triggers and the `growth` flag of every reel are in `meta.ts`, and a test fails if a reel has no entry.
- **New maths** (all in `figures.ts`, each with a known-answer test checked against a plain loop): `lumpsumValue`, `sipThenHold`, `averageCost`, `realReturn`, `driftedShare`, `potLoss`, `impliedMonthlyRate`, `hraExempt`, `proportionalClaim`, `superTopUpSplit`, `taxAtSlab`, `annuityMonthly`, `grownCost`, `mean`, `sipNeeded`, `stepUpSipFutureValue`, `monthsToDeplete`, `loanFromEmi`.
- **Series** (`series.ts`): First Salary, Safety Net in 30 Days, Scam-Proof, Tax-Ready (timely Jan to Mar and Jun to Sep), Home Loan from Zero, Retire at Your Number. A series orders existing reels and frames each with a story line about the cast member; it does not change the reels. Screens: `/learn/series` and `/learn/series/<id>`.
- **Money Map** (`map.ts`, `/learn/map`): nine topics by the four ladder rungs from `meta.ts`, filled from the watched record, each row opening the next reel on the lowest unfinished rung. No points or levels.
- **Adding a reel now**: write it in a `content-more-*.ts` file and export it through `content.ts`, add `ACT_MORE` (not for scam reels) and a `META` entry, then run `npm test`.

## Wave 3: interactive reels (64)

New content files (all exported through `content.ts`, with `META` and `ACT_MORE` entries):
- `content-w3-spot.ts`: 12 spot-the-scam reels (realistic made-up messages in pieces; tap the red flags). Sample links are written without `https://` so the privacy host-coverage test does not mistake them for app traffic.
- `content-w3-myth.ts`: 10 myth-or-fact decks (SIP, credit score, insurance, tax, loans, retirement, UPI, gold, mutual funds, saving).
- `content-w3-play.ts`: 8 guess-first reels, 4 what-if sliders and 5 choose-your-path reels (each path reel has a character, `who`).
- `content-w3-explain.ts`: 8 explainers (stocks, IPO, ETF, demat and KYC, credit report, claim steps, which ITR form, FD ladder).
- `content-w3-beats.ts`: 6 sort-it reels, 4 put-in-order reels and 7 reels on the new slider kinds (EMI against tenure, goal SIP, step-up, tax against income, card interest, car-loan rate, withdrawal).
- `components/reels/Cast.tsx` and `hooks/useClock.ts`: fourteen animated vector characters (`lib/reels/cast.ts` holds the list of names, one source for the type, the validator and the test).

The beats themselves (guess, slider, myth, spot, path, sort, order) are drawn by the player and validated by `lib/reels/beats.ts`; this wave only supplies content for them. Every beat keeps a no-touch path (8 seconds without a touch reveals the answer).

## Wave 4: 50 drafts and the review gate

Wave 4 is written and machine-checked but **held out of the app** until a native Hindi reader and a compliance reader sign it off.

- **Where they live**: `content-w4-spot.ts` (14 spot-the-scam), `content-w4-play.ts` (8 choose-your-path with cast, 4 guess-first, 6 sliders), `content-w4-more.ts` (6 sort-it, 4 put-in-order, 6 myth decks, 2 explainers). `drafts.ts` collects them (`DRAFT_REELS`, `DRAFT_IDS`, `liveDrafts()`); their ladder entries and tool links are in `drafts-meta.ts` and `drafts-act.ts`. Two draft series, **Married and Money** (Neel and Isha) and **New Parent** (Sana), are in `series.ts` and appear only when every episode is live.
- **The gate**: `review.ts`. A draft is live when its id is in `REVIEWED` with the Hindi reader, the compliance reader and the date, or when the build sets `EXPO_PUBLIC_REELS_DRAFTS=1` (a review or test build). With neither, the library is exactly what it was before wave 4, and `META`, `ACT_MORE` and the series list leave the drafts out too.
- **To review**: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs scripts/review-sheet.mts > ../docs/review/wave4-review-sheet.md` writes every caption, picture label, interaction and quiz in both languages side by side with sign-off boxes and flags for the facts to check (the sheet is checked in at `docs/review/wave4-review-sheet.md`). To see them in the app: `EXPO_PUBLIC_REELS_DRAFTS=1 npx expo start`.
- **Tests**: `__tests__/reels-drafts.test.mts` (rules, gate, figures, and a run with every draft switched on). The full suite passes both with and without the flag.
