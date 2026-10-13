// The phone's real-estate maths must equal the website module js/finos-real-estate.js on random inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/realEstate.ts';

const require = createRequire(import.meta.url);
const web = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-real-estate.js'));
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261014);
const pick = (lo: number, hi: number, step = 1) => Math.round((lo + R() * (hi - lo)) / step) * step;

test('buy vs rent equals the website module on 600 random scenarios (incl. 0% loan, no loan, short tenure, tax claim)', () => {
  for (let i = 0; i < 600; i++) {
    const p = {
      price: pick(1000000, 50000000, 100000), downPct: R() < 0.1 ? 100 : pick(10, 60, 5), loanRate: R() < 0.1 ? 0 : pick(6, 14, 0.1), tenure: pick(3, 30, 1),
      appreciation: pick(0, 12, 0.5), maintenance: pick(0, 20000, 500), maintInc: pick(0, 8, 1), rent: pick(5000, 120000, 1000), rentInc: pick(0, 10, 0.5),
      investRet: pick(0, 15, 0.5), years: pick(1, 30, 1), buyCostPct: pick(0, 10, 0.5), sellCostPct: pick(0, 4, 0.5), saleTaxPct: pick(0, 20, 2.5),
      claimTax: R() < 0.5, bracketPct: [0, 5, 10, 15, 20, 30][Math.floor(R() * 6)],
    };
    const w = plain(web.buyVsRent(p)), a = plain(app.buyVsRent(p));
    assert.deepEqual(a, w, JSON.stringify(p));
  }
});

test('defaults, true cost and rental yield equal the website module', () => {
  assert.deepEqual(plain(app.buyVsRent({})), plain(web.buyVsRent({})));
  for (let i = 0; i < 100; i++) {
    const t = { price: pick(1000000, 40000000, 100000), stampPct: pick(3, 8, 0.1), regPct: 1, gstPct: [0, 5, 12][Math.floor(R() * 3)], loan: pick(0, 30000000, 100000), procPct: pick(0, 2, 0.1), maintYear: pick(0, 200000, 1000), furnish: pick(0, 3000000, 50000), years: 20 };
    assert.deepEqual(plain(app.trueCost(t)), plain(web.trueCost(t)));
    const y = { price: pick(500000, 30000000, 100000), rent: pick(0, 200000, 500), costsYear: pick(0, 300000, 1000), emi: pick(0, 100000, 1000), appreciation: pick(0, 12, 0.5), years: pick(1, 30, 1), equity: pick(4, 18, 0.5) };
    assert.deepEqual(plain(app.rentalYield(y)), plain(web.rentalYield(y)));
  }
  assert.deepEqual(app.STAMP_STATES, web.STAMP_STATES);
});

test('bad input stays finite', () => {
  const r = app.buyVsRent({ price: NaN as any, rent: 'x' as any });
  for (const k of ['emi', 'buyNetWorth', 'rentCorpus'] as const) assert.ok(Number.isFinite(r[k]), k);
});
