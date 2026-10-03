# Prepay-vs-Invest, Job-Offer Comparer, Subscription Tracker

> Added October 3, 2026. Three user-facing tools and the pure-logic modules behind them. Every number the pages show comes from a DOM-free module that is unit-tested against an independent re-implementation.

| Tool | Page | Logic | Tests |
|---|---|---|---|
| Prepay Loan or Invest? | `calculators/loans, debt & emi/prepayinvest.html` | `js/finos-prepay-invest.js` | `tests/prepay-invest.test.js` |
| Job Offer Comparer | `calculators/tax & salary/offercompare.html` | `js/finos-offer-compare.js` (uses `js/finos-taxcore.js`) | `tests/offer-compare.test.js` |
| Subscription Tracker (tracker 33) | `html/subscription-tracker.html` | `js/finos-subscriptions.js` | `tests/subscriptions.test.js` |
| Shared tax core | — | `js/finos-taxcore.js` | `tests/taxcore.test.js`, `tests/tax-consistency.test.js` |
| Tax Savings Tracker (tax.html) | `html/tax.html` | `FinosTaxCore.savingsPlan()` | `tests/taxcore.test.js`, `tests/test_tax_tracker_ui.py` |
| Browser end-to-end | all three pages + calendar/reminders | — | `tests/test_new_tools_ui.py` |

## 1. Prepay Loan or Invest?

**Question:** given surplus cash (a monthly amount and/or a lump sum), prepay the home loan or invest it?

Both strategies spend the **same cash every month** (EMI + extra), so wealth at the end of the original tenure is directly comparable.

- **Prepay** — the extra goes to the loan at the *start* of the month (before interest accrues). The EMI is unchanged, so the loan closes early; from then on the whole EMI + extra is invested.
- **Invest** — the loan runs on its normal EMI; the extra is invested from day one.

Assumptions (also shown on the page):

- Monthly rate = annual ÷ 12, like every other FIN-OS calculator.
- Gains tax is charged once at the end: equity LTCG 12.5% above the ₹1.25L exemption; debt/FD gains at the user's slab; both +4% cess.
- Sec 24(b): interest up to ₹2L a year is deductible, modelled as a monthly tax saving (`slab × min(interest, ₹2L/12)`) that is invested too. Off by default (it needs the old regime and a self-occupied property).
- `breakEven()` bisects the investment return at which investing catches up with prepaying (0–40%).
- Not modelled: prepayment charges (none on floating-rate loans), rate resets, liquidity, income changes. The page says so.

Golden values in the tests come from an independent Python implementation (₹50L @ 8.5%/20y, ₹20k/mo extra, 12% equity → prepay ends at ₹1,46,97,823, invest at ₹1,80,25,424; loan closes in month 116).

## 2. Job Offer Comparer

CTC is not salary. For up to three offers the module computes, year by year:

```
fixed        = CTC − variable
basic        = basicPct × fixed                       (default 40%)
PF wage      = basic, or ₹15,000/month ceiling (per-offer choice)
employer PF  = employee PF = 12% × PF wage
gratuity     = 4.81% × basic
employer NPS = npsPct × basic
cash gross   = fixed − employer PF − gratuity − employer NPS + variable × payout% (+ joining bonus, year 1)
tax          = lower of new / old regime (js/finos-taxcore.js)
take-home    = cash gross − employee PF − professional tax (₹2,400) − tax
total value  = take-home + employee PF + employer PF + employer NPS + gratuity accrual
```

Hikes compound yearly and tax is recalculated each year. The old regime uses one "deductions you'd claim" figure (80C incl. PF, 80D, HRA exemption…) that is the same for every offer. The verdict separates **monthly in-hand** from **total value over N years**, because they often pick different winners (more PF locked in = less cash today).

Not modelled: surcharge above ₹50L, ESOPs/RSUs, perks, state-specific professional tax. Gratuity is only paid after five years.

## 3. Subscription Tracker

Stateful tracker (key `finos_subscriptions`; covered by `finos-tracker-sync.js` like every other `finos_*` tracker key, which only does anything when a Supabase session exists).

