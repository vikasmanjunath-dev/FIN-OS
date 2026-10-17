// The phone's trade-journal maths against the website's own TradeJournal/app.js, run in a stub browser (the same approach as
// helpers/webCalc.mts). Where the website's number is right, the phone must give the same number on random journals. Where the website is
// wrong, the test says so with `todo` (it is reported, and does not fail the run), and a separate test pins the phone's correct answer.
// Defects found in the website are listed in docs/agent-notes/trade-journal.md for its owner; nothing under TradeJournal/ is edited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tj from '../lib/tradeJournal.ts';
import { toCsv, parseJournalFile } from '../lib/tradeJournalImport.ts';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../TradeJournal/app.js');
const SRC = fs.readFileSync(WEB, 'utf8');

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Loads the website's app.js against a stub page. `now` fixes the page's clock (local time) when given. */
function loadWeb(trades: any[], tags: any[] = [], now?: string) {
  const els: Record<string, any> = {};
  const charts: Record<string, any> = {};
  const store: Record<string, string> = { tradebook_trades: JSON.stringify(trades), tradebook_tags: JSON.stringify(tags) };
  const blobs: string[] = [];
  const mk = (id: string): any => {
    if (id === 'particle-canvas') return null;
    return (els[id] ??= {
      id, value: '', textContent: '', innerHTML: '', style: {}, className: '', dataset: {},
      classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, querySelectorAll: () => [], closest: () => null,
      getContext: () => ({ __id: id, createLinearGradient: () => ({ addColorStop() {} }) }),
    });
  };
  const RealDate = Date;
  const FIXED = now ? new RealDate(now).getTime() : null;
  class FakeDate extends RealDate {
    constructor(...a: any[]) { if (a.length === 0 && FIXED !== null) super(FIXED); else super(...(a as [any])); }
    static now() { return FIXED !== null ? FIXED : RealDate.now(); }
  }
  const sandbox: any = {
    document: { getElementById: mk, addEventListener() {}, querySelectorAll: () => [], createElement: () => ({ ...mk('__a'), click() {} }), documentElement: { style: { setProperty() {} } }, body: mk('__body') },
    localStorage: { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = String(v); }, removeItem: (k: string) => { delete store[k]; } },
    console: { log() {}, warn() {}, error() {} }, setTimeout: (f: any) => { try { f(); } catch { /* the page's own chrome */ } return 0; }, clearTimeout() {}, requestAnimationFrame: () => 0,
    Chart: function (ctx: any, cfg: any) { charts[ctx.__id] = cfg; return { destroy() {}, data: cfg.data }; },
    navigator: {}, location: {}, addEventListener() {}, innerWidth: 800, innerHeight: 600, confirm: () => true, navigateTo() {},
    Blob: function (parts: string[]) { blobs.push(parts.join('')); }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Date: FIXED !== null ? FakeDate : RealDate, Math, JSON, parseFloat, parseInt, Number, Object, Array, String, Set, Map, RegExp, isNaN, Intl,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const run = (code: string) => vm.runInContext(code, sandbox);
  const text = (id: string) => String(els[id]?.textContent ?? '');
  return { els, charts, store, blobs, run, text, sandbox, set: (id: string, v: string) => { mk(id).value = v; } };
}

const num = (s: string) => Number(String(s).replace(/[^0-9.\-]/g, ''));
const EMO = ['Calm', 'Confident', 'Anxious', 'Greedy', 'FOMO', 'Disciplined', 'Scared', 'Revenge'];
const DISC = ['followed', 'partial', 'broken'];
const SETUPS = ['ORB', 'VWAP Bounce', 'Scalp', 'Trend Follow', ''];

