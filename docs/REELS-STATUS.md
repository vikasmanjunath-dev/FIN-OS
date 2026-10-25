# Money Reels: status for the product owner

As of **24 Oct 2026**. Every number below was produced from the code that day (`npm test`, `npm run reels:check`, `npm run reels:perf`, `export-reels-web.mts --check`). The guide is `docs/REELS.md`; per-feature notes are in `docs/reels/`.

**In one line:** the engine is finished and tested in code; what is left is people (a Hindi reader, a compliance reader), a real phone, assets and a backend decision, plus the content waves.

## Numbers

| | |
|---|---|
| Live reels | **177** in 9 topics (investing 30, scams 31, goals 21, tax 19, loans 18, protection 17, basics 16, retirement 14, credit 11) |
| With something to do (a beat) | 71 (slider 16, spot-the-scam 15, myth 12, guess 10, sort 7, path 6, order 5); 106 are explainers |
| Drafts held out of the app | **50** (wave 4), plus 2 draft series; out until `lib/reels/review.ts` `REVIEWED` has them |
| Own-figure ("Your Number") reels | 17 |
| Story series live / challenges / facts / cast | 6 / 8 / 23 / 14 figures |
| Ladder (myth / concept / decision / action) | 45 / 59 / 51 / 22. Empty cells: Goals-Myth, Scams-Decision |
| Library QA | 163 of 177 clean, 0 blocking, 15 warnings (judgement calls), 1 known (quiz answers skew to option 1 in storage; the feed shuffles) |
| Size | largest reel 4.3 KB (budget 30 KB); library 422 KB as JSON; web data 672 KB raw / 169 KB gzipped (budget 720 / 190) |
| Tests | mobile `npm test`: **1,567 pass, 0 fail**; web `tests/reels-web.test.js`: 21 pass; `typecheck` and `lint` clean |
| Sign-offs recorded | **0** Hindi, **0** compliance (live 177 were built before the gate and have no record; the 50 drafts have none) |

## What is built

Status words: **built-tested** = logic and screens covered by tests and a web-preview look; **built-not-on-a-phone** = also needs a real device (the tests cannot reach it); **not built**.

