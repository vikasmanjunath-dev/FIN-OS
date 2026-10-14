# Insurance hub: data points that cannot be verified from the repository

Scope: everything the website says about insurance that the phone hub reproduces (`mobile/content/insurance/facts.json`, 21 statements, each with file + line + quote). **None of them carries a date or a source on the website**, so the phone shows "Date not stated on the website" and "Not verified by FIN·OS" beside each one. `asOf` is `null` for all of them. If the owner can supply a source and a date for any of these, set `asOf`, `verified` and `note` in `facts.json` and re-run `python3 mobile/scripts/extract-insurance.py`.

## Figures that need a source and a year before anyone should rely on them

| Fact id | What the website says | Where | Problem |
|---|---|---|---|
| medical_inflation | "14%" medical inflation | insurance-directory.html 164-165; learn-insurance.html 528 | No source, year, or definition (which costs, which cities). |
| avg_icu_bill | average ICU bill 12 lakh | insurance-directory.html 168-169 | No source or year. Same number appears in the made-up "Sharma Ji" story, so the statistic and the story may be circular. |
| hospitalisation_cost_range | one hospitalisation can cost 5-25 lakh | insurance-hub.html 363 | A range without source, year, city or treatment. |
| top_hospital_cost_range | bills at "AIIMS/Apollo" can be 15-30 lakh | insurance-hub.html 364 | No source. AIIMS is a government institute with very different pricing, so one range for both is doubtful. |
| critical_treatment_cost_range | cancer / heart attack / stroke 10-50 lakh | insurance-hub.html 368 | No source or year. |
| critical_rider_premium | rider costs about 3-5 thousand a year | insurance-hub.html 368 | Premium depends on age, health, sum assured, insurer; none stated. Not shown as a price anywhere on the phone except as the website's statement. |
| surgery_cost_projection | 5 lakh today, 9.6 lakh in 5 years, 18.5 lakh in 10 | learn-insurance.html 604 | An illustration of the 14% figure (5 x 1.14^5 = 9.6, 5 x 1.14^10 = 18.5), not data. Inherits the 14% problem. |
| endowment_return | endowment plans give ~5%, inflation 6-7% | learn-insurance.html 550 | A general claim; no source; actual returns differ by plan, term and charges. |
| critical_illness_count | "30+" illnesses | insurance-directory.html 176-177, 252 | Number of covered illnesses varies by insurer and plan; the count is not defined (listed illnesses vs variants). |

## Rules of thumb (a methodology, not data)

| Fact id | Rule | Where | Note |
|---|---|---|---|
| rule_health | health cover about 2x annual income | insurance-hub.html 308 | No source. The phone's tracker uses the same rule; the hub says so. |
| rule_life_term | term cover about 15x annual income | insurance-hub.html 309 | No source. |
| formula_income_x20 | (income x 20) + debt | learn-insurance.html 554-555 | Conflicts with the 15x rule above; the website uses both. The hub shows both and does not choose. |
| rule_critical | critical illness about 5x annual income | insurance-hub.html 311 | No source. |
| rule_vehicle | vehicle shown against a fixed 5 lakh | insurance-hub.html 310 | A fixed number unrelated to any vehicle's insured declared value. Not used on the phone. |
| target_csr | "look for 99%+ claim settlement ratio for 3 years" | insurance-directory.html 172-173, 232 | No source, and a CSR is by number or by amount, differs by year; the hub's question text asks which year and basis. Shown as the website's guidance only. |
| critical_age_threshold | hub flags missing critical cover from age 35 | insurance-hub.html 368 | A prompt threshold, not a medical or regulatory age. |

## Claims worth a regulatory check

| Fact id | Claim | Where | Note |
|---|---|---|---|
| third_party_mandatory | third-party vehicle insurance is legally mandatory in India | insurance-hub.html 367 | No law named, no date. Believed correct in general; the hub still labels it unverified. |
| room_rent_cap | a room rent cap (e.g. 1% of sum insured) cuts the whole bill proportionally | learn-insurance.html 532-533 | Describes proportionate deduction; whether it applies is in each policy wording. |
| co_pay | co-pay means you pay a percentage of every bill | learn-insurance.html 536-537 | Definition; policy-specific. |
| insurance_not_investment | insurance is not an investment | learn-insurance.html 518 | Opinion/principle. |
| self_insure_matrix | self-insure small likely losses; transfer rare large ones | learn-insurance.html 571, 576 | Framing, not data. |

## Content on the website that the phone deliberately does NOT reproduce

- **"Coverage" gauges (95%, 100%, 88%, 82%, 78%, 72%) on the six layers** in insurance-directory.html (`data-coverage`). They are decorative bars with no stated meaning; showing them would imply a measured quantity. Not extracted.
- **The "System Collapse" chart** (`collapseChart`, "Protected vs Unprotected Portfolio") in insurance-directory.html: generated curve with no inputs stated.
- **The fictional "Desi Reality" stories** (Sharma Ji, Rajesh, freelance architect and so on): extracted, but labelled "A made-up illustration" and kept behind a collapsible, because they contain invented rupee figures (for example "25L cash injection", "50 lakh lawsuit").
- **`recBase` values in TYPE_META** (insurance-hub.html 290-296: health 10 lakh, term 1 crore, ULIP 50 lakh, vehicle 5 lakh, home 30 lakh, travel 10 lakh, critical 50 lakh). Kept in `cover-types.json` as `recBaseUnused` for provenance but never displayed: they are fixed numbers unrelated to the person.
- **Tracker gap messages** (`computeCoverage` in `mobile/lib/retirement.ts`, existing code, not mine): "Get a family floater plan", "can cost 5-25L", "10-50L". They are the same unsourced figures. The hub shows the tracker's gaps under a heading that says they rest on the website's rules of thumb, but the underlying copy was not changed (it is outside this agent's area). It also assumes Rs 50,000 a month income when income is not recorded; that assumption is stated in the tracker screen already.

## What the website does not have at all (so the phone has none)

No insurer names, no plan or product list, no premium table, no claim-settlement ratio for any named insurer, no network hospital data, no regulatory limits (IRDAI), no dates. The phone hub therefore shows no insurer comparison and no "best" anything. `checks.json` -> `insurerData` states this on screen. What a real directory would need (each with a source and an as-of date): insurer list with IRDAI registration, product list with UIN, premium for stated age / sum assured / city, CSR by year and basis, network hospital count, waiting periods per product. That is a data-acquisition job, not something to be typed in from memory.