/** A trade the way the website saves it (net = gross − charges, charges in seven boxes). */
function webTrade(R: () => number, i: number, dates: string[], tagIds: string[], allowBreakeven = true): any {
  const charges = { brokerage: Math.round(R() * 6000) / 100, stt: Math.round(R() * 4000) / 100, exchange: Math.round(R() * 800) / 100, sebi: Math.round(R() * 100) / 100, gst: Math.round(R() * 1200) / 100, slippage: Math.round(R() * 500) / 100, other: Math.round(R() * 300) / 100 };
  const tax = Object.values(charges).reduce((s, x) => s + x, 0);
  let gross = Math.round((R() - 0.46) * 900000) / 100;
  if (allowBreakeven && R() < 0.08) gross = tax;                 // net exactly 0
  const net = gross - tax;
  const d = dates[Math.floor(R() * dates.length)];
  return {
    id: 't' + i, date: d, symbol: ['NIFTY', 'RELIANCE', 'TCS', 'SBIN'][i % 4], direction: R() < 0.5 ? 'Long' : 'Short',
    entry: 100, exit: 100, qty: 10, lotSize: 1, gross, ...charges, tax, net, strategy: SETUPS[Math.floor(R() * SETUPS.length)],
    emotion: R() < 0.7 ? EMO[Math.floor(R() * EMO.length)] : '', discipline: R() < 0.7 ? DISC[Math.floor(R() * 3)] : '',
    tags: tagIds.filter(() => R() < 0.3),
  };
}
const monthDates = (() => { const out: string[] = []; for (let m = 0; m < 16; m++) for (const day of [3, 9, 14, 21, 27]) { const y = 2025 + Math.floor((m + 5) / 12), mo = ((m + 5) % 12) + 1; out.push(`${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`); } return out; })();
const TAGS = [{ id: 'g1', name: 'Gap up', color: '#00ff88', type: 'setup' }, { id: 'g2', name: 'Expiry', color: '#00d4ff', type: 'market_regime' }, { id: 'g3', name: 'News', color: '#ff4d6d', type: 'condition' }];

const asPhone = (web: any[]) => web.map(w => tj.readTrade(w)!).filter(Boolean);

// ── the maths the website gets right ─────────────────────────────────────────────────────────────────────────────────────────────
test('dashboard totals match the website on 150 random journals (net P&L, win rate, profit factor, max drawdown, average win and loss, payoff)', () => {
  const R = rng(20261016);
  for (let n = 0; n < 150; n++) {
    const size = 1 + Math.floor(R() * 45);
    const web = Array.from({ length: size }, (_, i) => webTrade(R, i, monthDates, []));
    const w = loadWeb(web);
    w.run('updateDashboard()');
    const p = tj.summarize(asPhone(web));
    assert.ok(Math.abs(Math.abs(num(w.text('stat-netpnl'))) - Math.abs(p.net)) < 0.011, `journal ${n}: net ${w.text('stat-netpnl')} vs ${p.net}`);
    assert.equal(w.text('stat-winrate'), ((p.winRate ?? 0) * 100).toFixed(1) + '%', `journal ${n} win rate`);
    const pf = w.text('stat-pf');
    if (pf === '∞') assert.ok(p.profitFactor === null && p.grossWin > 0 && p.grossLoss === 0, `journal ${n}: web says infinite`);
    else assert.equal(pf, (p.profitFactor ?? 0).toFixed(2), `journal ${n} profit factor`);
    assert.ok(Math.abs(num(w.text('stat-dd')) - p.maxDrawdown) < 0.011, `journal ${n}: drawdown ${w.text('stat-dd')} vs ${p.maxDrawdown}`);
    assert.ok(Math.abs(num(w.text('stat-avgwin')) - (p.avgWin ?? 0)) < 0.011, `journal ${n} avg win`);
    assert.ok(Math.abs(num(w.text('stat-avgloss')) - (p.avgLoss ?? 0)) < 0.011, `journal ${n} avg loss`);
    assert.equal(w.text('stat-rr'), (p.payoff ?? 0).toFixed(1) + ':1', `journal ${n} payoff`);
  }
});

