# 400 more reels: the production plan

Status: written Oct 19 2026. The library today is 104 reels (98 lessons plus 6 playable). This plan takes it to about 500 in eight waves of about 50. Wave 3 is built with this document; the rest are scheduled and gated.

## 1. What "400 more" has to mean

Volume is the easy part. A reel is data, so we can author 50 in a day. The things that decide whether 500 reels are *good* are:

1. **Every reel is checked by machine**: both languages, length, reading speed, wording that never promises or advises, every figure computed by `figures.ts` and covered by a known-answer test (already enforced for all 104).
2. **Every reel is checked by a person before it is public**: Hindi by a native speaker, and tax, insurance and scam wording by a compliance reader. This is the real bottleneck, and the plan is built around it (section 6).
3. **No two reels teach the same thing the same way.** Each wave is planned by topic and format, not by "more of the same".
4. **Most reels are about the viewer, not about a character called Asha.** The ranker only feels personal if a large share can use the person's own figures or react to what they do.

So the target is 400 reels *in the library*, shipped wave by wave, with a gate between waves. Nothing here changes the rule that a reel never gives advice.

## 2. The mix (400 reels)

| Format | Count | What the viewer does | Needs from the engine |
|---|---|---|---|
| Myth or fact deck | 60 | Calls five statements a myth or a fact | exists (`myth` beat) |
| Guess first | 50 | Drags a marker to guess a figure, then sees it | exists (`guess` beat) |
| What-if slider | 45 | Drags amount, years or rate and watches the picture redraw | 3 models exist; ~12 more needed (EMI vs rate, goal SIP, step-up, tax at income, corpus vs spend) |
| Spot the scam | 40 | Taps the red flags in a realistic SMS, WhatsApp message or call | new `spot` beat |
| Choose your path | 40 | Picks what a character does with a bonus, a loan, a job offer; each path plays with honest trade-offs | new `choose` beat |
| Sort it | 25 | Sorts needs, wants and wealth-builders, or orders steps | new `sort` beat |
| Your Number | 50 | Sees the story rebuilt from their own SIP, EMI, spending, fund, age, income | `mine.ts` / `personal*.ts` extended |
| Story episodes | 36 | Watches the next episode of one of six new series | series data (done) |
| Explainers | 54 | Watches, answers one question | exists |

Interactive reels are 260 of the 400 (65%). Every reel keeps a no-touch path: if nothing is touched for about 8 seconds the reveal plays by itself.

## 3. Topic allocation (after all eight waves, about 504 reels)

| Topic | Now | Add | Total | Depth added |
|---|---|---|---|---|
| Basics | 8 | 32 | 40 | budgeting methods, bank accounts, UPI limits, financial habits, first job, couples and money |
| Investing | 18 | 72 | 90 | stocks and how to read a result, IPOs, ETFs, SIP types, asset classes, REITs, F&O and crypto warnings, behaviour (FOMO, herd, panic), costs |
| Loans | 10 | 30 | 40 | personal, car, education loans, restructuring, foreclosure, co-borrowers, rate resets, balance transfer |
| Credit | 6 | 24 | 30 | credit report reading, disputes, cards and rewards, limits, secured cards, thin files, co-signing |
| Protection | 10 | 40 | 50 | health claims, cashless, term riders, critical illness, motor, home, travel, pet, cyber insurance, claim steps |
| Tax | 14 | 56 | 70 | ITR forms, capital gains by asset, TDS on property, advance tax, gifts, freelancers, rent, ESOPs, NRI basics |
| Retirement | 10 | 35 | 45 | NPS tiers, EPF rules, pensions, SCSS, withdrawal plans, longevity, downsizing, estate basics |
| Safety | 14 | 46 | 60 | spot-the-scam scenarios for SMS, WhatsApp, calls, QR, fake apps, job offers, loan apps, marketplace, investment groups, deepfakes |
| Goals | 14 | 31 | 45 | child, wedding, car, home, travel, sabbatical, gig income, couples, parents' care, windfalls, yearly reviews |
| **Total** | **104** | **366 + 34 in series** | **~504** | |

(The 34 series episodes sit across topics; the six new series are listed in section 5.)

## 4. Interactivity and characters (what we build, and who builds it)

The player and the beat engine are owned by the parallel "Reels MVP blueprint and personalization" session; content, series and the map are owned here. The split stays.

**New beats (engine side, requested from the other session):**
- `spot`: a realistic message or call script with 3 to 5 tappable phrases; the viewer taps the red flags, then sees which were real and why. No penalty.
- `choose`: two or three options for a character's decision; each plays a short consequence with figures from `figures.ts`; says plainly when "it depends".
- `sort`: three to six cards into two or three bins, or into an order.
- more slider models: `emi-rate`, `emi-tenure`, `goal-sip`, `step-up`, `tax-income`, `corpus-spend`, `fd-real`, `card-interest`.
- an optional `who` on a scene so a cast character, not only Mitra, can stand in the picture.

