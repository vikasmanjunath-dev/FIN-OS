# Phone parity follow-up (Oct 2026)

The website calculators and tools were changed by the QA pass; the phone ports now produce the same text.
Result: `npx tsc --noEmit` clean, `npm test` 665 pass / 0 fail.

## What changed
- Calculators (dash instead of NaN/Infinity, early-return guards, 100-year caps): think.ts (financialage, inflationimpact,
  moneybehavior, purchasingpower, riskreward, timevalue, compounding), trade.ts (breakeven, margin, riskpertrade), desi.ts
  (childedu, lifestylecreep, parental, shaadicost), retire.ts (healthinflation), health.ts (expenseratio), banking.ts (bond),
  invest.ts (rollingreturns; growth now rounds amounts under 1 lakh), loans.ts (interestoutflow). New `fx()` helper in fmt.ts.
- Home loan: `affordable` is null with no income, `emi()` returns 0 for blank boxes. The phone already writes the shared
  keys only on the explicit "Save as my home loan" button; that button now also sets finos_hl_is_mine = '1'.
  The phone omits the PMAY banner by design, so there is no pmayEligible field.
- Windfall: harness loads js/finos-taxcore.js first; lib/windfall.ts uses STD_NEW from the taxcore port.
- Insurance: facts.json quotes re-pointed to the new hub lines, data.ts regenerated (extract-insurance.py --check passes).
  lib/retirement.ts computeCoverage no longer assumes Rs 50,000/month (rec* = 0, `incomeKnown` false, no income-sized gaps or
  guide figures); app/tracker/insurance.tsx shows "recorded" and says income is not recorded.

## Files changed
- mobile/lib/calcs/fmt.ts, think.ts, trade.ts, desi.ts, retire.ts, health.ts, banking.ts, invest.ts, loans.ts
- mobile/lib/homeLoan.ts, mobile/lib/homeLoanStorage.ts, mobile/lib/windfall.ts
- mobile/lib/retirement.ts, mobile/app/tracker/insurance.tsx
- mobile/content/insurance/facts.json, mobile/content/insurance/data.ts
- mobile/__tests__/windfall.parity.test.mts (harness), mobile/__tests__/homeLoan.parity.test.mts (sets finos_hl_is_mine, null affordability),
  mobile/__tests__/webCalc.parity.test.mts (growth rounding vector)
- docs/agent-notes/parity-followup.md

## Suggested commit message
```
Phone: follow the website QA pass (calc dashes/guards, home loan, windfall tax core, insurance hub)

- calculators show a dash or a prompt instead of NaN/Infinity and match the website early returns
- growth simulator rounds amounts under 1 lakh like the website
- home loan: no affordability verdict without income; shared keys only after the loan is marked mine
- windfall uses the shared tax core standard deduction; harness loads finos-taxcore.js
- insurance hub: re-pointed source lines, no assumed Rs 50,000 income

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```