test('P&L of one trade from its prices and charges matches the website form (long and short, lots, seven charges)', () => {
  const R = rng(77);
  const w = loadWeb([]);
  for (let i = 0; i < 400; i++) {
    const dir = R() < 0.5 ? 'Long' : 'Short';
    const entry = Math.round((10 + R() * 25000) * 20) / 20, exit = Math.round((1 + R() * 25000) * 20) / 20;
    const qty = 1 + Math.floor(R() * 200), lot = R() < 0.5 ? 1 + Math.floor(R() * 75) : 0;
    const ch = Object.fromEntries(['brokerage', 'stt', 'exchange', 'sebi', 'gst', 'slippage', 'other'].map(k => [k, R() < 0.6 ? Math.round(R() * 9000) / 100 : 0]));
    w.run(`setDir('${dir}')`);
    w.set('f-entry', String(entry)); w.set('f-exit', String(exit)); w.set('f-qty', String(qty)); w.set('f-lotsize', lot ? String(lot) : '');
    w.set('f-sl', ''); w.set('f-target', '');
    w.set('f-brokerage', ch.brokerage ? String(ch.brokerage) : ''); w.set('f-stt', ch.stt ? String(ch.stt) : ''); w.set('f-exchange-charges', ch.exchange ? String(ch.exchange) : '');
    w.set('f-sebi', ch.sebi ? String(ch.sebi) : ''); w.set('f-gst', ch.gst ? String(ch.gst) : ''); w.set('f-slippage', ch.slippage ? String(ch.slippage) : ''); w.set('f-other-charges', ch.other ? String(ch.other) : '');
    w.run('updateFormCalc()');
    const t = tj.readTrade({ id: 'x', date: '2026-10-01', symbol: 'X', direction: dir, entry, exit, qty, lotSize: lot || undefined, ...Object.fromEntries(Object.entries(ch).filter(([, v]) => v).map(([k, v]) => [k, v])) })!;
    assert.equal(tj.grossOf(t), num(w.els['f-gross'].value), `gross ${i}: ${dir} ${entry}->${exit} x${qty} lot ${lot}`);
    assert.ok(Math.abs((tj.netOf(t) as number) - num(w.els['f-net'].value)) < 0.006, `net ${i}`);
    assert.ok(Math.abs(tj.chargesOf(t) - num(w.els['f-tax'].value)) < 0.006, `charges ${i}`);
  }
});

test('profit by weekday, by month and by emotion match the website charts', () => {
  const R = rng(5150);
  for (let n = 0; n < 40; n++) {
    const web = Array.from({ length: 5 + Math.floor(R() * 60) }, (_, i) => webTrade(R, i, monthDates, []));
    const w = loadWeb(web);
    w.run('renderDayChart(getTrades()); renderMonthChart(getTrades()); renderEmoChart(getTrades())');
    const phone = tj.rate(asPhone(web)).rated;
    // weekday: the website draws all seven days (zeros included)
    const day = w.charts.dayChart.data.datasets[0].data as number[];
    const mine = new Map(tj.byWeekday(phone).map(g => [+g.key, g.net]));
    day.forEach((v, d) => assert.ok(Math.abs(v - (mine.get(d) ?? 0)) < 0.011, `weekday ${d}: ${v} vs ${mine.get(d) ?? 0}`));
    // month: the website keeps the last 12 months that have trades
    const mCfg = w.charts.monthChart.data;
    const months = tj.byMonth(phone).slice(-12);
    assert.equal(mCfg.datasets[0].data.length, months.length);
    months.forEach((g, i) => assert.ok(Math.abs(mCfg.datasets[0].data[i] - g.net) < 0.011, `month ${g.key}`));
    // emotion: pnl and the trade count in the tooltip
    const eCfg = w.charts.emoChart;
    const emo = new Map(tj.tableBy(phone, r => r.t.emotion).map(e => [e.value, e.cohort]));
    eCfg.data.labels.forEach((label: string, i: number) => {
      const c = emo.get(label)!;
      assert.ok(Math.abs(eCfg.data.datasets[0].data[i] - c.net) < 0.011, `emotion ${label}`);
      assert.match(eCfg.options.plugins.tooltip.callbacks.label({ dataIndex: i, parsed: { y: 0 } }), new RegExp(`\\(${c.count} trades\\)`));
    });
    assert.equal(eCfg.data.labels.length, emo.size);
  }
});