- Fields: name, category, bill amount, cycle (weekly → yearly), next renewal date, number of people sharing (your share = amount ÷ people), status (active / free trial / paused / cancelled), usefulness 1–5, note.
- Renewals are rolled forward from the **original anchor date**, so 31 Jan → 28 Feb → 31 Mar and a 29 Feb yearly plan survives non-leap years. Dates are plain `YYYY-MM-DD` strings handled in UTC (no IST off-by-one).
- Summary: per-month / per-year cost, share of income, category breakdown, next 30 days, trials ending within 7 days.
- **Worth a second look:** (1) anything you rated ≤ 2/5; (2) overlapping services in the same category (OTT, music, cloud, news, fitness) — keep the best-rated one (ties: keep the cheapest, so the saving is largest) and flag the rest. Trials are never counted as spend.
- Writes `finos_subscriptions_monthly` and `finos_subscriptions_annual` for other modules.
- CSV export neutralises spreadsheet formulas (`=`, `+`, `-`, `@` prefixes).
- Feeds **the Financial Calendar and reminders** as event type `sub` (`FinosSubscriptions.calendarEvents`, up to 3 upcoming occurrences each). Reminder lead time is 3 days; label "Subscription". `finos-reminders.js` loads the module on demand.

## 4. Shared tax core — `js/finos-taxcore.js`

`FinosTaxCore.taxNew()` / `taxOld()` / `best()` — FY 2025-26 slabs, 4% cess, Sec 87A: new regime is **nil up to ₹12,00,000 taxable income, with marginal relief just above it** (tax never exceeds the income over ₹12L); old regime nil up to ₹5,00,000. Surcharge is not modelled.

`tests/tax-consistency.test.js` lifts the tax functions out of `js/finos-itr-summary.js` and `js/finos-salary-optimizer.js` and requires them to match the core at 240+ incomes, so the three implementations cannot drift apart again. (They previously did: the ITR summary still applied the old ₹7L rebate limit and charged ₹41,600 on a ₹10L taxable income.)

**`html/tax.html` (fixed Oct 3, 2026).** The "Live Tax Savings Tracker" used FY 2023-24 slab shapes and the ₹7L rebate, and applied old-regime deductions to new-regime slabs. It now uses `FinosTaxCore.savingsPlan()`:

- Deductions exist only in the old regime, so savings are measured there and compared with the new regime. **Current tax** = the cheaper of new regime and old regime with what you already claim; **potential saving** = the extra you'd save by maxing the core deductions, which is ₹0 whenever the new regime already wins (true at almost every income).
- Instead of a misleading number it tells you *why* and *how far away* the old regime is: "the new regime is cheaper by ₹X even if you max out 80C, 80D and NPS; the old regime only wins if total deductions pass about ₹Y" (`breakEvenDeductions`).
- 80C, 80D and NPS 80CCD(1B) are "core" and add up exactly (applied in order). HRA and 24(b) apply only if you pay rent / have a home loan, so they're shown as a maximum and not summed. 80E has no cap (it equals the interest you pay), so it gets no number — it used to be treated as ~₹10L of headroom.
- The "12% of income already in 80C" assumption now applies to 80C only (it used to be applied to every section).

`js/finos-tax-calc.js` (the separate **Tax Planner** on the same page, global `FinosTaxCalc`) had the same ₹12L cliff — ₹12.75L income paid ₹0 tax but ₹12.75L + ₹1 paid ₹62,400. It now has marginal relief and is checked against the core in `tests/tax-consistency.test.js`. Note the two modules use different globals on purpose: `FinosTaxCalc` (Planner) and `FinosTaxCore` (this core).

## Running the tests

```bash
TZ=Asia/Kolkata node --test tests/taxcore.test.js tests/offer-compare.test.js tests/prepay-invest.test.js tests/subscriptions.test.js tests/tax-consistency.test.js
TZ=Asia/Kolkata python3 -m pytest tests/test_new_tools_ui.py tests/test_tax_tracker_ui.py -q      # needs Playwright + Chromium
```
