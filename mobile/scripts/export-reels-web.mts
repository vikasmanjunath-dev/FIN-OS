// Exports the LIVE money reels as one static JSON file for the website's small reels page (html/reels.html).
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs scripts/export-reels-web.mts            # writes ../js/reels-data.json
//   node ... scripts/export-reels-web.mts --check     # exit 1 if ../js/reels-data.json is not what the app's reels would export now
//   node ... scripts/export-reels-web.mts --stdout    # print the JSON instead of writing it
//   node ... scripts/export-reels-web.mts --parity    # print what the app's own maths gives for every slider position, guess scale and number format
//                                                       (tests/reels-web.test.js compares js/reels-eval.js against this)
// The file holds only the app's example figures (the reels' own scripts); nothing personal can get in: reels built from a person's
// own numbers (`mine`) are skipped. Draft reels that have not passed the review gate are not exported, and the script refuses to run
// in a build that includes drafts (EXPO_PUBLIC_REELS_DRAFTS=1). Output is deterministic: no dates, no ordering from the clock.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACT_ALL, LIBRARY } from '../lib/reels/library.ts';
import { evalModel, isBeatUsable, orderDeck, posToValue, scoreGuess, sliderBars, sliderLine, valueToPos, xText, niceRound } from '../lib/reels/beats.ts';
import { INCLUDE_DRAFTS } from '../lib/reels/review.ts';
import { trustFor } from '../lib/reels/trust.ts';
import { validateReel } from '../lib/reels/validate.ts';
import { withScrambledQuiz } from '../lib/reels/quizorder.ts';
import { money } from '../lib/reels/figures.ts';
import type { Beat, L, Reel } from '../lib/reels/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', '..');                       // the website's root ("Initial Deployment")
const OUT = join(SITE, 'js', 'reels-data.json');
/** The page must stay small: it is precached by the service worker and fetched once. Raise these on purpose, not by accident. */
const BUDGET_KB = 720;                                      // raw bytes (Hindi is 3 bytes a letter in UTF-8, so this is mostly the Hindi)
const GZIP_BUDGET_KB = 190;                                 // what the browser actually downloads

/** The app's tool routes mapped to the website's equivalent page (relative to the site root, URL-encoded). A route not listed here has no
 *  matching page on the site, so the reel shows no tool button. tests/reels-web.test.js checks every target is a real file. */
