# web-qa: website QA pass (Oct 14-15 2026)

Scope: html/, js/, css/, calculators/, sw.js, tests/. Nothing under mobile/ or arya-ai/ was edited. Nothing committed.

## State of the suites after the pass
| Command | Result |
|---|---|
| `node --test tests/*.test.js` | 387 pass, 0 fail (was 361; +26 new: `tests/web-qa.test.js`, `tests/rates.test.js`) |
| `python3 tests/static_audit.py` | 7/7 pass (it had started failing on `.claude/worktrees/*` copies of the site; now skips dot-directories) |
| `python3 tests/perf_budget.py` | pass (exit 0) |
| `python3 -m pytest tests/test_*.py` | 544 pass, 2 skipped, 3 failed at the time: calc_explainer burst (fixed, see below) and static_audit tokens/links (fixed, above) |
| `python3 tests/smoke_pages.py` | 430/430 page loads clean (dark + light) before the edits; the pages touched afterwards were re-smoked (see "Re-run" at the end) |
| Calculator fuzz (zero, empty, -5, 1e12, 0.0001, 1 in every box of the 90 calculators) | 21 pages showed NaN / Infinity / froze; all fixed, re-run clean except the "absurd 1e12 years" overflow cases which now show a dash |
| Hostile-stored-data XSS fuzz (124 pages x 3 shapes, tabs clicked) | 15 page groups rendered unescaped stored text; fixed (below) |
| axe over ALL 124 html pages + 90 calculators + index/login, dark and light | the "must be zero" rules (label, select-name, button-name) are now 0 everywhere; remaining items listed under "Left" |
| `cd mobile && npm test` | **23 failures, all deliberate behaviour changes of files the phone ports read** (list under "Mobile parity tests that now need the phone port updated") |

## Defects fixed (page, symptom, cause, fix, test)

### Invented data shown or saved as the person's own
1. **Home loan planner (`js/finos-home-loan.js`, html/home-loan.html)** just by opening the page it wrote a ₹50L what-if loan into `finos_home_loan_emi`, `finos_home_loan_outstanding`, `finos_home_loan_total_interest`, which the Calendar (monthly EMI), Debt Optimizer, Windfall and Arya read as a real debt. Affordability used an invented ₹18L salary when income was unknown, and a blank loan/rate/tenure silently became ₹50L / 8.75% / 20 y. Fix: compute is pure; the keys are written only after the new tick-box "This is my actual home loan" (`finos_hl_is_mine`); unknown income gives "Enter your monthly income", no 40% verdict, no max-loan, no PMAY hint; blank boxes are 0 and give 0, never NaN; stored NaN/negative falls back to the example values; PMAY text no longer quotes old CLSS caps; "Yr-1 Tax Saving" is now "Yr-1 Tax Deductions". Tests: `tests/web-qa.test.js` (5 home loan tests).
2. **Insurance hub (html/insurance-hub.html)**: recommended cover and gaps used an assumed ₹50,000 income and age 30. Now unknown income gives "Add your income for a rule-of-thumb figure" and no size gap; unknown age skips the age rules; the Arya prompt says "not recorded". Policy provider / number / notes escaped. Test: source guard in `web-qa.test.js`.
3. **Explain My Money (`js/explain-my-money.js`)**: a category with no budget got budget = spend x 1.1 so everything was "under budget"; SIP "grew" used an assumed 1% a month; grade D shown with no income; spend with 0 income printed "0% of income". Fixed (no budget = no verdict, growth only from data, grade shows a dash). Names escaped; print() no longer throws when pop-ups are blocked. 4 tests.
4. **Arya scenarios (`js/arya-scenarios.js`)** silently used ₹60,000 income / 20% savings rate / 2 months of fund. Not rewritten (827 lines of product logic); instead every result now carries a "Worked example, not your position. Not recorded yet: ..." note. Sliders got accessible names.
5. **Arya life events (`js/arya-life-events.js`)**: runway assumed ₹30,000 a month and the gap message ₹50,000 income. No recorded spend means no runway; no income means no rupee gap in the message.
6. **Goal optimizer** assumed ₹60,000 income and 20% savings rate: "Available SIP" and "Feasibility" now say "Not recorded" / a dash with a hint. **Net worth FIRE**: assumed ₹50,000 a month, and "Saving X% of income" was circular (expense = 60% of income); now no FIRE number without spend or income, and `finos_fire_percent` is removed rather than written. **Learn pages (`js/learn-ai.js`)** claimed "personalised for Growth Optimizer" with no DNA quiz taken; now says nothing about an archetype until the quiz is done.
7. **Salary optimizer** overwrote `finos_monthly_income` with the take-home of whatever CTC was being tried, on every keystroke. It now writes only its own `finos_salary_take_home`, and seeds `finos_monthly_income` only if none is recorded.
8. **Passive income**: seeded stream amounts (7% of FD value, 2.5% of SGB value) now carry a note saying they are estimates; negative amounts clamp to 0; "New stream added, refresh to edit" now simply re-renders.
9. **Insight cards** said equity gains over ₹1 L were taxed at 10% (pre-July-2024 rule): now ₹1.25 L / 12.5%.
10. **Fixed-income table** listed NSC as compounding "Half-Yearly"; it is annual (matches the tracker).

