# Money Score

A free, on-device financial health score. About 10 questions, roughly a minute, no LLM and no backend.

| Piece | File |
|---|---|
| Scoring core + UI (`FinosMoneyScore`) | `js/finos-money-score.js` |
| Page | `html/money-score.html` (linked from Tools, search, and a home-page nudge) |
| Tests | `tests/money-score.test.js` (core), `tests/test_money_score_ui.py` (browser), `tests/test_a11y.py` (axe) |

## How the score works

Six pillars, each scored 0–100, combined as a weighted mean (weights add to 100).

| Pillar | Weight | Full marks when… | Zero when… |
|---|---|---|---|
| Savings rate | 20 | you keep ≥ 20% of income after spending and EMIs | you keep ≤ 0% |
| Emergency fund | 20 | liquid savings ≥ 6 months of (spending + EMIs) | nothing saved |
| Insurance | 20 | term cover ≥ 10× annual income (only counted when you have dependents) and health cover ≥ ₹5L (+₹2.5L per dependent, up to 2) | no cover |
| Debt load | 15 | EMIs ≤ 10% of income | EMIs ≥ 50% of income. High-interest debt caps the pillar at 40 |
| Investing habit | 15 | you invest ≥ 15% of income monthly | you invest nothing |
| Wealth for age | 10 | invested assets ≥ the usual multiple of annual income for your age (0× at 22, 1× at 30, 3× at 40, 6× at 50, 8× at 60, 10× at 65) | nothing invested |

Bands: 0–39 Needs attention · 40–59 Getting there · 60–79 On track · 80–100 Strong.

These are rules of thumb for education, **not personalised investment advice**. Change the targets in `TARGETS` / `BENCH` at the top of the module, and update the golden values in `tests/money-score.test.js` (they are worked out by hand in the comments).

## Next best moves

Each pillar below full marks produces a candidate move with a concrete ₹ amount. Its point gain comes from re-scoring the profile with the move applied, so the "+N points" shown is real, not estimated. The top three are shown, with two safety overrides: high-interest debt, and an emergency fund under 3 months, always rank first.

## Prefill from what FIN-OS already tracks

When there is no saved score, the form fills in what it can work out, and each prefilled answer says where it came from ("From your last 30 days of logged spending. Edit if it is off."). Anything unknown stays blank, never guessed. Once the user has saved answers, those always win.

| Answer | Comes from |
|---|---|
| Income, savings, SIP, age, dependents, term cover | `finos_monthly_income`, `finos_emergency_fund`, `finos_sip_monthly`, `finos_age`, `finos_dependents`, `finos_term_insurance` |
| Spending and EMIs | Logged expenses via `FinosBudget.normalize`, averaged over the last 90 days. EMI-category payments are the EMI figure, every other expense is spending. Income and SIP rows never count. Under 14 days of history is not scaled up |
| Total invested | Stock portfolio + the larger of the CAS import and the SIP tracker (never both, as they can describe the same units) + EPF + PPF + NPS + gold |

`deriveInputs(data)` is pure and unit-tested. Its spending figure is tested to match what Future Loss computes from the same transactions.

## Link to Future Loss

If the user has run Sync Future Loss (`finos_leak_monthly` is set), the savings move quotes that figure and links to the leak panel (`system-leak.html#radar-module`, "See your leak"). The score itself never changes, only the advice. See `docs/FUTURE_LOSS.md`.

## Arya and PULSE

- **What is saved.** Besides the inputs and score, `finos_money_score` holds `weakest` (`{id, label, score}`) and `top` (`{id, title, gain, href, cta}`: the best next move), so other surfaces can show the headline without loading the scoring code.
- **PULSE card** (`buildMoneyScoreWidget` in `js/arya-sidebar-panel.js`). With a score: ring, band, trend since the previous snapshot, weakest area, best next move with its link, and an "Ask Arya how to raise it" button. Without one: an invitation. Links are limited to our own `../html` and `../calculators` pages, anything else falls back to the Money Score page, and every stored string is HTML-escaped.
- **PULSE ranking** (`js/arya-pulse-rank.js`, widget id `moneyScore`, pinned right under the two fixed widgets only for people who have not taken it). No score: +26 with a "you have not checked it yet" reason. Under 40: +40. 40–59: +28. 60–79: +8. 80 and over: -6, no reason. Junk or blank means "no score"; out-of-range values are clamped. The score also appears in the "Since your last visit" strip when it moves by 3 or more.
- **Arya's facts** (`_buildContextBlock` in `js/arya-ai.js`). One line gives the score, weakest area and best next move, and says to quote it and never invent a different one. A second line gives the measured monthly leak when `finos_leak_monthly` is set. Newlines in stored text are flattened so stored data can never start a new line of the prompt, and corrupt JSON is ignored.
- Tests: `tests/pulse-rank.test.js` (ranking, snapshot, diff), `tests/test_money_score_pulse_arya.py` (card in both states, ranking position, hostile and corrupt data, prompt lines, prompt-injection, end to end from taking the score to seeing it in PULSE and in Arya's prompt).

## Data

- Saved on the device only: `finos_money_score` (inputs + result) and `finos_money_score_history` (one score per day, last 24, which drives the "since last time" trend).
- Seeds `finos_monthly_income`, `finos_monthly_expense`, `finos_emergency_fund` and `finos_sip_monthly` **only when they are empty**, so other tools start pre-filled and nothing the user already entered is overwritten.
- Spending is required (a blank would read as "spends nothing" and flatter the savings and emergency pillars).
- The share card (1080×1080 PNG) carries the score, band and pillar scores only, never an amount. A test asserts this.

## Hooks into the rest of FIN-OS

- `finos-personalization.js` `computeNudges()`: a first-time prompt (guaranteed a slot) and, for scores under 60, a "See my plan" nudge.
- Action buttons link to the Emergency Fund planner, Life Cover, Insurance Hub, Subscription Tracker, SIP Step-Up, Retirement Planner and Prepay-vs-Invest. A test checks that every destination exists.
