// FinosTaxCore — expected values come from an independent reference implementation (and hand-checked slabs).
const test = require('node:test');
const assert = require('node:assert');
const T = require('../js/finos-taxcore.js');

test('new regime: 87A makes tax nil up to ₹12L taxable', () => {
  assert.strictEqual(T.taxNew(0), 0);
  assert.strictEqual(T.taxNew(1000000), 0);
  assert.strictEqual(T.taxNew(1200000), 0);
});

test('new regime: marginal relief just above ₹12L — a ₹1 raise never costs more than ₹1 (before cess)', () => {
  // slab tax on 12.5L = 67,500 but only ₹50,000 is over the ₹12L limit → 50,000 × 1.04
  assert.strictEqual(T.taxNew(1250000), 52000);
  assert.strictEqual(T.taxNew(1300000), 78000);
  const step = T.taxNew(1200001) - T.taxNew(1200000);
  assert.ok(step >= 0 && step <= 2, 'tax must not jump at the rebate limit, got +' + step);
});

test('new regime: slab arithmetic above the relief range', () => {
  assert.strictEqual(T.taxNew(1603968), 125625);       // 20k + 40k + 60k + 3,968×20% = 120,793.6 → ×1.04
  assert.strictEqual(T.taxNew(3000000), 499200);       // 300k + 6L×30% = 480,000 → ×1.04
});

test('old regime: rebate up to ₹5L, then 5/20/30% slabs', () => {
  assert.strictEqual(T.taxOld(400000), 0);
  assert.strictEqual(T.taxOld(500000), 0);
  assert.strictEqual(T.taxOld(600000), 33800);         // 12,500 + 1L×20% = 32,500 → ×1.04
  assert.strictEqual(T.taxOld(1476568), 265689);
});

test('best() picks the cheaper regime and ties go to the new regime', () => {
  assert.deepStrictEqual(T.best(1603968, 1476568), { regime: 'new', tax: 125625, taxNew: 125625, taxOld: 265689 });
  assert.strictEqual(T.best(1000000, 1000000).regime, 'new');          // 0 vs 112,500+
  assert.strictEqual(T.best(2000000, 400000).regime, 'old');           // old taxable far lower
});

test('garbage in → zero tax, never NaN', () => {
  for (const bad of [NaN, undefined, null, -5, 'x']) {
    assert.strictEqual(T.taxNew(bad), 0);
    assert.strictEqual(T.taxOld(bad), 0);
  }
});

// ── savingsPlan (the tax.html "Tax Savings Tracker") — reference values from an independent Python implementation ──
const SECTIONS = [
  { id: 's80c', maxDeduction: 150000, kind: 'core' }, { id: 's80d', maxDeduction: 25000, kind: 'core' },
  { id: 's80ccd1b', maxDeduction: 50000, kind: 'core' },
  { id: 'hra', maxDeduction: 200000, kind: 'conditional' }, { id: 's24b', maxDeduction: 200000, kind: 'conditional' },
  { id: 's80e', maxDeduction: 999999, kind: 'uncapped' },
];
const row = (r, id) => r.sections.find((x) => x.id === id);

test('savingsPlan ₹8L: nothing to pay in the new regime, so deductions are moot', () => {
  const r = T.savingsPlan(800000, SECTIONS);
  assert.strictEqual(r.newTax, 0);
  assert.strictEqual(r.oldNow, 45032);
  assert.strictEqual(r.oldOpt, 18200);
  assert.strictEqual(r.current, 0);
  assert.strictEqual(r.currentRegime, 'new');
  assert.strictEqual(r.potential, 0);                         // there is nothing left to save
  assert.strictEqual(r.oldPotential, 26832);                  // …but staying in the old regime, maxing deductions would save this
  assert.strictEqual(r.breakEvenDeductions, 250000);          // taxable must fall to ₹5L (87A) for the old regime to match nil tax
});

