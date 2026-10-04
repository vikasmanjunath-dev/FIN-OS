// Checks lib/subscriptions.ts against the website's real js/finos-subscriptions.js on random inputs
// (valid and invalid), so the two can never drift apart silently.
// Run: npm test   (Node 22.18+/24 runs .ts directly; imports therefore carry the .ts extension)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mobile from '../lib/subscriptions.ts';

const web = createRequire(import.meta.url)('../../js/finos-subscriptions.js');

// Small seeded PRNG so a failure reproduces
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261004);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(R() * (hi - lo + 1));

const cycles = ['weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly'];
const cats = ['ott', 'music', 'software', 'cloud', 'news', 'fitness', 'learning', 'telecom', 'shopping', 'gaming', 'other', 'bogus'];
const statuses = ['active', 'trial', 'paused', 'cancelled', 'weird'];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const randDate = () => iso(int(2024, 2028), int(1, 12), int(1, 31)); // sometimes invalid (31 Feb) on purpose

function randRaw(i: number): any {
  const bad = R() < 0.12;
  return {
    id: `id${i}`,
    name: bad && R() < 0.3 ? '   ' : pick(['Netflix', 'Spotify', 'iCloud', 'Hotstar', 'Gym', 'Zee5', 'Prime', 'Kindle']) + ' ' + i,
    category: pick(cats),
    amount: bad && R() < 0.4 ? pick([0, -5, 'abc', 1e8]) : Math.round(R() * 200000) / 100,
    cycle: bad && R() < 0.3 ? 'fortnightly' : pick(cycles),
    nextDate: bad && R() < 0.3 ? '2026-13-45' : randDate(),
    split: pick([1, 1, 1, 2, 4, 0, 99, '3', null]),
    status: pick(statuses),
    usefulness: pick([null, '', 1, 2, 3, 4, 5, 9, 0, '2']),
    pay: pick(['upi', 'card', 'netbanking', 'other', 'cash', undefined]),
    note: pick(['', 'family plan', '  x  ', 'n'.repeat(200)]),
  };
}

const raws = Array.from({ length: 600 }, (_, i) => randRaw(i));
const todays = ['2026-10-04', '2026-02-28', '2028-02-29', '2026-12-31', '2025-01-01', '2027-03-31'];

test('normalize matches the website for 600 random records', () => {
  for (const r of raws) assert.deepEqual(mobile.normalize(r), web.normalize(r), JSON.stringify(r));
});

test('costs, next renewal and occurrences match', () => {
  const subs = mobile.normalizeAll(raws);
  assert.ok(subs.length > 300, 'enough valid records to be meaningful');
  for (const s of subs) {
    assert.equal(mobile.annualCost(s), web.annualCost(s));
    assert.equal(mobile.monthlyCost(s), web.monthlyCost(s));
    for (const t of todays) {
      assert.equal(mobile.nextRenewal(s, t), web.nextRenewal(s, t), `${s.id} ${s.cycle} ${s.nextDate} @${t}`);
      assert.deepEqual(mobile.occurrences(s, t, '2029-12-31', 6), web.occurrences(s, t, '2029-12-31', 6), `${s.id} occ @${t}`);
    }
  }
});

test('summarize matches the website for random portfolios', () => {
  for (let n = 0; n < 150; n++) {
    const list = Array.from({ length: int(0, 14) }, () => randRaw(int(0, 999)));
    const income = pick([0, 30000, 85000]);
    const t = pick(todays);
    assert.deepEqual(mobile.summarize(list, t, { income }), web.summarize(list, t, { income }), `portfolio ${n}`);
  }
});

test('known edge cases', () => {
  const base = { id: 'a', name: 'Plan', category: 'ott', amount: 100, cycle: 'monthly', status: 'active' };
  // 31 Jan anchor: Feb clamps to the last day, March returns to the 31st (counted from the anchor, not the previous renewal)
  const s = mobile.normalize({ ...base, nextDate: '2026-01-31' })!;
  assert.deepEqual(mobile.occurrences(s, '2026-02-01', '2026-04-30', 5), ['2026-02-28', '2026-03-31', '2026-04-30']);
  // paused / cancelled never renew
  assert.equal(mobile.nextRenewal({ ...s, status: 'paused' }, '2026-02-01'), null);
  // a family plan costs your share only
  const fam = mobile.normalize({ ...base, amount: 600, split: 4, nextDate: '2026-03-01' })!;
  assert.equal(mobile.annualCost(fam), 1800);
  // garbage in → null, not a crash
  assert.equal(mobile.normalize(null), null);
  assert.equal(mobile.normalize({ ...base, nextDate: '2026-02-30' }), null);
});