test('profit and win rate per tag, and by discipline, match the website', () => {
  const R = rng(31337);
  for (let n = 0; n < 40; n++) {
    const web = Array.from({ length: 6 + Math.floor(R() * 50) }, (_, i) => webTrade(R, i, monthDates, TAGS.map(t => t.id)));
    const w = loadWeb(web, TAGS);
    w.run('renderTagPerformance(); renderDisciplineMetrics()');
    const phone = tj.rate(asPhone(web)).rated;
    const groups = new Map(tj.byTag(phone, TAGS as tj.Tag[]).map(g => [g.label, g]));
    const html = w.els['tag-perf-grid'].innerHTML as string;
    for (const tag of TAGS) {
      const m = new RegExp(`${tag.name}</span>[\\s\\S]*?font-size:18px[^>]*>([^<]*)</div>\\s*<div[^>]*>(\\d+) trades · (\\d+)% WR`).exec(html);
      assert.ok(m, `tag ${tag.name} card`);
      const g = groups.get(tag.name);
      assert.equal(Number(m![2]), g?.count ?? 0);
      assert.ok(Math.abs(num(m![1]) - (g?.net ?? 0)) < 0.011, `tag ${tag.name} P&L ${m![1]} vs ${g?.net}`);
      if (g) assert.equal(Number(m![3]), Number((g.winRate * 100).toFixed(0)), `tag ${tag.name} win rate`);
    }
    const disc = w.charts.discCompChart.data.datasets[0].data as number[];
    const by = new Map(tj.tableBy(phone, r => r.t.discipline).map(e => [e.value, e.cohort.net]));
    assert.ok(Math.abs(disc[0] - (by.get('followed') ?? 0)) < 0.011);
    assert.ok(Math.abs(disc[1] - (by.get('partial') ?? 0)) < 0.011);
    assert.ok(Math.abs(disc[2] - (by.get('broken') ?? 0)) < 0.011);
  }
});

// ── Website correctness regressions, run beside the phone's implementation ───────────────────────────────────────────────────────
const sample = [
  { id: 'a', date: '2026-09-01', symbol: 'A', gross: -1000, net: -1000, tax: 0 },
  { id: 'b', date: '2026-09-02', symbol: 'A', gross: 400, net: 400, tax: 0 },
  { id: 'c', date: '2026-09-03', symbol: 'A', gross: 0, net: 0, tax: 0 },
  { id: 'd', date: '2026-09-04', symbol: 'A', gross: 0, net: 0, tax: 0 },
];

test('web: a losing total keeps its minus sign in dashboard and expectancy', () => {
  const w = loadWeb(sample);
  w.run('updateDashboard(); renderAnalyticsStats(getTrades())');
  assert.match(w.text('stat-netpnl'), /^[-−]/, `the dashboard says ${w.text('stat-netpnl')} for a net of -600`);
  assert.match(w.text('a-expect'), /^[-−]/, `expectancy shows ${w.text('a-expect')}`);
});
test('phone: the same journal keeps the minus sign', () => {
  const p = tj.summarize(asPhone(sample));
  assert.equal(p.net, -600);
  assert.equal(tj.pnlText(p.net), '−₹600');
  assert.equal(tj.pnlText(p.expectancy), '−₹150');
});

test('expectancy matches the website (average win x win share - average loss x loss share); the website then rounds it to a whole rupee', () => {
  const R = rng(99);
  for (let n = 0; n < 60; n++) {
    const web = Array.from({ length: 3 + Math.floor(R() * 40) }, (_, i) => webTrade(R, i, monthDates, []));
    const w = loadWeb(web);
    w.run('renderAnalyticsStats(getTrades())');
    const p = tj.summarize(asPhone(web));
    // breakeven trades are in the count on both sides, so the two formulas agree; only the rounding and the lost minus sign differ
    assert.equal(Math.abs(num(w.text('a-expect'))), Number(Math.abs(p.expectancy as number).toFixed(0)), `journal ${n}`);
  }
});
test('phone: expectancy is the average net profit per trade, breakeven trades included', () => {
  assert.equal(tj.summarize(asPhone(sample)).expectancy, -150);
});

test('web: an exit price of 0 is a valid price and calculates the loss', () => {
  const w = loadWeb([]);
  w.run("setDir('Long')");
  w.set('f-entry', '80'); w.set('f-exit', '0'); w.set('f-qty', '50'); w.set('f-lotsize', '1'); w.set('f-gross', '');
  w.run('updateFormCalc()');
  assert.equal(num(w.els['f-gross'].value), -4000);
});
test('phone: exit 0 is a real price', () => {
  const t = tj.readTrade({ id: 'x', date: '2026-10-01', symbol: 'NIFTY', direction: 'Long', entry: 80, exit: 0, qty: 50 })!;
  assert.equal(t.exit, 0);
  assert.equal(tj.grossOf(t), -4000);
});

test('web: blank quantity does not calculate profit for a guessed unit', () => {
  const w = loadWeb([]);
  w.run("setDir('Long')");
  w.set('f-entry', '100'); w.set('f-exit', '110'); w.set('f-qty', ''); w.set('f-lotsize', ''); w.set('f-gross', '');
  w.run('updateFormCalc()');
  assert.equal(w.els['f-gross'].value, '');
});
test('phone: no quantity means no profit is worked out', () => {
  assert.equal(tj.priceGross({ direction: 'Long', entry: 100, exit: 110 }), null);
});

