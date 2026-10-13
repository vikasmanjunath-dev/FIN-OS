// Every calculator on the phone must write the same text as the website page it came from, for the same inputs.
// The website page's own script is run (see helpers/webCalc.mts), so a change on either side that moves a number fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALCS, GROUPS, type CalcDef, type NumberInput } from '../lib/calcs/index.ts';
import { loadWebCalc } from './helpers/webCalc.mts';

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261014);
const round = (x: number, step: number) => Math.round(x / step) * step;
const fix = (x: number) => Number(x.toFixed(6));

function vectors(def: CalcDef): Record<string, number | string | boolean>[] {
  const nums = def.inputs.filter((i): i is NumberInput => (i.kind ?? 'number') === 'number');
  const base: Record<string, any> = {};
  def.inputs.forEach(i => { base[i.key] = i.def; });
  const out: Record<string, any>[] = [{ ...base }];
  // all minimums, all maximums
  out.push({ ...base, ...Object.fromEntries(nums.map(i => [i.key, i.min])) });
  out.push({ ...base, ...Object.fromEntries(nums.map(i => [i.key, i.max])) });
  // each input at zero and just beyond its slider range (people can type any number)
  nums.forEach(i => { out.push({ ...base, [i.key]: 0 }); out.push({ ...base, [i.key]: i.max * 2 }); });
  // random in range, snapped to the slider step
  for (let n = 0; n < 60; n++) {
    const v: Record<string, any> = { ...base };
    nums.forEach(i => { const st = i.step ?? 1; v[i.key] = fix(Math.min(i.max, Math.max(i.min, round(i.min + R() * (i.max - i.min), st)))); });
    def.inputs.forEach(i => {
      if (i.kind === 'choice') v[i.key] = i.options[Math.floor(R() * i.options.length)].id;
      if (i.kind === 'toggle') v[i.key] = R() < 0.5;
    });
    out.push(v);
  }
  return out;
}

test('every calculator belongs to a known group and has a unique id', () => {
  assert.equal(new Set(CALCS.map(c => c.id)).size, CALCS.length);
  const g = new Set(GROUPS.map(x => x.id));
  CALCS.forEach(c => { assert.ok(g.has(c.group), c.id); assert.ok(c.web.startsWith(GROUPS.find(x => x.id === c.group)!.folder + '/'), `${c.id}: web path not in its group folder`); });
});

for (const def of CALCS) {
  test(`${def.id}: text equals the website page (${def.web})`, () => {
    const page = loadWebCalc(def.web);
    const vs = vectors(def);
    for (const v of vs) {
      def.inputs.forEach(i => { if (i.kind === 'choice' && i.webVar) page.setVar(i.webVar, String(v[i.key])); else page.set(i.id ?? i.key, v[i.key] as any); });
      const web = page.run();
      const mine = Object.fromEntries(def.run(v).map(r => [r.id, r.text]));
      assert.deepEqual(mine, web, `inputs ${JSON.stringify(v)}`);
    }
  });
}

// Website bugs the harness found; they are fixed there and must stay fixed.
test('website regression: SSY counts each yearly deposit once (15 deposits)', () => {
  const page = loadWebCalc('banking & fixed income/ssy.html');
  page.set('yearly', 100000); page.set('rate', 8);
  assert.equal(page.run().investedVal, '₹15.00 L');
});

test('website regression: Options Payoff with a zero strike returns instead of looping forever', () => {
  const page = loadWebCalc('trading & markets/options.html');
  page.set('type', 'longCall'); page.set('strike', 0); page.set('premium', 10); page.set('lot', 25);
  const out = page.run();
  assert.equal(out.beVal, 'Break Even: 10');
});

test('website regression: Bond annual income is never a long floating-point string', () => {
  const page = loadWebCalc('banking & fixed income/bond.html');
  page.set('face', 1000); page.set('coupon', 7.1); page.set('price', 950); page.set('years', 5);
  assert.equal(page.run().incomeVal, '₹71');
});
