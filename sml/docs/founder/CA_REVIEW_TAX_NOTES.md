# For a Chartered Accountant: tax statements to confirm (about 30 minutes)

Written 2026-10-26 by the SML build, from `sml/tools/check_figures.py`. These are statements FIN-OS shows to users or feeds to Arya. Nothing was changed; please mark each row CORRECT / WRONG (with the right text) / DEPENDS (on what).

## A. Two statements that look out of date (shown to users)
| # | Where | What it says | What `html/tax.html` says | Please confirm |
|---|---|---|---|---|
| A1 | `js/finos-windfall.js`, Property Sale note ("Windfall" planner) | "LTCG (>2yr): 20% + indexation · STCG: slab rate · 54/54F exemption if reinvesting in property/bonds" | "LTCG (> 24 months): 12.5% without indexation" | For a property sold now: is the rate 12.5% without indexation, with the option of 20% with indexation only for property bought before 23 July 2024? Which wording is right for a user? |
| A2 | `js/finos-gold-tracker.js`, Sovereign Gold Bond comment | "capital gains EXEMPT if held to maturity; LTCG 20%+indexation if redeemed on secondary market after 5 yrs" | n/a | After the July 2024 Budget, what is the rate for SGB sold on the exchange after 12 months? Is "20% + indexation" still right for anything? |

## B. The 15 figures FIN-OS states (`sml/rules/figures.json`); confirm each is right for FY 2025-26
| Topic | Value | Source file | Sentence on the page |
|---|---|---|---|
| Section 80C deduction limit (old regime) | 1.5 lakh | `html/tax.html` | "Section 80C Limit: ₹1" |
| Section 80D, self and family | 25,000 | `html/tax.html` | "Self & Family: ₹25,000" |
| Section 80D, parents above 60 | 50,000 | `html/tax.html` | "Parents (above 60): ₹50,000" |
| Section 80E education-loan interest: no upper limit | no upper limit | `html/tax.html` | "Section 80E No Upper Limit" |
| Section 80CCD(1B) additional NPS deduction (old regime only) | 50,000 | `html/tax.html` | "80CCD(1B): Additional ₹50,000 for NPS (above 80C)" |
| LTCG on listed equity, held more than 12 months | 12.5% | `html/tax.html` | "LTCG (> 1 year): 12" |
| STCG on listed equity, held up to 12 months | 20% | `html/tax.html` | "STCG (< 1 year): 20%" |
| Annual LTCG exemption on equity | 1.25 lakh | `html/tax.html` | "1.25L exemption" |
| Real estate long-term holding period | 24 months | `html/tax.html` | "Real Estate Property, Land, House 24 months" |
| LTCG on property held more than 24 months | 12.5% without indexation | `html/tax.html` | "LTCG (> 24 months): 12" |
| Standard deduction, new regime (FY 2025-26) | 75,000 | `html/tax.html` | "Standard Deduction — Flat ₹75,000 (FY 2025-26)" |
| Standard deduction in the tax core | 75,000 new / 50,000 old | `js/finos-taxcore.js` | "STD_NEW / STD_OLD         → standard deduction (₹75,000 / ₹50,000)" |
| New regime: no tax up to 12 lakh taxable income (Sec 87A rebate with marginal relief) | 12 lakh | `js/finos-taxcore.js` | "87A: taxable income up to ₹12,00,000 → no tax" |
| Health and education cess | 4% | `js/finos-taxcore.js` | "CESS = 0.04" |
| GST replaced VAT, service tax and excise | VAT, Service Tax, Excise | `html/tax.html` | "Replaced VAT, Service Tax, Excise" |

## C. Questions where a wrong answer would mislead
1. Section 80E: is "no upper limit" right, and for how many years does the interest deduction run?
2. Section 80CCD(1B) (NPS, Rs 50,000): old regime only? And 80CCD(2) (employer contribution): both regimes?
3. Standard deduction Rs 75,000 (new) / Rs 50,000 (old): both for FY 2025-26?
4. Section 87A: no tax up to Rs 12,00,000 taxable income in the new regime, with marginal relief: does the rebate apply to special-rate capital gains?
5. LTCG exemption Rs 1.25 lakh and the 12-month equity holding period: unchanged for FY 2025-26?
6. Anything on `html/tax.html` you would not let a user rely on without a warning?

Return the marked copy to the build session; wrong rows become fixes behind a test (`sml/tests/test_figures.py` fails when a cited sentence changes).
