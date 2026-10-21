# Money Reels: figure findings from the trust-note pass (Oct 19 2026)

Every figure in the 90 reels that got trust notes was re-derived with figures.ts, figures-play.ts and lib/taxcore.ts. No figure was arithmetically wrong. The lines below are unstated assumptions, rounding choices and tax-year risks. No reel was edited.

## A. Figure is right but rests on something the reel does not say
- path-spare-monthly | says "Figures are over 10 years, for a ₹30 lakh loan at 9%", then "ends about 11 years sooner, saves about ₹22 lakh" | the prepay result is for a 20-year loan (EMI unchanged, ₹15,000 extra every month for the whole loan), not 10 years; name the 20-year term and drop "over 10 years" for that line.
- choose-bonus | "ends about 19 months sooner and saves about ₹44,309" on "₹4 lakh left at 9%" | holds only for a 3-year loan (content-play.ts B.years = 3); the reel never states the tenure.
- no-cost-emi | "about 2.6% a month, or roughly 31% a year" | 31% is 2.6% × 12, not compounded; compounded it is about 36%. Say "about 31% a year, simple" or give the compounded figure.
- path-card-bill | "Almost all of ₹40,000 stays on the card ... about ₹1,400 interest for one month" | ₹1,400 is 3.5% of the full ₹40,000; the minimum payment is ignored, so the real figure is slightly lower.

## B. Rounding or consistency
- car-buying-math | "you pay about ₹12 lakh in all" | exact total is ₹12,45,501 (EMI ₹20,758 × 60); money() rounds above ₹10 lakh to a whole lakh, so ₹12.5 lakh reads closer.
- lifestyle-creep | "would be about ₹12 lakh" | exact value ₹11,50,193 (₹5,000 a month, 12%, 10 years); ₹11.5 lakh reads closer.
- real-return-fd | "taxed, leaving about 4.9%" and "real return about -1%" | uses 30% with no cess, while fd-interest-tax uses 30% + 4% cess (₹31,200 on ₹1 lakh); with cess it is about 4.82% after tax and about -1.1% real.
- standard-deduction | "At the 30% slab, ₹75,000 can save about ₹23,400" next to the new-regime ₹75,000 | in the new regime the 30% rate starts only above ₹24 lakh taxable, so the example fits few people; true as arithmetic.

## C. Tied to FY 2025-26 (taxcore.ts constants); possibly stale in Oct 2026 (FY 2026-27)
Not wrong against taxcore.ts. Confirm which Budget 2026 / Income-tax Act 2025 changes apply and whether taxcore.ts and these reels need a refresh.
- tax-regimes | "Example, FY 2025-26: ... new about ₹97,500, old about ₹1.95 lakh" | slabs, ₹12 lakh 87A limit, ₹75,000 / ₹50,000 standard deductions are FY 2025-26.
- slide-tax-income | "Salary income, FY 2025-26, with ₹2 lakh of deductions in the old regime" | same FY 2025-26 slabs.
- standard-deduction | "For FY 2025-26 it is ₹75,000 in the new regime and ₹50,000 in the old" | names the year; check FY 2026-27.
- section-80c | "up to ₹1.5 lakh a year" | limit as of FY 2025-26; also the section number may change under the new Act.
- elss-basics | "Up to ₹1.5 lakh ... about ₹46,800" | same 80C limit.
- section-80d | "₹25,000 ... and ₹50,000 more for senior-citizen parents" | FY 2025-26 limits.
- parents-health-cover | "up to ₹50,000 ... about ₹15,600 saved" | same 80D limit.
- nps-basics | "extra ₹50,000 a year ... about ₹15,600" | 80CCD(1B) limit, old regime.
- home-loan-tax-benefit | "Interest: up to ₹2 lakh ... about ₹62,400" | 24(b) limit, old regime.
- hra-basics | "least of three amounts ... 50% of basic (metro)" | rule as in the old Act; the metro list and rule may change.
- tax-dates | "15 June, 15 September, 15 December, 15 March ... 31 July ... over ₹10,000" | confirm dates and thresholds for the current year.
- capital-gains | "more than 12 months is long term" for listed equity | rule as of FY 2025-26; rates are not quoted.
