// The phone's expense-ratio impact and SIP consistency must equal the website's js/mf-intelligence.js on the same inputs.
// The website file is executed as it is (in a vm with a stub DOM); for exact numbers one assignment is wrapped so the real
// local values of its arithmetic can be read, nothing else is changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as f from '../lib/funds.ts';

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/mf-intelligence.js'), 'utf8');

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261014);

interface Stub { value: string; innerHTML: string; style: Record<string, string>; textContent: string; addEventListener(): void }
function makeSandbox(opts: { txns?: unknown; now?: number; src?: string }) {
  const els: Record<string, Stub> = {};
  const get = (id: string): Stub => (els[id] ??= { value: '', innerHTML: '', style: {}, textContent: '', addEventListener() {} });
  const NOW = opts.now ?? Date.now();
  class FakeDate extends Date {
    constructor(...a: any[]) { if (a.length === 0) super(NOW); else super(...(a as [any])); }
    static now() { return NOW; }
  }
  const win: any = {};
  const sandbox: any = {
    window: win, document: { getElementById: get, querySelectorAll: () => [] }, Date: FakeDate, Math, JSON, Number, String, Object, Array, Set, console,
    localStorage: { getItem: (k: string) => (k === 'finos_transactions' && opts.txns !== undefined ? JSON.stringify(opts.txns) : null), setItem() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(opts.src ?? SRC, sandbox);
  return { win, get, sandbox };
}

const INR = (n: number) => {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
  if (n >= 1e3) return '₹' + Math.round(n / 1e3) + 'K';
  return '₹' + Math.round(n).toLocaleString('en-IN');
};

const MARK = "document.getElementById('erResult').innerHTML = `";
test('the website file still has the assignment this test wraps', () => assert.ok(SRC.includes(MARK)));
const INSTRUMENTED = SRC.replace(MARK, `globalThis.__er = { regCorpus, dirCorpus, diff, invested }; ${MARK}`);

function runWebExpense(sip: number, years: number, reg: number, dir: number, src: string) {
  const { win, get } = makeSandbox({ src });
  win.MFIntelligence.renderExpenseCalculator({ innerHTML: '' });
  get('erSIP').value = String(sip); get('erYears').value = String(years); get('erRegular').value = String(reg); get('erDirect').value = String(dir);
  win.calcExpenseImpact();
  return { html: get('erResult').innerHTML, locals: (vm as any).__unused, win };
}

test('expenseImpact equals the website on 800 random SIPs (exact arithmetic) and prints the same rounded figures', () => {
  for (let n = 0; n < 800; n++) {
    const sip = 500 + Math.round(R() * 150000 / 500) * 500;
    const years = 5 + Math.floor(R() * 36);
    const reg = Math.round((0.5 + R() * 2.5) * 10) / 10;
    const dir = Math.round((0.1 + R() * 1.4) * 10) / 10;

    // exact numbers: run the instrumented copy and read what the page computed
    const sbx = makeSandbox({ src: INSTRUMENTED });
    sbx.win.MFIntelligence.renderExpenseCalculator({ innerHTML: '' });
    sbx.get('erSIP').value = String(sip); sbx.get('erYears').value = String(years); sbx.get('erRegular').value = String(reg); sbx.get('erDirect').value = String(dir);
    sbx.win.calcExpenseImpact();
    const mine = f.expenseImpact({ monthlySip: sip, years, regularEr: reg, directEr: dir, grossReturn: 12 });
    const g = readGlobal(sbx);
    assert.equal(mine.regularCorpus, g.regCorpus, `regular ${sip}/${years}/${reg}`);
    assert.equal(mine.directCorpus, g.dirCorpus, `direct ${sip}/${years}/${dir}`);
    assert.equal(mine.difference, g.diff);
    assert.equal(mine.invested, g.invested);

    // the printed text of the unmodified page
    const plain = runWebExpense(sip, years, reg, dir, SRC).html;
    assert.ok(plain.includes(INR(mine.regularCorpus)), `printed regular ${INR(mine.regularCorpus)}`);
    assert.ok(plain.includes(INR(mine.directCorpus)), `printed direct ${INR(mine.directCorpus)}`);
    assert.ok(plain.includes(INR(mine.difference)), `printed difference ${INR(mine.difference)}`);
    assert.ok(plain.includes(`= ${mine.differencePctOfInvested.toFixed(0)}% of your total invested amount (${INR(mine.invested)})`));
  }
});

function readGlobal(sbx: { sandbox: any }): { regCorpus: number; dirCorpus: number; diff: number; invested: number } {
  // the wrapped assignment wrote to the vm's global object, which is the sandbox
  return sbx.sandbox.__er;
}

// ── SIP consistency ─────────────────────────────────────────────────────────────────────────────

function webSip(txns: unknown[], now: Date) {
  const { win } = makeSandbox({ txns, now: now.getTime() });
  const el = { innerHTML: '' };
  win.MFIntelligence.renderSIPCalendar(el);
  const pct = /(\d+)%<\/span>/.exec(el.innerHTML);
  const streak = /(\d+)m streak/.exec(el.innerHTML);
  const paidCells = (el.innerHTML.match(/✅ Paid/g) ?? []).length;
  return { consistency: pct ? +pct[1] : NaN, streak: streak ? +streak[1] : NaN, paidCells };
}

test('SIP consistency and streak equal the website on random transaction histories', () => {
  const CATS = ['SIP', 'Mutual Fund', 'Investment', 'mf', 'Groceries', 'Rent', 'sip payment', ''];
  for (let n = 0; n < 300; n++) {
    // the website steps back with setMonth on today's date, which is only a calendar walk on days 1-28; test those days
    const now = new Date(2026, Math.floor(R() * 12), 1 + Math.floor(R() * 28), 12, 0, 0);
    const txns: any[] = [];
    const count = Math.floor(R() * 30);
    for (let i = 0; i < count; i++) {
      const back = Math.floor(R() * 16);
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1 + Math.floor(R() * 28), 12);
      const cat = CATS[Math.floor(R() * CATS.length)];
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      txns.push(R() < 0.8 ? { category: cat, date } : { type: cat, date });
    }
    const web = webSip(txns, now);
    const mine = f.sipConsistency(f.sipMonthsFromTransactions(txns), now);
    assert.equal(mine.consistency, web.consistency, `consistency ${JSON.stringify(txns)} @ ${now.toISOString()}`);
    assert.equal(mine.streak, web.streak, `streak @ ${now.toISOString()}`);
    assert.equal(mine.paidCount, web.paidCells);
  }
});