const SITE_PAGE: Record<string, string> = {
  '/funds': 'html/mf-intelligence.html',
  '/insurance': 'html/insurance-hub.html',
  '/tools/calc/annuity': 'calculators/retirement%20%26%20life%20planning/annuity.html',
  '/tools/calc/compounding': 'calculators/core-thinking/compounding-visualizer.html',
  '/tools/calc/creditcard': 'calculators/loans%2C%20debt%20%26%20emi/creditcard.html',
  '/tools/calc/fd': 'calculators/banking%20%26%20fixed%20income/fd.html',
  '/tools/calc/healthinflation': 'calculators/retirement%20%26%20life%20planning/healthcare.html',
  '/tools/calc/hra': 'calculators/tax%20%26%20salary/hra.html',
  '/tools/calc/inflationimpact': 'calculators/core-thinking/inflation-impact.html',
  '/tools/calc/loaneligibility': 'calculators/loans%2C%20debt%20%26%20emi/loaneligibility.html',
  '/tools/calc/loantenure': 'calculators/loans%2C%20debt%20%26%20emi/loantenure.html',
  '/tools/calc/opportunitycost': 'calculators/core-thinking/opportunity-cost.html',
  '/tools/calc/realreturn': 'calculators/core-thinking/real-rate-of-return.html',
  '/tools/calc/sip': 'calculators/investment%20%26%20wealth/sip.html',
  '/tools/calc/swp': 'calculators/investment%20%26%20wealth/swp.html',
  '/tools/calendar': 'html/financial-calendar.html',
  '/tools/credit': 'html/credit-score.html',
  '/tools/debt': 'html/debt-optimizer.html',
  '/tools/goalopt': 'html/goal-optimizer.html',
  '/tools/homeloan': 'html/home-loan.html',
  '/tools/itr': 'html/itr-summary.html',
  '/tools/leak': 'html/system-leak.html',
  '/tools/lifecover': 'html/life-cover.html',
  '/tools/prepay': 'calculators/loans%2C%20debt%20%26%20emi/emiprepay.html',
  '/tools/rebalance': 'html/portfolio-rebalancer.html',
  '/tools/retirement': 'html/retirement-planner.html',
  '/tools/salary': 'html/salary-optimizer.html',
  '/tools/score': 'html/money-score.html',
  '/tools/stepup': 'html/sip-stepup.html',
  '/tools/tax': 'html/tax.html',
  '/tools/taxplanner': 'html/tax.html',
  '/tools/windfall': 'html/windfall.html',
  '/tracker/emergency': 'html/emergency-fund.html',
  '/tracker/epf': 'html/epf-tracker.html',
  '/tracker/fixed': 'html/fd-tracker.html',
  '/tracker/goals': 'html/life-goals-planner.html',
  '/tracker/gold': 'html/gold-tracker.html',
  '/tracker/harvest': 'html/tax-harvest.html',
  '/tracker/networth': 'html/net-worth.html',
  '/tracker/nps': 'html/nps-tracker.html',
  '/tracker/ppf': 'html/ppf-tracker.html',
};

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Text in two languages becomes [english, hindi]: the file is mostly text, and the keys would be a fifth of it. Everything else is copied as it is. */
function pack(v: unknown): Json {
  if (Array.isArray(v)) return v.map(pack);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>, keys = Object.keys(o);
    if (keys.length === 2 && 'en' in o && 'hi' in o && typeof o.en === 'string' && typeof o.hi === 'string') return [o.en, o.hi];
    const out: { [k: string]: Json } = {};
    for (const k of keys) if (o[k] !== undefined) out[k] = pack(o[k]);
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('a reel holds a number that is not finite');
  return v as Json;
}

function exportReel(reel: Reel): { [k: string]: Json } {
  const r = withScrambledQuiz(reel);                       // quiz options in the app's scrambled order, so the web page and the app agree
  const out: { [k: string]: Json } = { id: r.id, topic: r.topic, title: pack(r.title), scenes: pack(r.scenes), quiz: pack(r.quiz) };
  if (r.poke && isBeatUsable(r)) out.beat = { after: r.poke.after, ...(pack(r.poke.beat) as { [k: string]: Json }) };
  const t = trustFor(r.id);
  if (t) out.trust = { formula: pack(t.formula), assumes: pack(t.assumes), asOf: t.asOf };
  const a = ACT_ALL[r.id];
  if (a && SITE_PAGE[a.href]) out.act = { href: SITE_PAGE[a.href], label: pack(a.label) };
  return out;
}

function build(): { json: string; reels: number; unmapped: string[]; noTool: number } {
  if (INCLUDE_DRAFTS) throw new Error('This build includes draft reels (EXPO_PUBLIC_REELS_DRAFTS=1). Export from a normal build so only reviewed reels reach the website.');
  const live = LIBRARY.filter(r => !r.mine);
  const problems = live.flatMap(r => validateReel(r));
  if (problems.length) throw new Error('Reels fail the app\'s own rules:\n' + problems.join('\n'));
  const ids = live.map(r => r.id);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate reel ids');
  const unmapped = [...new Set(live.map(r => ACT_ALL[r.id]?.href).filter((h): h is string => !!h && !SITE_PAGE[h]))].sort();
  const noTool = live.filter(r => !(ACT_ALL[r.id] && SITE_PAGE[ACT_ALL[r.id].href])).length;
  const data = { v: 1, about: 'Example figures only, not advice. Generated by mobile/scripts/export-reels-web.mts from the app\'s live reels; do not edit by hand.', reels: live.map(exportReel) };
  return { json: JSON.stringify(data) + '\n', reels: live.length, unmapped, noTool };
}