test('web: editing a saved trade preserves charges and notes', () => {
  const saved = { id: 'e1', date: '2026-09-01', symbol: 'NIFTY', direction: 'Long', entry: 100, exit: 110, qty: 10, lotSize: 1, gross: 100, brokerage: 20, stt: 10, tax: 30, net: 70, preEmotion: 'FOMO', notes: 'kept?', sl: 95 };
  const w = loadWeb([saved]);
  w.run("editTrade('e1')");
  w.run('saveTrade()');
  const after = JSON.parse(w.store.tradebook_trades).find((t: any) => t.id === 'e1');
  assert.equal(after.net, 70, `net after an edit with no change: ${after.net}`);
  assert.equal(after.brokerage, 20);
  assert.equal(after.notes, 'kept?');
});
test('phone: editing a trade keeps every field it was not asked to change', () => {
  const t = tj.readTrade({ id: 'e1', date: '2026-09-01', symbol: 'NIFTY', direction: 'Long', entry: 100, exit: 110, qty: 10, brokerage: 20, stt: 10, preEmotion: 'FOMO', notes: 'kept' })!;
  const built = tj.buildTrade(tj.formFromTrade(t), { id: t.id, today: '2026-10-16', now: new Date('2026-10-16T10:00:00Z'), base: t });
  assert.ok(built.ok);
  if (built.ok) {
    assert.equal(tj.netOf(built.trade), 70);
    assert.deepEqual([built.trade.brokerage, built.trade.stt, built.trade.preEmotion, built.trade.notes], [20, 10, 'FOMO', 'kept']);
  }
});

test('web: Sunday week-to-date includes the week ending today', () => {
  const week = [{ id: 'm', date: '2026-10-12', symbol: 'A', gross: 500, net: 500, tax: 0 }, { id: 's', date: '2026-10-17', symbol: 'A', gross: 250, net: 250, tax: 0 }];
  const w = loadWeb(week, [], '2026-10-18T12:00:00');          // a Sunday, noon local time
  w.run('updateDashboard()');
  assert.equal(num(w.text('wt-current')), 750);
});

test('web: strategy P&L chart retains losses as negative values', () => {
  const w = loadWeb([{ id: 'a', date: '2026-09-01', symbol: 'A', gross: -800, net: -800, strategy: 'Scalp' }, { id: 'b', date: '2026-09-02', symbol: 'A', gross: 300, net: 300, strategy: 'ORB' }]);
  w.run('renderStratChart(getTrades())');
  const data = w.charts.stratChart.data.datasets[0].data as number[];
  assert.ok(data.includes(-800), `plotted values: ${data.join(', ')}`);
});

test('web: CSV export includes exchange and other charges and preserves zeros', () => {
  const t = { id: 'c1', date: '2026-09-01', symbol: 'NIFTY', direction: 'Long', entry: 80, exit: 0, qty: 50, gross: -4000, brokerage: 20, exchange: 11, other: 3, tax: 34, net: -4034 };
  const w = loadWeb([t]);
  w.run('exportCSV()');
  const [head, row] = w.blobs[0].replace(/^﻿/, '').split('\r\n');
  const cells = row.split(',');
  const col = (name: string) => cells[head.split(',').indexOf(name)];
  assert.equal(col('Exchange'), '11');
  assert.equal(col('Other'), '3');
  assert.equal(col('Exit'), '0');
});
test('phone: the CSV export carries every charge and every zero', () => {
  const t = tj.readTrade({ id: 'c1', date: '2026-09-01', symbol: 'NIFTY', direction: 'Long', entry: 80, exit: 0, qty: 50, brokerage: 20, exchange: 11, other: 3 })!;
  const [head, row] = toCsv([t], []).split('\r\n');
  const cells = row.split(','), h = head.split(',');
  assert.equal(cells[h.indexOf('Exchange charges')], '11');
  assert.equal(cells[h.indexOf('Other charges')], '3');
  assert.equal(cells[h.indexOf('Exit price')], '0');
  assert.equal(cells[h.indexOf('Total charges')], '34');
  assert.equal(cells[h.indexOf('Net profit')], '-4034');
});

