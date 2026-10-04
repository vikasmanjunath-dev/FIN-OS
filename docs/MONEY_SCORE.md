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

## Data

- Saved on the device only: `finos_money_score` (inputs + result) and `finos_money_score_history` (one score per day, last 24, which drives the "since last time" trend).
- Seeds `finos_monthly_income`, `finos_monthly_expense`, `finos_emergency_fund` and `finos_sip_monthly` **only when they are empty**, so other tools start pre-filled and nothing the user already entered is overwritten.
- Spending is required (a blank would read as "spends nothing" and flatter the savings and emergency pillars).
- The share card (1080×1080 PNG) carries the score, band and pillar scores only, never an amount. A test asserts this.

## Hooks into the rest of FIN-OS

- `finos-personalization.js` `computeNudges()`: a first-time prompt (guaranteed a slot) and, for scores under 60, a "See my plan" nudge.
- Action buttons link to the Emergency Fund planner, Life Cover, Insurance Hub, Subscription Tracker, SIP Step-Up, Retirement Planner and Prepay-vs-Invest. A test checks that every destination exists.
