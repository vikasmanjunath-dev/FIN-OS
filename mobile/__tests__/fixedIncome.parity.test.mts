// The phone's fixed-income maths must equal the website's js/finos-fd-tracker.js for the same entries on the same day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/fixedIncome.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, '../../js/finos-fd-tracker.js'), 'utf8');

/** Run the website's real file with a frozen clock and read its calculators back through the public _calcEntry. */
function loadWeb(nowMs: number, portfolio: unknown[] = []) {
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...a: any[]) { if (a.length === 0) super(nowMs); else super(...(a as [any])); }
    static now() { return nowMs; }
  }
  const store: Record<string, string> = { finos_fd_portfolio: JSON.stringify(portfolio) };
  const win: any = {};
  const sandbox: any = {
    window: win, Date: FrozenDate, Math, JSON, Number, parseFloat, parseInt, console,
    localStorage: { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = String(v); } },
    document: { addEventListener() {}, getElementById() { return null; } },
  };
  win.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return win.FinosFD;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261012);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const NOW = new Date(2026, 9, 11, 8, 0, 0).getTime();   // local 08:00: the reference instant must sit at the same local time in every time zone
const iso = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };   // the local calendar day, as the app reads dates

function randomEntry(i: number): app.FDEntry {
  const type = pick(['fd', 'rd', 'ppf', 'nsc', 'scss', 'sukanya', 'bond', 'post_td'] as const);
  const start = iso(NOW - Math.floor(R() * 16 * 365) * 86400000);
  const base: app.FDEntry = { id: 'e' + i, type, startDate: start, rate: R() < 0.2 ? undefined : Math.round((4 + R() * 6) * 10) / 10 };
  const amt = Math.round(1000 + R() * 2e6);
  if (type === 'rd') { base.monthlyAmount = Math.round(amt / 100); base.termMonths = pick([6, 12, 24, 36, 60, 120]); }
  else if (type === 'ppf') base.annualAmount = Math.min(150000, amt);
  else { base.principal = amt; if (!['nsc', 'scss', 'sukanya'].includes(type) || R() < 0.3) base.termMonths = pick([6, 12, 18, 36, 60, 84]); }
  return base;
}

test('calcEntry matches the website on 1,500 random entries across every instrument', () => {
  const web = loadWeb(NOW);
  const now = new Date(NOW);
  for (let i = 0; i < 1500; i++) {
    const e = randomEntry(i);
    const a = app.calcEntry(e, now), w = web._calcEntry(e);
    for (const k of ['currentValue', 'maturityValue', 'interestEarned', 'totalInvested', 'incomePaid', 'quarterlyIncome'] as const) {
      assert.equal((a as any)[k], (w as any)[k], `${e.type} ${k} ${JSON.stringify(e)}`);
    }
    assert.equal(a.maturityDate.getTime(), new Date(w.maturityDate).getTime(), `${e.type} maturity ${JSON.stringify(e)}`);
  }
});

test('totals match the website on 200 random portfolios', () => {
  const now = new Date(NOW);
  for (let n = 0; n < 200; n++) {
    const list = Array.from({ length: 1 + Math.floor(R() * 6) }, (_, i) => randomEntry(n * 10 + i));
    const web = loadWeb(NOW, list);
    assert.deepEqual(app.totals(list, now), { ...web.getTotals() }, `portfolio ${n}`);      // copied: the website's object comes from another realm
  }
});

test('an RD at 0% is the deposits made (the website divided 0 by 0 there before this guard)', () => {
  const e: app.FDEntry = { id: 'r', type: 'rd', startDate: iso(NOW - 365 * 86400000), rate: 0, monthlyAmount: 1000, termMonths: 24 };
  const r = app.calcEntry(e, new Date(NOW));
  assert.ok(Number.isFinite(r.currentValue) && Number.isFinite(r.maturityValue));
  assert.equal(r.maturityValue, 1000 * 12 * 2);
  assert.ok(Math.abs(r.interestEarned) < 10, `at 0% there is no interest, only the day-count rounding (${r.interestEarned})`);
  const web = loadWeb(NOW);
  assert.ok(Number.isFinite(web._calcEntry(e).currentValue), 'the website guards it too');
});

test('buildEntry applies the same checks and shapes as the website save', () => {
  const now = new Date(NOW);
  const f = { label: '', bank: ' HDFC ', amount: 100000, rate: 7.2, startDate: '2026-04-01', termMonths: 12, nominee: '' };
  const fd = app.buildEntry({ ...f, type: 'fd' }, now);
  assert.ok(fd.ok && fd.entry.principal === 100000 && fd.entry.termMonths === 12 && fd.entry.bank === 'HDFC' && fd.entry.label === 'Fixed Deposit');
  const rd = app.buildEntry({ ...f, type: 'rd' }, now);
  assert.ok(rd.ok && rd.entry.monthlyAmount === 100000 && !('principal' in rd.entry));
  const ppf = app.buildEntry({ ...f, type: 'ppf', rate: 0 }, now);
  assert.ok(ppf.ok && ppf.entry.annualAmount === 100000 && ppf.entry.rate === 7.1 && ppf.entry.termMonths === undefined);
  assert.equal(app.buildEntry({ ...f, type: 'fd', amount: 50 }, now).ok, false);
  assert.equal(app.buildEntry({ ...f, type: 'fd', rate: 0 }, now).ok, false);       // an FD has no default rate
  assert.equal(app.buildEntry({ ...f, type: 'fd', termMonths: 0 }, now).ok, false);
  assert.equal(app.buildEntry({ ...f, type: 'fd', startDate: '01/04/2026' }, now).ok, false);
  assert.equal(app.buildEntry({ ...f, type: 'nsc', rate: 0, termMonths: 0 }, now).ok, true);   // NSC needs neither
});

test('upcomingMaturities includes already-matured entries and orders soonest first', () => {
  const now = new Date(NOW);
  const list: app.FDEntry[] = [
    { id: 'a', type: 'fd', startDate: '2026-01-01', rate: 7, principal: 1000, termMonths: 24 },
    { id: 'b', type: 'fd', startDate: '2025-01-01', rate: 7, principal: 1000, termMonths: 6 },        // matured last year
    { id: 'c', type: 'fd', startDate: '2026-09-01', rate: 7, principal: 1000, termMonths: 60 },       // beyond 24 months
  ];
  assert.deepEqual(app.upcomingMaturities(list, now, 24).map(x => x.entry.id), ['b', 'a']);
});
