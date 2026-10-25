# Trust ribbon: "How this is worked out"

Part of the Money Reels guide (`docs/REELS.md`, section 3). Notes live in `mobile/lib/reels/trust.ts` (`TRUST`, `trustFor`).

## What it is

`lib/reels/trust.ts` maps a reel id to the formula, the assumptions and an as-of date. Reels with an entry show "How this is worked out" under the picture and on the question screen, which opens `TrustSheet` and pauses the reel. A test checks every entry belongs to a real reel, reads in both languages, and labels percentages as assumptions. Add an entry whenever a reel quotes a figure. Since Oct 19 2026 every live reel that quotes a figure has one (the author checklist, `npm run reels:check -- --summary`, reports 0 without). Reels with the same maths share one formula constant in `trust.ts` (SIP, EMI, goal SIP, cost-later, unpaid card balance, tax saved = deduction × slab × 1.04, and so on) and differ only in `assumes`; tax notes name the year (FY 2025-26, as in `lib/taxcore.ts`); scam reels get a note that says nothing is calculated. `__tests__/reels-trust2.test.mts` re-derives each shared formula from the note's own words against `figures.ts`, and checks every rate a note calls "assumed" is used in the reel. Hindi in these notes is a draft for a native reviewer.
