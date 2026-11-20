# Tax rules: one source of truth

All income-tax maths in FIN-OS lives in `js/finos-taxcore.js` (`FinosTaxCore`), FY 2025-26. Nothing else should carry its own copy of the slabs.

| Rule | Value |
|---|---|
| New regime slabs | 0–4L nil · 4–8L 5% · 8–12L 10% · 12–16L 15% · 16–20L 20% · 20–24L 25% · above 24L 30% |
| New regime, Sec 87A | no tax up to ₹12L taxable, with marginal relief just above it (tax never exceeds the income over ₹12L) |
| Old regime slabs | 0–2.5L nil · 2.5–5L 5% · 5–10L 20% · above 10L 30% |
| Old regime, Sec 87A | no tax up to ₹5L taxable (no marginal relief, as in the Act) |
| Standard deduction | ₹75,000 new · ₹50,000 old (`STD_NEW`, `STD_OLD`) |
| Cess | 4% on the tax after rebate or relief |
| Not modelled | surcharge above ₹50L income, senior-citizen thresholds, special-rate income inside the slabs |

Callers that cannot model something say so on the page ("Surcharge on income above ₹50 lakh is not included").

## Who uses it

| Surface | How |
|---|---|
| Income Tax Calculator (`calculators/tax & salary/income.html`), Old vs New (`oldnew.html`) | `taxNew` / `taxOld` directly. Old-regime 80C and 80D are capped at their legal limits whatever is typed |
| Tax Dossier (`js/tax-dossier.js`, dashboard and CA advisor) | `taxNew` / `taxOld`; the core is loaded by both pages |
| Tax tracker (`html/tax.html`), ITR summary, Salary Optimizer, Offer Compare, Prepay vs Invest | `taxNew` / `taxOld` / `savingsPlan` |
| Arya tools `optimize_tax` and `calc_nps`, and the PULSE Tax Optimizer widget | `savingsPlan` through `_taxPlan()` in `js/arya-sidebar-panel.js` |
| Arya's advance-tax nudge (`js/arya-life-events.js`) | cheaper of the two regimes ÷ 4; with no income or no core it names no amount |

`js/arya-lazy.js` loads the core just before the sidebar panel, so every page that has the sidebar has `FinosTaxCore`.

## Why savings are measured against the better regime

80C, 80D and NPS 80CCD(1B) exist only in the old regime. `savingsPlan` therefore compares what you pay now (the cheaper regime) with the cheaper of the new regime and the old regime with every core deduction maxed. For most incomes the new regime already wins, so the honest answer is "these deductions would not lower your tax unless you switch regime", and the potential saving is ₹0. Per-deduction savings are shown only when the old regime would actually win. `alreadyClaimed80c` and `alreadyClaimedOther` tell it what is claimed already.

## Keeping it right

- Change a rule in `finos-taxcore.js` only, then update the hand-checked values in `tests/taxcore.test.js`.
- `tests/test_tax_consistency_ui.py` drives each page against an independent Python implementation across a grid of incomes (slab edges, exactly ₹12L taxable, one rupee above), so a page that keeps its own older copy fails.
- Known caveat: the NPS tracker (`js/finos-nps-tracker.js`) uses the marginal rate the user selects and says it does not model the rebate.