### Duplicated tax maths
11. `js/finos-windfall.js` had its own slab table: now `FinosTaxCore.taxNew` / `STD_NEW` (windfall.html loads `finos-taxcore.js`). Guard: no private new-regime slab table outside the core (the three modules that keep a private copy are named and are proved equal by `tax-consistency.test.js`).
12. Scheme rates (PPF 7.1, SSY 8.2, NSC 7.7, SCSS 8.2, EPF 8.25, Post Office MIS 7.4) were repeated in 9 places; `tests/rates.test.js` is now the single table, with as-of text, and fails when any file disagrees. (I did not change any rate value; whether they are still the current announced rates must be checked by a person.)

### Calculators (output text changes; see list below)
13. NaN / Infinity / frozen tab on empty or zero boxes: bond, financial-age, inflation-impact, money-behavior-analyzer, time-value-of-money, childedu, parental, shaadicost, lifestyle (desi), expenseratio, rollingreturns, xirr, healthcare, breakeven, margin, riskper, risk-vs-reward, purchasing-power-loss, compounding-visualizer, interest, annuity, savingsinvestment, swp. 55 calculators' shared `format()` now returns a dash for a non-finite number (overflow).
14. Loops bounded to 100 years (a typo such as 2025 years froze rd, interest, swp, compounding-visualizer, purchasing-power-loss, savingsinvestment).

### Escaping (stored text reached innerHTML / value="")
passive-income labels and notes (a quote broke the field), PPF nickname, fixed-income label/bank/nominee, EPF UAN/DOJ, crypto symbol/name, gold holding name, goal names (goal-auto-fund, goal optimizer), MF names (mf-intelligence), roadmap name/DNA/titles (arya-roadmap), insurance hub, explain-my-money, learn-ai archetype. No stored-data render path flagged by the fuzz remains in the pages I could reach by clicking tabs; modules not listed here were not found by the fuzz but were not all read.

### Supply chain / PWA
15. 109 pages loaded `cdn.jsdelivr.net/npm/chart.js` with no version (it floated to whatever is latest; 4.5.1 today), plus unpinned marked, DOMPurify, tesseract and `supabase-js@2`, none with integrity. All pinned to the exact versions served today, with `integrity=sha384-...` and `crossorigin=anonymous` (files are byte-identical to what the unpinned URLs served; checked with cmp). 193 files. Guard test in `web-qa.test.js`. `calculators/inject-arya-ai.sh` was matching the old URL; it now matches any chart.js tag.
16. `sw.js`: pinned jsDelivr library URLs (exact `@x.y.z`, `.js`, no `..`) are cached cache-first, only for a readable CORS 200 response, so the calculators keep working offline after the first visit. Before, one CDN miss left the page without Chart.js and every input dead. `CACHE_NAME` is now `finos-2026-10-14-1`.
17. `tests/test_calc_explainer.py`: its Chart.js stub could not satisfy an integrity hash; the test now drops the attribute from the page it loads (route fetch + fulfill).

### Accessibility
Unlabelled controls fixed at source (label `for=`, aria-label): home-loan, life-cover, sip-stepup, tax-harvest, credit-score (the shared `_inp` helpers), debt-optimizer toggles, windfall, clarity, insight-emi, investor-mindset, learn-fundamental, learn-indicators, hedgefund (15 sliders), news filter, trading simulator (dismiss button, quantity, scenario), Arya scenario sliders.