// ── the website's CSV importer (TradeJournal/upgrades.js), run beside app.js ──────────────────────────────────────────────────────────
function loadWebImporter() {
  const els: Record<string, any> = {};
  const store: Record<string, string> = {};
  const P = (o: any) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : () => {}) });
  const mk = (id: string): any => (id === 'particle-canvas' ? null : (els[id] ??= P({ id, value: '', textContent: '', innerHTML: '', style: P({}), className: '', dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [], getContext: () => ({}) })));
  const sandbox: any = {
    document: { getElementById: mk, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, createElement: () => mk('__c'), documentElement: P({ style: P({}), classList: { add() {}, remove() {}, toggle() {} } }), body: mk('__b'), head: mk('__h') },
    localStorage: { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = String(v); }, removeItem: (k: string) => { delete store[k]; } },
    console: { log() {}, warn() {}, error() {} }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame: () => 0, Chart: function () { return { destroy() {} }; },
    navigator: { onLine: true }, location: { hash: '', search: '' }, addEventListener() {}, innerWidth: 800, innerHeight: 600, confirm: () => true, URLSearchParams, Date, Math, JSON, parseFloat, parseInt, Number, Object, Array, String, Set, Map, RegExp, isNaN, Intl,
    MutationObserver: function () { return { observe() {} }; }, IntersectionObserver: function () { return { observe() {} }; }, matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  sandbox.window = sandbox; sandbox.showToast = () => {};
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  try { vm.runInContext(fs.readFileSync(path.join(path.dirname(WEB), 'upgrades.js'), 'utf8'), sandbox); } catch { /* the page's own chrome after the importer is defined */ }
  return {
    read(csv: string) {
      mk('csv-paste-area').value = csv;
      sandbox._parseAndImportCSV();
      const html = String(els['csv-preview'].innerHTML);
      const m = /_commitCSVImport\((.*)\)"/.exec(html);
      return m ? JSON.parse(m[1].replace(/&quot;/g, '"')) as any[] : [];
    },
    preview() { return String(els['csv-preview']?.innerHTML ?? ''); },
    commit(rows: any[]) { sandbox.updateDashboard = () => {}; sandbox._commitCSVImport(rows); return JSON.parse(store.tradebook_trades || '[]'); },
  };
}
const FILLS = 'trade_date,tradingsymbol,transaction_type,quantity,price\n05/10/2026,RELIANCE,buy,10,2400\n05/10/2026,RELIANCE,sell,10,2450\n';

test('web: broker CSV importer pairs fills as an Indian-date round trip', () => {
  const rows = loadWebImporter().read(FILLS);
  assert.equal(rows.length, 1, `${rows.length} trades for one round trip`);
  assert.equal(rows[0].date, '2026-10-05');
  assert.equal(rows[0].net, 500);
  assert.equal(rows[0].direction, 'Long');
});
test('web: CSV import preview explains skipped invalid rows and unmatched open fills', () => {
  const importer = loadWebImporter();
  const rows = importer.read('trade_date,tradingsymbol,transaction_type,quantity,price\n05/10/2026,RELIANCE,buy,10,2400\ninvalid,?,bad,0,x\n');
  assert.equal(rows.length, 0);
  assert.match(importer.preview(), /unmatched open fill/);
  assert.match(importer.preview(), /invalid row skipped/);
});
test('web: CSV duplicate detection preserves same-day trades with different size and prices', () => {
  const importer = loadWebImporter();
  const trades = importer.commit([
    { date: '2026-10-05', symbol: 'RELIANCE', direction: 'Long', entry: 100, exit: 110, qty: 10, gross: 100, net: 100 },
    { date: '2026-10-05', symbol: 'RELIANCE', direction: 'Long', entry: 100, exit: 105, qty: 20, gross: 100, net: 100 },
  ]);
  assert.equal(trades.length, 2);
});
test('phone: the same file is one Long trade on 5 October 2026 worth ₹500 before charges', () => {
  const r = parseJournalFile(FILLS, { batch: 'b', today: '2026-10-16' });
  assert.equal(r.format, 'fills-csv');
  assert.equal(r.trades.length, 1);
  assert.deepEqual([r.trades[0].date, r.trades[0].direction, r.trades[0].entry, r.trades[0].exit, r.trades[0].qty, tj.grossOf(r.trades[0])], ['2026-10-05', 'Long', 2400, 2450, 10, 500]);
});
