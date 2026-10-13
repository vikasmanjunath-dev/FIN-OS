import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xirr, portfolioXirr, parseBoughtOn } from '../lib/xirr.ts';

const close = (a: number | null, b: number, tol = 1e-6) => { assert.ok(a !== null && Math.abs(a - b) < tol, `${a} vs ${b}`); };

test('a single year gives the simple return, using days / 365', () => {
  close(xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1100 }]), 0.1);                 // exactly 365 days
  close(xirr([{ date: '2023-10-14', amount: -1000 }, { date: '2025-10-14', amount: 1210 }]), Math.pow(1.21, 365 / 731) - 1);
});

test('two deposits and a value: the rate makes the present values cancel (checked independently)', () => {
  const flows = [{ date: '2024-01-01', amount: -10000 }, { date: '2024-07-01', amount: -10000 }, { date: '2025-01-01', amount: 22000 }];
  const r = xirr(flows)!;
  const t0 = Date.UTC(2024, 0, 1);
  const npv = flows.reduce((s, f) => { const [y, m, d] = f.date.split('-').map(Number); return s + f.amount / Math.pow(1 + r, (Date.UTC(y, m - 1, d) - t0) / 86400000 / 365); }, 0);
  assert.ok(Math.abs(npv) < 1e-4, `npv ${npv}`);
  assert.ok(r > 0.1 && r < 0.3, String(r));
});

test('a loss gives a negative rate; no sign change or a single day gives null', () => {
  close(xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 800 }]), -0.2);
  assert.equal(xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: -5 }]), null);
  assert.equal(xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2025-01-01', amount: 1100 }]), null);
  assert.equal(xirr([]), null);
  assert.equal(xirr([{ date: 'soon', amount: -1 }, { date: '2026-01-01', amount: 2 }]), null);
});

test('portfolio: only dated holdings count; undated ones are left out, not assumed', () => {
  const today = '2026-10-14';
  const r = portfolioXirr([
    { key: 'Stock:INFY', invested: 100000, current: 121000, boughtOn: '2024-10-14' },
    { key: 'MF:1', invested: 50000, current: 52000, boughtOn: '' },
    { key: 'Stock:TCS', invested: 0, current: 10, boughtOn: '2025-01-01' },
    { key: 'Stock:X', invested: 1000, current: 1100, boughtOn: '2027-01-01' },
  ], today);
  assert.equal(r.counted, 1);
  close(r.perHolding['Stock:INFY'], Math.pow(1.21, 365 / 730) - 1);
  assert.equal(r.perHolding['MF:1'], null);
  assert.equal(r.perHolding['Stock:X'], null);
  close(r.overall, r.perHolding['Stock:INFY']!);
  assert.equal(portfolioXirr([], today).overall, null);
});

test('overall equals the combined cash-flow rate across holdings bought on different dates', () => {
  const today = '2026-10-14';
  const r = portfolioXirr([
    { key: 'a', invested: 100000, current: 150000, boughtOn: '2021-10-14' },
    { key: 'b', invested: 100000, current: 110000, boughtOn: '2025-10-14' },
  ], today);
  const direct = xirr([{ date: '2021-10-14', amount: -100000 }, { date: '2025-10-14', amount: -100000 }, { date: today, amount: 260000 }])!;
  close(r.overall, direct);
  assert.ok(r.perHolding.a! < r.perHolding.b! || r.perHolding.a! > 0);
});

test('typed dates: real calendar days between 1990 and today', () => {
  const today = '2026-10-14';
  assert.equal(parseBoughtOn('2024-02-29', today), '2024-02-29');
  assert.equal(parseBoughtOn('2023-02-29', today), null);
  assert.equal(parseBoughtOn('2026-10-15', today), null);
  assert.equal(parseBoughtOn('1980-01-01', today), null);
  assert.equal(parseBoughtOn('14/10/2024', today), null);
});
