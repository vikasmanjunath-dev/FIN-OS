# Seven-day challenges

Part of the Money Reels guide (`docs/REELS.md`, section 5). Code: `lib/reels/challenges.ts`, `app/learn/challenges.tsx`, `__tests__/reels-challenges2.test.mts`.

## The first two

`lib/reels/challenges.ts` and `app/learn/challenges.tsx` (cards on Learn and on the end-of-episode page): "Find your leak in 7 days" and "Scam-proof your phone in 7 days". One task a day, ticked by the person, a missed day costs nothing (the next task simply waits), a run untouched for 30 days is dropped. Progress in `finos_session_reels_challenges`, never synced.

## Challenges v2: eight challenges

The seven-day challenges grew from 2 to 8 (`lib/reels/challenges.ts`, `app/learn/challenges.tsx`). The original two ("Find your leak", "Scam-proof your phone") are unchanged in order and wording, apart from reel links on some tasks. The six new ones, each seven tasks of one to five minutes in English and Hindi (Hindi is a draft for a native reviewer):

| id | what it does | tools it opens |
|---|---|---|
| `know-your-numbers` | records income, spending, emergency fund, SIP and loans | budget, emergency fund, recurring entries, debt payoff, net worth, Money Score |
| `first-fund-step` | a first month of cover: bills, target, place, a small amount, update the balance | budget, emergency fund |
| `tax-ready-week` (`growth`) | regime, 80C so far, proofs, Form 16 / AIS, dates, ITR kit, one question | tax savings, tax planner, calendar, ITR kit |
| `loan-checkup-week` | list loans, EMI share, costliest rate, credit score, one prepay what-if (a look, not an action), prepayment terms, a question | debt payoff, credit score, prepay tool |
| `insurance-basics-week` | what you have, renewals, health cover terms, life cover figure, nominees, claim details, a question | insurance tracker, comparison, life cover, hub |
| `subscription-sweep` | autopay lists, tracker, card bill, used or not, cancel one, free trials, yearly saving | subscriptions, calendar, leak finder |

Nothing is a purchase or investing instruction and nothing is advice; the ends send the person to a qualified professional where it matters.

- **Reel links.** A task may carry `reel` (a library id, checked by a test). The screen shows a small "▶ Watch first: <reel title>" link that opens the reel. Watching it, or finishing the challenge, writes nothing outside the challenge state (`finos_session_reels_challenges`).
- **My moves.** `pledgeToStart(day, pledgedIds, actHref, startedIds)` returns a pledged reel whose tool (`ACT_ALL[id].href`) is the task's own screen, which has a tracked figure (`METRIC_OF`) and is not already started. The screen then shows "Mark "<reel>" as started in My moves"; only that tap calls `beginMove` (the existing moves API). Nothing is started silently, and a reel with no tracked figure never gets the button, because `startMove` would ignore it.
- **`suggestChallenge(profile, signals, state)`** returns at most one `{ id, label }` (the label is both languages, "Try a 7-day challenge: ..."), or null. Rules: skip challenges already in progress or finished (a run untouched for 30 days does not count); try pillars scoring below `WEAK_PILLAR` (70), lowest first; the first challenge that lists that pillar wins, and one that links a reel the person pledged is preferred; with no Money Score at all, "Know your numbers"; under money strain nothing marked `growth` is ever suggested (today `tax-ready-week`, whose 80C step can read as "put in more"), so a strained person gets the figures, fund or loan look instead, or nothing.
- **Wiring for the calm stop (not done).** Where the calm stop renders its challenge button, call `const s = suggestChallenge(j.profile, j.signals, await loadChallenges())` (or keep the loaded state in the component) and, when `s` is not null, use `s.label[lang]` as the button text and `router.push('/learn/challenges')` as before. When it is null keep the existing text.
- **Not done / for others.** `suggestChallenge` is not called by any screen: the calm stop (`components/reels/EpisodeEnd.tsx`) shows a fixed "Try a 7-day challenge" button that opens `/learn/challenges`, and Home does not mention challenges. Hindi needs a native reviewer. The tax-ready challenge names the old and new regime and 80C, with no figure; keep its wording in step with the tax tools when the budget changes. A run in progress on a phone keeps working: ids of the first two are unchanged.
- **Tests.** `__tests__/reels-challenges2.test.mts` (every challenge: seven tasks, both languages, routes exist, reels exist, banned wording, unique ids; `pledgeToStart`; `suggestChallenge` known answers including strain).