test('savingsPlan ₹18L: new regime wins even with every core deduction used', () => {
  const r = T.savingsPlan(1800000, SECTIONS);
  assert.deepStrictEqual([r.newTax, r.oldNow, r.oldOpt], [150800, 304200, 280800]);
  assert.strictEqual(r.potential, 0);
  assert.strictEqual(r.newBeatsOldEvenOptimised, true);
  assert.strictEqual(r.oldMinusNew, 130000);
  assert.strictEqual(r.breakEvenDeductions, 642000);          // old regime needs ~₹6.4L of deductions to catch up
  assert.ok(r.breakEvenDeductions > r.coreCapacity, 'core deductions alone (₹2.25L) can never get there');
  assert.strictEqual(r.coreCapacity, 225000);
});

test('savingsPlan rows: 80C headroom reflects the 12% assumption, savings apply in order and add up exactly', () => {
  const r = T.savingsPlan(800000, SECTIONS);                  // 12% of 8L = ₹96,000 already in 80C → ₹54,000 left
  assert.deepStrictEqual([row(r, 's80c').headroom, row(r, 's80c').taxSaved], [54000, 11232]);
  assert.deepStrictEqual([row(r, 's80d').headroom, row(r, 's80d').taxSaved], [25000, 5200]);
  assert.deepStrictEqual([row(r, 's80ccd1b').headroom, row(r, 's80ccd1b').taxSaved], [50000, 10400]);
  const core = r.sections.filter((x) => x.kind === 'core');
  assert.strictEqual(core.reduce((a, x) => a + x.taxSaved, 0), r.oldNow - r.oldOpt);
  const high = T.savingsPlan(1800000, SECTIONS);              // ₹1.5L already used at ₹18L → 80C has no headroom
  assert.deepStrictEqual([row(high, 's80c').headroom, row(high, 's80c').taxSaved], [0, 0]);
  assert.strictEqual(row(high, 's80ccd1b').taxSaved, 15600);
});

test('savingsPlan: HRA / 24(b) are shown as an "if applicable" maximum (not summed); 80E has no number', () => {
  const r = T.savingsPlan(1800000, SECTIONS);
  assert.deepStrictEqual([row(r, 'hra').kind, row(r, 'hra').taxSaved], ['conditional', 62400]);
  assert.strictEqual(row(r, 's24b').taxSaved, 62400);
  assert.deepStrictEqual([row(r, 's80e').kind, row(r, 's80e').headroom, row(r, 's80e').taxSaved], ['uncapped', null, null]);
  assert.strictEqual(r.oldOpt, 280800);                       // conditional rows did not change the total
});

test('savingsPlan: potential is the extra saving over the better regime, never negative', () => {
  // Hypothetical: ₹9L of unused 80C-type room at ₹18L with nothing claimed yet → old regime fully optimised (₹85,800) beats new (₹1,50,800)
  const r = T.savingsPlan(1800000, [{ id: 's80c', maxDeduction: 900000, kind: 'core' }], { alreadyClaimed80c: 0 });
  assert.deepStrictEqual([r.newTax, r.oldNow, r.oldOpt], [150800, 351000, 85800]);
  assert.strictEqual(r.current, 150800);
  assert.strictEqual(r.potential, 65000);
  assert.strictEqual(r.bestRegime, 'old');
  for (const inc of [0, 50000, 300000, 1200000, 2500000, 9000000]) assert.ok(T.savingsPlan(inc, SECTIONS).potential >= 0);
});

test('savingsPlan: low / junk income is safe and finds nothing to save', () => {
  const low = T.savingsPlan(30000, SECTIONS);
  assert.deepStrictEqual([low.current, low.potential, low.breakEvenDeductions], [0, 0, 0]);
  for (const bad of [NaN, undefined, -1, 'x']) assert.strictEqual(T.savingsPlan(bad, SECTIONS).current, 0);
  assert.deepStrictEqual(T.savingsPlan(800000, undefined).sections, []);
});