/** What the app's own (tested) functions give, for tests/reels-web.test.js to hold js/reels-eval.js to. NaN is written as null. */
function parity(): string {
  const sliders: { id: string; kind: string; steps: unknown[] }[] = [];
  for (const r of LIBRARY) {
    if (!r.poke || !isBeatUsable(r) || r.poke.beat.kind !== 'slider') continue;
    const b = r.poke.beat as Extract<Beat, { kind: 'slider' }>, steps: unknown[] = [];
    const n = Math.round((b.max - b.min) / b.step);
    for (let i = 0; i <= n; i++) {
      const x = Math.round((b.min + i * b.step) * 1e6) / 1e6;
      steps.push({ x, fig: evalModel(b.model, x), line: sliderLine(b, x), bars: sliderBars(b, x), xt: [xText(b, x, 'en'), xText(b, x, 'hi')] });
    }
    sliders.push({ id: r.id, kind: b.model.kind, steps });
  }
  const guess = [[100_000, 10_000_000], [5_000, 500_000], [1_000, 9_000_000]].map(([min, max]) => ({
    min, max,
    pos: [0, 0.1, 0.25, 0.5, 0.77, 1].map(p => ({ p, v: posToValue(p, min, max) })),
    back: [min, min * 3, max / 2, max].map(v => ({ v, p: valueToPos(v, min, max) })),
  }));
  const pairs = [[100, 100], [100, 110], [100, 140], [100, 170], [200, 100], [0, 5], [1_800_000, 2_000_000]].map(([g, a]) => ({ g, a, res: { ...scoreGuess(g, a), times: Number.isFinite(scoreGuess(g, a).times) ? scoreGuess(g, a).times : null } }));
  const rounds = [0, 1, 17.86, 1_786_431, 94_999, 123_456_789].map(v => ({ v, r: niceRound(v) }));
  const moneys = [0, 5, 999, 8997, 12_345, 99_999, 100_000, 148_000, 4_900_000, 9_999_999, 10_000_000, 17_500_000, 123_456_789].map(v => ({ v, m: money(v) }));
  const quizzes = LIBRARY.filter(r => !r.mine).map(r => ({ id: r.id, options: r.quiz.options.map(o => [o.en, o.hi]), answer: [r.quiz.options[r.quiz.answer].en, r.quiz.options[r.quiz.answer].hi] }));
  const decks = [1, 2, 3, 4, 5, 6].map(n => ({ n, d: orderDeck(n) }));
  return JSON.stringify({ sliders, guess, pairs, rounds, moneys, decks, quizzes });
}

const arg = process.argv[2];
/** Writes to stdout and exits only once it has all gone out (a pipe takes big output in pieces). */
const emit = (text: string): void => { process.stdout.write(text, () => process.exit(0)); };

function main(): void {
  if (arg === '--parity') return emit(parity() + '\n');
  const { json, reels, unmapped, noTool } = build();
  if (arg === '--stdout') return emit(json);
  if (arg === '--check') {
    const have = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (have !== json) { console.error('js/reels-data.json is out of date. Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs scripts/export-reels-web.mts'); process.exit(1); }
    console.log('js/reels-data.json is up to date.'); return;
  }
  const kb = Buffer.byteLength(json) / 1024, gz = gzipSync(json).length / 1024;
  if (kb > BUDGET_KB || gz > GZIP_BUDGET_KB) { console.error(`Too big: ${kb.toFixed(1)} KB (${gz.toFixed(1)} KB gzipped); budget ${BUDGET_KB} KB (${GZIP_BUDGET_KB} KB gzipped). Trim the export or raise the budget on purpose.`); process.exit(1); }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);
  console.log(`Wrote js/reels-data.json: ${reels} reels, ${kb.toFixed(1)} KB (${gz.toFixed(1)} KB gzipped), budget ${BUDGET_KB} KB (${GZIP_BUDGET_KB} KB gzipped).`);
  console.log(`${reels - noTool} reels have a tool button; ${noTool} have none (no matching page on the site, or a scam reel on purpose).`);
  if (unmapped.length) console.log(`App routes with no website page (button omitted): ${unmapped.join(', ')}`);
}
main();