**Characters (built here):**
- Mitra stays the guide. A new cast of six (Aarav, Meera, Imran, Kavya, Rohan, Devika, the people in the series) are drawn as animated vector characters in `components/reels/Cast.tsx`: they bob, blink, gesture (wave, point, shrug, cheer) and change expression, all as a pure function of the clock like Mitra, so they cost no image files, work offline and respect reduced motion. They appear on the series screens now and in reels once the player accepts `who`.
- Honest limit: these are code-drawn vector characters with simple motion. Film-quality character animation needs an illustrator; that is a decision for you (see section 8).

**Personalisation (built here, with `meta.ts` and `mine.ts`):**
- Every new reel carries a ladder level, Money Score pillar weights, triggers and a `growth` flag (so reels that say "put in more" are held back for someone under strain).
- 50 reels are "Your Number" reels. The person's own figures widen from SIP, EMI, spending and fund to age, income, rent, loan type, goals and the dates of life events, all read from what they already entered in the app, all on the phone.

## 5. Six more series (36 episodes, wave 4 onward)

| Series | Cast | End move |
|---|---|---|
| Married and Money | Neel and Isha | One shared view of income, goals and a joint emergency fund |
| New Parent | Sana | A child fund, cover reviewed, nominees updated |
| Job Change Checklist | Vikram | Salary, PF transfer, tax regime and insurance reviewed |
| Freelancer's Year | Tara | Tax set aside, buffer built, advance tax dates set |
| Parents' Money | Arjun | Parents' health cover, nominees and a will conversation started |
| Investor's First Year | Zoya | A written plan, one SIP, rules for not panicking |

## 6. The quality gates (nothing skips one)

1. **Brief**: topic, rung on the ladder (myth, concept, decision, action), format, the one thing it teaches, the tool it leads to.
2. **Script as data**, both languages, through `validateReel` (length, reading speed, picture-text fit, banned wording, assumptions stated).
3. **Figures**: only from `figures.ts`; each new function gets a known-answer test checked against a plain loop, and each caption's figures are asserted.
4. **Facts that change** (slabs, limits, rates, dates): not typed into captions; computed from `taxcore.ts` or tagged with what they depend on, and the reel says to check the current rule.
5. **Automatic checks in the build**: ladder entry exists, tool link exists (not for scam reels), series and map reference real reels, layout audit clean at normal text.
6. **Human review**: a native Hindi reader, then a compliance reader for tax, insurance, investing and scam reels. Until a reel has both, it is marked *draft*. **Decision for you:** show drafts, or hold them back from the public build. The default here is to hold back anything in wave 3 or later until reviewed, and ship the reviewed set.
7. **Phone check**: text size, screen reader, reduce-motion, on a real device.

## 7. The waves

| Wave | Reels | Focus | Status |
|---|---|---|---|
| 1 and 2 | 104 | Foundations, 6 series, Money Map | built |
| 3 | 64 | Spot-the-scam (12), myth decks (10), guess-first (8), sliders (11), choose-your-path (5), sort (6), order (4), explainers (8); cast characters | built Oct 19 to 20 2026 |
| 4 | 50 | More spot-the-scam, paths, guesses, sliders, sorts, orders, myths; series 7 and 8 | built as drafts Oct 20 2026, awaiting review |
| 5 | 50 | More choose-your-path (beat exists) and Your Number extensions | next |
| 6 | 50 | More sort-it and sliders (beats and models exist) | next |
| 7 | 50 | Tax and retirement depth, freelancers, NRI, ESOPs | content only |
| 8 | 50 | Protection, credit and loans depth; series 9 to 12 | content only |
| 9 | 50 | Goals, couples, parents, and the long tail; final review sweep | content only |

## 8. What I need from you

1. **Reviewers**: who reads Hindi, and who does the compliance read. Without named people, waves 3 onward stay drafts.
2. **Characters**: stay with code-drawn Mitra and the six cast, or budget for an illustrator and voice artist (Phase 4).
3. **Languages beyond Hindi**: Marathi, Tamil, Telugu and Bengali multiply the review load and need a per-language record in the type system.
4. **Draft policy**: hold unreviewed reels back, or show them with a "draft" label.
5. **A new backend** if you want cross-device sync and push reminders.

## 9. Risks

| Risk | Handling |
|---|---|
| 500 reels read as advice | validator bans advice and promises; every figure is an assumption or example; compliance gate |
| Wrong or stale rules | computed from `taxcore.ts`; "dependsOn" tags; the reel tells the viewer to check the current rule |
| Hindi quality at volume | native review gate; drafts held back |
| Sameness | allocation by format and rung, not "more of the same"; a monthly report of overlapping reels |
| App size and speed | a reel is a few KB; the library is still under 2 MB as text |
| Fatigue | the daily episode is one anchor reel and up to two extras; the library is open, never a feed you must finish |
