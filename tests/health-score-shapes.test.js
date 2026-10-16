'use strict';
// js/finos-health-score.js: the Knowledge pillar read finos_learned_modules with Array.isArray(), but the website
// (js/learn-ai.js) writes it as an OBJECT keyed by module id, so the count was always 0.  Also: any stored value of
// the wrong shape must not break the local score.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'finos-health-score.js'), 'utf8');

function score(store) {
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  const sb = {
    localStorage: ls, console,
    location: { hostname: 'example.com' },
    document: { readyState: 'loading', addEventListener() {}, getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), head: { appendChild() {} }, body: { appendChild() {} } },
    setTimeout: () => 0, requestAnimationFrame: () => 0,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'finos-health-score.js' });
  return sb._finosHealthScore.computeLocal();
}
const knowledge = (r) => r.pillars.find((p) => p.name === 'Knowledge & Engagement');
const j = JSON.stringify;

test('learned modules in the website shape (object keyed by module id) are counted', () => {
  const r = score({ finos_learned_modules: j({ equity: true, mutual_funds: true, debt: { at: 1 }, fno: false, tax: 0 }) });
  assert.match(knowledge(r).headline, /^3 modules/);
});

test('learned modules as a list (older shape) are still counted, duplicates once', () => {
  const r = score({ finos_learned_modules: j(['equity', 'debt', 'debt', 'tax']) });
  assert.match(knowledge(r).headline, /^3 modules/);
});

test('learned modules of a corrupt shape count as none and do not throw', () => {
  for (const v of ['"abc"', '7', 'true', 'null', '{', '[null,false,0]', '{"a":false}', '[]', '{}']) {
    const r = score({ finos_learned_modules: v });
    assert.match(knowledge(r).headline, /^0 modules/, v);
    assert.ok(Number.isFinite(r.total), v);
  }
});

test('every list/object key of the wrong shape leaves a finite score', () => {
  const shapes = ['null', '"abc"', '12', '{"a":1}', '[1,"x",null,{"y":2}]', 'true', '{', '[[]]'];
  const keys = ['finos_goals', 'finos_transactions', 'finos_insurance_policies', 'finos_streak', 'FINOS_CORE_DNA', 'FINOS_SYS_SETTINGS', 'finos_trade_stats', 'finos_learned_modules'];
  for (const k of keys) for (const v of shapes) {
    const r = score({ [k]: v });
    assert.ok(Number.isFinite(r.total), `${k}=${v} gave total ${r.total}`);
    for (const p of r.pillars) assert.ok(Number.isFinite(p.score), `${k}=${v} pillar ${p.name}`);
  }
});

test('unknown income is not replaced by an invented 60,000', () => {
  const r = score({ finos_net_worth: '5000000' });
  const w = r.pillars.find((p) => p.name === 'Wealth Building');
  assert.match(w.headline, /add your income/i);
  assert.equal(w.score, 0);
});