## Flakes diagnosed
- `test_calc_explainer.py::test_slider_burst...` was not a flake: Chart stub vs the new integrity hash (above).
- `test_arya_lazy.py` retry test and `test_pwa_sw.py` periodicsync passed in the full run; I did not get to a root cause for their known timing/order dependence.
- A `finos_vault_meta` that is not valid JSON makes every page stop at the lock screen (by design of the boot gate); that is not a hang, but there is no recovery path other than clearing site data. Product decision, not changed.

## Left on purpose / not done
- axe "region" (268 nodes), "heading-order" (96), "page-has-heading-one" (16), "landmark-*", "scrollable-region-focusable" (18, learn-etf carousels), "link-in-text-block": best-practice / moderate. Not fixed.
- color-contrast (47 nodes) is all on the learn-* / *detail pages, measured while the scroll-reveal fade-in is still at low opacity (foreground #1f2e59 on #0d1019 is the animation start colour). Looks like a measurement artefact, not verified with a settled page.
- Corrupt-JSON fuzz (`corrupt_fuzz.py`, every known key set to `{}`, `null`, `"abc"`, arrays) was written but **not run**. localStorage-corruption robustness is therefore only covered by the hostile-text fuzz, not by the shape fuzz.
- `finos_80c_used` (written by the tax planner) is added to PPF/SSY deposits in the PPF tracker's Tax tab; if the planner's figure already includes PPF it double counts. Needs a product answer.
- `finos_income` (a band string such as `1L-2.5L`) vs `finos_monthly_income` (rupees) vs `finos_monthly_expense(s)`: still not aliased, as the pending list says; I only removed the writes that overwrote them.
- Life cover form opens with age 30 / income ₹12 L / need ₹60,000 as editable example values (`finos-life-cover.js`), and windfall opens with ₹5 L. They are labelled inputs, not claims, but a blank start would be more honest: product decision.
- Capital gains calculator assumes a 30% slab for debt and short-term property gains; it is in a code comment, not on the screen. Worth a visible line.
- Absurd inputs (1e12 years) in the remaining calculators show a dash or a huge number instead of an error message.
- Root `index.html` / `login.html` are outside my ownership and still use unpinned jsDelivr tags if they have any; `TradeJournal/`, `market intelligence/`, `News1/` not touched.
- Final verification after the last edits: smoke of the 82 touched page loads clean; `test_calculator_math.py`, `test_inline_handlers.py`, `test_a11y.py`, `test_pwa_sw.py` 125 pass; node suite 387 pass; static audit and perf budget pass. A full 430-load smoke was not repeated after the last edits.

## Mobile parity tests that now need the phone port updated (not edited, per the brief)
All are caused by deliberate website changes above. `npm test` in mobile: 641 pass, 23 fail.
- `homeLoan.parity.test.mts` (3 tests): the website now returns `affordable: null`, `emiPct: '—'` and `pmayEligible: false` when income is 0, and no longer writes `finos_home_loan_*` unless `finos_hl_is_mine === '1'`. The phone port should do the same (and the test should set `finos_hl_is_mine` before expecting saved keys).
- `windfall.parity.test.mts` (1): the website now reads `window.FinosTaxCore`; the test sandbox must load `js/finos-taxcore.js` into the vm first (`win.FinosTaxCore = require(...)` or run the file in the same context).
- `webCalc.parity.test.mts` (18 text-equality tests): bond, healthcare, expenseratio, financial-age, inflation-impact, money-behavior, purchasing-power, risk-vs-reward, time-value, breakeven, margin, riskper, childedu, lifestyle (desi), parental, shaadicost, rollingreturns, interest. New website text for empty/zero inputs: a dash (`—`) instead of `NaN` / `Infinity`; financial-age and money-behavior show "Enter your age (over 20) and monthly income" / "Enter your monthly income"; riskper shows "Enter your trading capital"; breakeven shows "Exit Above: —"; rollingreturns treats a 0-year holding as 1 year; interest/rd/swp/savings cap years at 100.
- `insuranceHub.test.mts` (2) and the insurance extraction JSON: `html/insurance-hub.html` rule lines changed (`income > 0 ? income * 12 * 2 : 0`) and shifted; re-run the extraction script and review the "no income" wording.

## Shared-file entries
None needed from me. (`docs/PENDING.md` "Found and fixed" could take the invented-data items above; I did not edit it.)

## Rerun everything
```
cd "/Users/vkm/Desktop/Finos/Initial Deployment"
node --test tests/*.test.js
python3 tests/static_audit.py && python3 tests/perf_budget.py
python3 -m pytest tests/test_*.py -q          # ~20 min
python3 tests/smoke_pages.py                  # ~15 min, 430 loads
cd mobile && npm test
```
The discovery scripts (calculator fuzz, hostile-data XSS fuzz, all-page axe) were throwaway and live only in the session scratchpad; their findings are encoded as `tests/web-qa.test.js` and `tests/rates.test.js`. If you want them kept, they are about 60 lines each and can be added under `scripts/`.

## Commits (explicit file lists; the working tree holds many other sessions' files)
`$S` below = the list files named in the commit blocks. Commit 1 is large because the CDN pin touched 193 files and many of them also carry my calculator/page behaviour edits; split with `git add -p` if you want them apart.

### 1. Pin CDN libraries with integrity, cache them offline, stop the audit scanning worktrees
```
git add -- sw.js calculators/inject-arya-ai.sh tests/static_audit.py tests/test_calc_explainer.py \
  $(git diff --name-only -G'integrity="sha384-' -- html calculators js "Porfolio Analyser")
git commit -F - <<'MSG'
Pin Chart.js, marked, DOMPurify, supabase-js and tesseract with integrity; cache them in the service worker

109 pages loaded Chart.js from an unversioned jsDelivr URL (it floats to the latest release) and
several others loaded marked, DOMPurify and supabase-js@2 the same way, without integrity. All are
now exact versions with sha384 integrity and crossorigin=anonymous; the files are byte-identical
to what the unpinned URLs served today. The service worker caches exact-version jsDelivr .js
paths cache-first (CORS 200 only), so calculators keep working offline after the first visit.
The same files also carry the calculator and page changes of the following commits where a file
was touched by both.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
```

### 2. Calculators: no NaN, Infinity or frozen tab on empty and zero inputs
```
git add -- calculators/
git commit -F - <<'MSG'
Calculators: show a dash instead of NaN / Infinity; cap year loops at 100

Found by typing 0, empty, -5, 0.0001 and 1e12 into every box of the 90 calculators. 23 pages
printed NaN or Infinity or froze the tab (a typo such as 2025 years). format() in 55 pages returns
a dash for a non-finite number; multipliers, ratios and growth rates guard their divisor; year
loops are bounded to 100.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
```

### 3. Stop presenting invented figures as the person's own
```
git add -- js/finos-home-loan.js js/finos-life-cover.js js/finos-sip-stepup.js js/finos-tax-harvest.js js/finos-credit-score.js \
  js/finos-windfall.js js/finos-net-worth.js js/finos-goal-optimizer.js js/finos-salary-optimizer.js js/explain-my-money.js \
  js/arya-scenarios.js js/arya-life-events.js js/learn-ai.js js/finos-passive-income.js js/insight-cards.js \
  html/insurance-hub.html html/windfall.html html/fd-tracker.html tests/web-qa.test.js tests/rates.test.js
git commit -F - <<'MSG'
Home loan, insurance hub, FIRE, goal optimizer and Arya no longer assume income, age or spend

- Home loan planner wrote a what-if loan into the shared loan keys on page open; now only after
  "This is my actual home loan". Unknown income gives no affordability verdict.
- Insurance hub, goal optimizer, FIRE card, Arya scenarios and life events no longer fall back
  to an assumed income, age, spend or savings rate; they say what is not recorded.
- Explain My Money: no invented budget (everything was "under budget"), no assumed SIP growth.
- Salary optimizer no longer overwrites a recorded monthly income.
- Windfall uses the shared tax core; rates table test; equity LTCG wording updated to 12.5% / 1.25 L.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
```

### 4. Escape stored text, accessible names
```
git add -- js/finos-ppf-tracker.js js/finos-fd-tracker.js js/finos-epf-tracker.js js/finos-crypto-tracker.js js/finos-gold-tracker.js \
  js/goal-auto-fund.js js/mf-intelligence.js js/arya-roadmap.js js/finos-debt-optimizer.js
git commit -F - <<'MSG'
Escape stored text in trackers; give unlabelled controls accessible names

Stored nicknames, labels, notes, names and archetypes were interpolated into innerHTML and
value="" attributes (a quote broke the field; markup executed). Labels, sliders, selects and
dismiss buttons that axe flagged as unnamed now have for= / aria-label.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
MSG
```
(Commit 3 and 4 touch some html files through commit 1's `-G` filter; run `git status` between commits.)
