'use strict';
// Government-scheme interest rates appear in several files (trackers, planner, tables, calculators).
// This is the one table they must all agree with. When a rate is revised, change it HERE and in every file the test names:
// the test fails until they match. Rates are as announced for the quarter / year in `asOf`; they are not live data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const RATES = { asOf: 'Q3 FY 2026-27 (small savings); FY 2025-26 (EPF)', PPF: 7.1, SSY: 8.2, NSC: 7.7, SCSS: 8.2, EPF: 8.25, POST_OFFICE_MIS: 7.4 };

test('PPF tracker instruments use the canonical rates', () => {
  const src = read('js/finos-ppf-tracker.js');
  for (const k of ['PPF', 'SSY', 'NSC', 'SCSS']) {
    const m = src.match(new RegExp(`\\b${k}:\\s*\\{[^}]*rate:\\s*([0-9.]+)`));
    assert.ok(m, k + ' not found');
    assert.equal(Number(m[1]), RATES[k], 'finos-ppf-tracker.js ' + k);
  }
});

test('Fixed-income tracker instruments and rate table use the canonical rates', () => {
  const src = read('js/finos-fd-tracker.js');
  for (const [k, id] of [['PPF', 'ppf'], ['SSY', 'sukanya'], ['NSC', 'nsc'], ['SCSS', 'scss']]) {
    const m = src.match(new RegExp(`\\b${id}:\\s*\\{[^}]*rate:\\s*([0-9.]+)`));
    assert.ok(m, id + ' not found');
    assert.equal(Number(m[1]), RATES[k], 'finos-fd-tracker.js ' + id);
  }
  const html = read('html/fd-tracker.html');
  const row = (label) => Number((html.match(new RegExp(`scheme:'${label}[^']*',\\s*rate:\\s*([0-9.]+)`)) || [])[1]);
  assert.equal(row('PPF'), RATES.PPF);
  assert.equal(row('NSC'), RATES.NSC);
  assert.equal(row('SCSS'), RATES.SCSS);
  assert.equal(row('Sukanya'), RATES.SSY);
  assert.equal(row('Post Office MIS'), RATES.POST_OFFICE_MIS);
});

test('EPF tracker and retirement planner use the canonical EPF and PPF rates', () => {
  const epf = read('js/finos-epf-tracker.js');
  assert.equal(Number(epf.match(/EPF_INTEREST\s*=\s*([0-9.]+)/)[1]), RATES.EPF);
  assert.ok(epf.includes("{ label: 'PPF', rate: '7.10%'"), 'EPF comparison table PPF rate');
  const plan = read('js/finos-retirement-planner.js');
  assert.ok(plan.includes('_fv(gs(\'finos_epf_value\'), ' + RATES.EPF / 100));
  assert.ok(plan.includes("_fv(gs('finos_ppf_value'), " + RATES.PPF / 100));
});

test('calculators use the canonical SSY, SCSS and Post Office MIS defaults', () => {
  const val = (f) => Number(read(f).match(/type="number" value="([0-9.]+)" id="rateNum"/)[1]);
  assert.equal(val('calculators/banking & fixed income/ssy.html'), RATES.SSY);
  assert.equal(val('calculators/banking & fixed income/scss.html'), RATES.SCSS);
  assert.equal(val('calculators/banking & fixed income/postoffice.html'), RATES.POST_OFFICE_MIS);
});

test('windfall page quotes the canonical PPF rate', () => {
  assert.ok(read('js/finos-windfall.js').includes('PPF (' + RATES.PPF + '%'));
});
