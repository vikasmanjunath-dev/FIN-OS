'use strict';
// js/finos-life-goals.js — the arithmetic behind html/life-goals-planner.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/finos-life-goals.js');

const goal = (name, amount, years, inflation = 0.06) => ({ name, amount, years, inflation });
const base = { age: 30, income: 100000, surplus: 40000, retireAge: 58, returnRate: 0.12 };

test('sipFV matches the annuity-due formula (hand-worked: ₹10,000 x 12 months at 12% = ₹1,28,093)', () => {
  assert.ok(Math.abs(L.sipFV(10000, 12, 0.12) - 128093.28) < 0.5);
  assert.equal(L.sipFV(1000, 24, 0), 24000);                    // zero return: just the deposits
});

test('findSIP is the smallest ₹500 step that reaches the target', () => {
  for (const [target, years, rate] of [[1e6, 5, 0.12], [2.5e7, 20, 0.1], [3e5, 2, 0.08], [8e7, 7, 0.12]]) {
    const sip = L.findSIP(target, years, rate);
    assert.equal(sip % 500, 0);
    assert.ok(L.sipFV(sip, years * 12, rate) >= target, 'reaches the target');
    assert.ok(L.sipFV(sip - 500, years * 12, rate) < target, 'one step lower would not');
  }
  assert.equal(L.findSIP(0, 5, 0.12), 0);
  assert.equal(L.findSIP(1e6, 0, 0.12), 0);
});

test('emergency fund comes first: savings below 6 months of spending leave nothing for goals', () => {
  const r = L.plan({ ...base, savings: 300000, goals: [goal('Home', 5000000, 10)] });
  assert.equal(r.efTarget, 360000);            // spending 60,000 x 6
  assert.equal(r.efGap, 60000);
  assert.equal(r.pool, 0);
  assert.equal(r.processed[0].fromSavings, 0);
});

test('savings above the emergency fund are shared out once, nearest goal first (not credited to every goal)', () => {
  // pool = 760,000 - 360,000 = 400,000. Each goal's useful amount is its inflated target discounted at the return.
  const goals = [goal('Far', 6000000, 15), goal('Near', 1000000, 3), goal('Mid', 3000000, 8)];
  const r = L.plan({ ...base, savings: 760000, goals });
  assert.equal(r.pool, 400000);
  const used = r.processed.reduce((s, g) => s + g.fromSavings, 0);
  assert.ok(used <= 400000 + 1e-6, `used ${used} of a 400,000 pool`);
  assert.deepEqual(r.processed.map(g => g.name), ['Far', 'Near', 'Mid']);       // original order kept
  const near = r.processed[1];
  const usefulNear = near.inflatedTarget / Math.pow(1.12, 3);
  assert.ok(Math.abs(near.fromSavings - Math.min(400000, usefulNear)) < 1e-6);   // the nearest goal is served first
  assert.ok(near.sipNeeded <= 500 || near.netTarget < near.inflatedTarget);
});

test('a goal that savings can fully fund needs no SIP and leaves the rest of the pool', () => {
  const r = L.plan({ ...base, savings: 360000 + 5000000, goals: [goal('Small', 100000, 2, 0)] });
  const g = r.processed[0];
  assert.equal(g.netTarget, 0);
  assert.equal(g.sipNeeded, 0);
  assert.ok(r.poolLeft > 4000000);
  assert.equal(r.feasPct, 100);                 // nothing needed: fully covered
});

test('the old behaviour would have understated the SIP: three goals, savings used once', () => {
  const goals = [goal('A', 2000000, 5), goal('B', 2000000, 5), goal('C', 2000000, 5)];
  const withSavings = L.plan({ ...base, savings: 360000 + 900000, goals });
  const noSavings = L.plan({ ...base, savings: 0, goals });
  const credited = withSavings.processed.reduce((s, g) => s + g.fromSavings, 0);
  assert.ok(Math.abs(credited - 900000) < 1e-6, 'the 9 lakh above the fund is credited once in total, not 27 lakh');
  assert.ok(withSavings.totalSIPNeeded < noSavings.totalSIPNeeded);
  assert.ok(withSavings.totalSIPNeeded > 0);
});

test('feasibility: surplus left after the emergency fund against the SIP needed, capped at 999', () => {
  const r = L.plan({ ...base, savings: 0, goals: [goal('Home', 8000000, 7)] });
  assert.equal(r.efAlloc, Math.min(40000 * 0.5, 360000 / 6));      // 20,000
  assert.equal(r.sipAvail, 20000);
  assert.equal(r.feasPct, Math.round((20000 / r.totalSIPNeeded) * 100));
  const tiny = L.plan({ ...base, savings: 360000, goals: [goal('Trip', 12000, 1, 0)] });
  assert.ok(tiny.feasPct <= 999);
  assert.equal(L.plan({ ...base, savings: 0, goals: [] }).feasPct, 100);
});

test('goal order and fields survive; inflation compounds on the goal amount', () => {
  const r = L.plan({ ...base, savings: 0, goals: [goal('X', 1000000, 10, 0.07)] });
  assert.ok(Math.abs(r.processed[0].inflatedTarget - 1000000 * Math.pow(1.07, 10)) < 1e-6);
});

test('profile validation messages', () => {
  const ok = { age: 30, income: 100000, surplus: 30000, retireAge: 58 };
  assert.equal(L.validateProfile(ok), null);
  assert.match(L.validateProfile({ ...ok, age: 0 }), /age/);
  assert.match(L.validateProfile({ ...ok, age: 90 }), /age/);
  assert.match(L.validateProfile({ ...ok, income: 500 }), /income/);
  assert.match(L.validateProfile({ ...ok, surplus: 0 }), /invest/);
  assert.match(L.validateProfile({ ...ok, surplus: 100000 }), /greater than or equal/);
  assert.match(L.validateProfile({ ...ok, retireAge: 30 }), /Retirement age/);
});
