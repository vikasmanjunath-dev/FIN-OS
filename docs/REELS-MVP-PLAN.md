# Money reels as the FIN-OS mobile MVP: plan

Status: Phase 1 is built (this document, Oct 18 2026). Phases 2 to 5 are planned. Nothing here needs a server or a paid service to work.

## 1. The idea in one sentence

A person opens the app, sees **one 30-second animated lesson chosen for their own money situation**, answers one question, and is one tap away from **doing the thing on their own numbers**. Come back tomorrow for the next one.

Everything else in FIN-OS (trackers, calculators, Money Score, Arya) is the "do" side. Reels are the "hook" side: the reason to open the app daily. The MVP is the loop between them, not more content.

## 2. Who it is for, and the problem

- Salaried people in India aged 22 to 40 who know they "should" invest, insure and save but do not read long articles or open finance apps daily.
- Hindi-first and English-first, on mid-range Android phones, often on patchy data. So: on-device, offline, small.
- The problem is not missing information. It is that nothing connects learning to the next action, and nothing brings them back.

## 3. The MVP loop

```
Open app → "For you" reel (chosen from Money Score + what you've seen)
        → watch 30 s → one question → why it's right
        → "Try it with your numbers" (opens the matching calculator / tool)
        → streak and daily goal update → tomorrow's reel
```

Success is measured on the phone, privately (no tracking service): reels finished per week, quiz right-rate, streak length, how many "try it" taps open a tool. The existing opt-in, redacted usage counters (feedback loop) can carry these once an endpoint exists.

## 4. What makes it "advanced" (and what we deliberately do not do)

| Advanced | How, with no server |
|---|---|
| Personalised feed | Ranks reels from the saved Money Score pillars, what you watched, and what you got wrong |
| Spaced repetition | A wrong answer comes back after a day, a right one after a week |
| Streak and daily goal | Counted from the days you finished a reel; one reel a day keeps it |
| Learn → Act | Every reel ends with a link to the tool that applies it |
| Your numbers in the story | Phase 2: the EMI, SIP and emergency-fund reels use your own figures (on the device) |
| Voice | Phone text-to-speech today; Phase 4 recorded Hindi/English voice |
| Mascot | Mitra is code-drawn today; Phase 4 swaps in commissioned art without touching the scripts |

Not doing: tips on what to buy, return promises, social feeds, ads, or sending reel activity off the phone.

## 5. Phases

**Phase 1: the loop (built Oct 18 2026)**
- "For you" feed ordering and a one-line reason on each reel.
- Spaced repetition for wrong answers.
- Day streak, daily goal, topic progress (stored on the phone, same sync rule as the lesson ticks).
- "Try it with your numbers" button on every reel.
- Home card "Today's reel" with the streak.
- Tests for the ranking, the streak maths and the links.

**Phase 2: your numbers in the reels (built Oct 18 2026; share is text, not an image)**
- A reel can read figures from the device (monthly income, SIP, loan EMI from the debt tracker, emergency fund) and fall back to the example figures when absent. Guard: the caption always says "your" figure came from the app, never invents one.
- Share card for a finished reel (image with the one takeaway, no personal figures).

**Phase 3: content engine (40 reels built Oct 19 2026; the author checklist and seasonal reels are not)**
- 40+ reels in 6 topics (tax, retirement, credit score, scams and fraud, home loan, goals), each tied to a Learn lesson.
- A content checklist script for authors (the existing validator plus a Hindi review sign-off field).
- Seasonal reels (tax-saving in Jan to Mar, advance tax in Jun/Sep/Dec, Diwali spending).

**Phase 4: production polish**
- Hindi review by a native speaker; optional recorded voice; commissioned Mitra art; haptics and sound design.
- Accessibility pass on a real phone with a screen reader.

**Phase 5: growth (needs the team)**
- Hosted backend for sync (the Supabase project is gone and needs replacing), push reminder at the person's chosen time, referral share links, a small web version of the feed on the site.

## 6. Risks and how they are handled

| Risk | Handling |
|---|---|
| Looks like investment advice | Validator bans promise and advice wording; every percentage is labelled assumed or example; a SEBI-compliance read is a release gate (Phase 4) |
| Wrong figures | Every figure is computed from tested functions with known-answer tests |
| Hindi quality | Marked as needing human review; text-fit rules already enforced |
| Streak guilt | One reel keeps the streak; no loss messaging; a "rest day" is not a failure (streak counts days with a reel, a missed day resets quietly) |
| Privacy | Only reel ids and dates are stored; listed in the privacy registry; never sent unless the person signs in and syncs |

## 7. What I need from you (not blocking Phase 1)

1. A native Hindi reader to review the captions.
2. A decision on the push-reminder time default and whether to add recorded voice.
3. A new Supabase project (or another backend) if cross-device sync is wanted.
4. A compliance read of the reel copy before a public release.

## 8. Definition of done for the MVP

A new user can: open the app → see today's reel → finish it → open the calculator from it → return the next day and see the streak, on a phone with no network, in Hindi or English, with all tests, lint and the layout audit clean.