| Feature | Status |
|---|---|
| Player: scenes, Mitra, 14 cast figures, 7 pictures, English and Hindi, 30 fps clock | built-tested (frame rate never measured on a phone) |
| Seven beats (guess, slider with 10 models, myth, spot, path, sort, order), no-touch path, broken beat skipped | built-tested |
| Trust ribbon "How this is worked out" on every reel that quotes a figure | built-tested (notes' Hindi is a draft) |
| Personal ranker v3, today's episode, calm stop, distress guard (300 made-up people), cold-start welcome | built-tested |
| Your Number: 17 reels from the person's own figures | built-tested (gap: `start-early` not strain-guarded on the All tab, see Known issues) |
| Streak that forgives a rest day, pledges, moves and receipts, real milestones, seasons, facts, weekly line, Money date | built-tested; Money date and gestures built-not-on-a-phone |
| 8 seven-day challenges | built-tested; the suggestion (`suggestChallenge`) is **not wired** into a screen |
| Reels health counters, "What the reels know about you" with resets | built-tested |
| Reels tab (second of six) with badge, Home card | built-tested in the web preview |
| Reminders: when-will-you-do-it, daily nudge, pledge follow-up, Sunday look-back, one merged plan, tap opens the screen | built-not-on-a-phone |
| Read-aloud by the phone's voice (captions, beats, quiz), voice settings screen | built-not-on-a-phone (nobody has listened) |
| Haptics on beats, answers, Money date | built-not-on-a-phone |
| Share as text | built-tested; share as image: built-not-on-a-phone (needs a native rebuild) |
| Ask Mitra (what-ifs through Arya's calculators), Arya to reel chip, reel to Arya | built-tested; chip and screen-reader use not tried on a phone |
| Accessibility passes 1 and 2 | built-tested in the DOM; VoiceOver and TalkBack: not-on-a-phone |
| Web version `html/reels.html` (offline, all beats, saved and My moves) | built-tested (21 tests, offline checked in a browser with the service worker) |
| Author tooling: `reels:check`, `reels:perf`, Hindi and compliance sheets, review sheet, recording brief | built-tested |
| Recorded voice and commissioned art | **not built** (brief written; no `expo-audio`) |
| More languages (Marathi, Tamil, Telugu, Bengali) | **not built** |
| Backend sync, push notifications, Money date online | **not built** (no usable backend, see below) |
| Strain "helpline-style resource card" (blueprint section 3) | **not built** |
| Share counters; background milestone notices | **not built** (milestones are deliberately never notified) |
| Content waves 5 to 9 (about 270 more reels) | **not built** |

## What needs a person or a third party (in priority order)

| # | Needs | Why it is first | Prepared by | Default today |
|---|---|---|---|---|
| 1 | **Compliance read** of tax, insurance, investing and scam wording, and of the tax reels against FY 2026-27 (they use FY 2025-26 constants) | A public release should not go out unread; 473 claims in 161 of 227 reels, 8 rates stated without an assumption cue, 18 FY 2025-26 claims | `npm run reels:compliance` → `docs/compliance-review/` (`claims.csv`); caveats in `mobile/docs/REELS-FIGURE-FINDINGS.md` | Nobody named; 0 signed off |
| 2 | **Hindi native review** of all reels, the voice screen, the Hindi UI strings and `html/reels.html` | 360 of 4,764 texts flagged, mostly term choices only a reader can decide (income, salary, tax regime, emergency fund, spelling) | `npm run reels:hindi` → `docs/hindi-review/` (per-topic CSVs, glossary) | Glossary is a proposal that follows the app screens; Hindi is a draft |
| 3 | **Real-phone checks**: notifications, haptics, text-to-speech in both languages, share as image, VoiceOver and TalkBack, frame rate and swipe on a mid-range Android, gestures against the back swipe | Nothing above the engine has run on a device | `docs/DEVICE_TEST_CHECKLIST.md` section J; `npm run reels:perf` for the data side; smoke tool: `docs/REELS-SWEEP.md` when finished (an end-to-end sweep session was writing it; there is no `reels:smoke` script today) | Build and web-preview checked only |
| 4 | **Release gate for the 50 drafts**: record both sign-offs in `lib/reels/review.ts` | They stay out of the app until then | `scripts/review-sheet.mts` → `docs/review/wave4-review-sheet.md` (checked in) | Held back; `EXPO_PUBLIC_REELS_DRAFTS=1` shows them in a review build |
| 5 | **Integrity review** results | An independent check of the library and wiring | `docs/REELS-INTEGRITY.md` when finished (another session) | Not yet written when this page was made |
| 6 | **Recorded voice and commissioned art** (a voice artist, an illustrator) | The next step up from the phone's voice and code-drawn Mitra | `docs/voice/recording-brief-en.md` and `-hi.md` (one line per scene, 936 scenes per language); timing and caption highlight are ready; playing clips needs `expo-audio` and a manifest | Phone voice and code-drawn Mitra |
| 7 | **More languages** and a per-language review record | Multiplies the review load | none yet (would extend `review.ts` types and the Hindi tooling) | Hindi and English only |
| 8 | **Backend** for sync, push and Money date online | The Supabase project is gone (`docs/PENDING.md` U1, U8); a store build has no usable backend | none (a hosting decision) | Everything runs on the phone; the two synced reel keys only sync if the person signs in |
| 9 | **A finance professional's view** of the distress line (EMI at or above half of income) | It is a placeholder | `lib/reels/signals.ts` `STRAIN_RATIO` | 0.5 |
| 10 | **Content waves 5 to 9** | About 270 reels, all gated by 1 and 2 | `docs/REELS-400-PLAN.md`, `docs/REELS-AUTHORS.md` | Not started |

## Decisions from the blueprint (D1 to D8) and what the code does now

| # | Decision | Default in the code today | Yours to confirm |
|---|---|---|---|
| D1 | Order: interactive first, then personal, or volume first | Interactive and personal first (done): 71 playable reels, ranker v3 | Wave order for 5 to 9 |
| D2 | Streak rule | Forgive one rest day in seven (built); a second rest or two missed days ends the run quietly | Keep or go strict |
| D3 | Move detection | Automatic from tracker changes (built); a tap alone never earns a receipt | Keep |
| D4 | Reviewers | None named; 0 sign-offs | Name a Hindi and a compliance reader (1, 2) |
| D5 | Cast, art and voice | Code-drawn Mitra and 14 figures, phone voice | Budget for an illustrator and voice artist (6) |
| D6 | Distress thresholds | EMI at or above half of income, or an active loss of income | Professional's view (9) |
| D7 | Backend | None usable | Choose a host (8) |
| D8 | Surface | Mobile app plus a smaller web page (built) | Whether the web page should grow toward the app |

## Known issues found while writing this (not fixed here: code was out of scope)

- `suggestChallenge` is written and tested but no screen calls it; the calm stop shows a fixed button. The Learn card for challenges still describes only the first two.
- `hooks/useReelsJourney.ts` calls `personaliseReels(LIBRARY, mine)` without the strain context, so `start-early` is rebuilt from a strained person's SIP on the All tab (the ranker never offers it to them).
- Two tests pin text in `docs/REELS.md` (`Challenges v2`, `suggestChallenge`, `Your Number, wave 2` plus the 17 ids), so the guide keeps those strings.
- `reels:smoke` does not exist as an npm script; smoke and layout audits are Python tools (`scripts/smoke-routes.py`, `scripts/layout-audit.py`).
- Tax reels' figure caveats (unstated assumptions, rounding) are listed but the content was not edited (`mobile/docs/REELS-FIGURE-FINDINGS.md`).
