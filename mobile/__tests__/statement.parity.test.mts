// The app's statement importer (lib/statementImport.ts) must read every statement exactly as the website's
// js/finos-statement-import.js does: same rows, same skipped-row reasons, same warnings, same ledger, same dedupe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as app from '@/lib/statementImport';

const web = createRequire(import.meta.url)('../../js/finos-statement-import.js');

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const R = rng(20261012);
const pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(R() * (hi - lo + 1));
const pad = (n: number) => String(n).padStart(2, '0');

const NARRATIONS = ['UPI/PhonePe/Swiggy order', 'NEFT-SALARY-ACME LTD', 'ATM WDL MUMBAI', 'IMPS/Ravi Kumar/rent', 'Zerodha Broking', 'POS 4821 AMAZON', 'ACH D- HDFC Life', 'Interest credit', 'Opening Balance', 'Closing Balance', 'Page 1 of 3', 'Netflix.com', 'Uber trip, Bengaluru', 'Electricity bill "BESCOM"', ''];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(y: number, m: number, d: number, style: string) {
  if (style === 'iso') return `${y}-${pad(m)}-${pad(d)}`;
  if (style === 'mon') return `${pad(d)}-${MONTHS[m - 1]}-${y}`;
  if (style === 'short') return `${pad(d)}/${pad(m)}/${String(y).slice(2)}`;
  if (style === 'mdy') return `${pad(m)}/${pad(d)}/${y}`;
  return `${pad(d)}/${pad(m)}/${y}`;                       // dmy
}
const money = (n: number, comma: boolean) => (comma ? n.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : n.toFixed(2));

function randomStatement(): string {
  const layout = pick(['drcr-cols', 'amount-drcr', 'amount-suffix', 'withdraw-deposit', 'signed'] as const);
  const delim = pick([',', ',', ';', '\t']);
  const style = pick(['dmy', 'dmy', 'iso', 'mon', 'short', 'mdy']);
  const comma = R() < 0.5;
  const withBalance = R() < 0.7;
  const q = (s: string) => (/[,;\t"]/.test(s) || s.includes(delim) ? `"${s.replace(/"/g, '""')}"` : s);

  const header = {
    'drcr-cols': ['Date', 'Narration', 'Chq/Ref No', 'Debit', 'Credit', 'Balance'],
    'amount-drcr': ['Txn Date', 'Description', 'Amount', 'Dr/Cr', 'Balance'],
    'amount-suffix': ['Transaction Date', 'Particulars', 'Amount', 'Balance'],
    'withdraw-deposit': ['Value Date', 'Transaction Remarks', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    'signed': ['Date', 'Details', 'Amount'],
  }[layout];

  const lines: string[] = [];
  if (R() < 0.5) lines.push(['Account Statement for XXXX1234', 'Customer: A B', 'Period: Apr 2026 - Sep 2026'].slice(0, int(1, 3)).join('\n'));
  lines.push(header.map(q).join(delim));

  let bal = int(5000, 90000);
  const n = int(0, 25);
  for (let i = 0; i < n; i++) {
    const y = pick([2025, 2026]), m = int(1, 12), d = pick([int(1, 12), int(13, 28)]);
    const narr = pick(NARRATIONS);
    const amt = Math.round(R() * 20000 * 100) / 100 + 1;
    const credit = R() < 0.3;
    if (R() < 0.04) { bal = bal; }
    bal = Math.round((credit ? bal + amt : bal - amt) * 100) / 100;
    const balCell = withBalance ? (R() < 0.05 ? '' : money(Math.abs(bal), comma)) : '';
    const date = R() < 0.05 ? pick(['', '31/02/2026', 'garbage']) : fmtDate(y, m, d, style);
    let row: string[];
    switch (layout) {
      case 'drcr-cols': row = [date, narr, R() < 0.5 ? String(int(1000, 9999)) : '', credit ? '' : money(amt, comma), credit ? money(amt, comma) : '', balCell]; break;
      case 'amount-drcr': row = [date, narr, money(amt, comma), credit ? 'CR' : 'DR', balCell]; break;
      case 'amount-suffix': row = [date, narr, `${money(amt, comma)} ${credit ? 'Cr' : 'Dr'}`, balCell]; break;
      case 'withdraw-deposit': row = [date, narr, credit ? '' : money(amt, comma), credit ? money(amt, comma) : '', balCell]; break;
      default: row = [date, narr, (credit ? '' : '-') + money(amt, comma)];
    }
    if (R() < 0.03) row = row.map(() => '');                     // blank line
    lines.push(row.map(q).join(delim));
  }
  return lines.join(R() < 0.2 ? '\r\n' : '\n');
}

test('bank CSV: parseStatement is identical to the website on 700 random statements', () => {
  let parsed = 0, failed = 0;
  for (let i = 0; i < 700; i++) {
    const text = randomStatement();
    const a = app.parseStatement(text), w = web.parseStatement(text);
    assert.deepEqual(a, w, `statement ${i}\n${text.slice(0, 400)}`);
    a.ok ? parsed++ : failed++;
  }
  assert.ok(parsed > 300, `enough statements actually parsed to be meaningful (${parsed} ok, ${failed} not)`);
});

test('ledger: toLedger / mergeLedger / undoBatch / topCategories match, and a re-import adds nothing', () => {
  for (let i = 0; i < 150; i++) {
    const r = app.parseStatement(randomStatement());
    if (!r.ok) continue;
    const ledgerA = app.toLedger(r.rows, { batch: 'b1' });
    const ledgerW = web.toLedger(r.rows, { batch: 'b1' });
    assert.deepEqual(ledgerA, ledgerW);

    const existing = [{ id: 'x', type: 'debit', amount: 50, desc: 'old', date: '2026-01-01T00:00:00.000Z' }, ...ledgerA.slice(0, int(0, ledgerA.length))];
    assert.deepEqual(app.mergeLedger(existing, ledgerA), web.mergeLedger(existing, ledgerW));
    const merged = app.mergeLedger(existing, ledgerA).merged;
    assert.equal(app.mergeLedger(merged, ledgerA).added, 0, 're-import adds nothing');
    assert.deepEqual(app.undoBatch(merged, 'b1'), web.undoBatch(merged, 'b1'));
    assert.deepEqual(app.topCategories(r.rows, 4), web.topCategories(r.rows, 4));
  }
});

test('identical payments inside one file are kept (two ₹10 teas); a different day is not a duplicate', () => {
  const csv = 'Date,Narration,Debit,Credit,Balance\n02/04/2026,Tea stall,10,,990\n02/04/2026,Tea stall,10,,980\n03/04/2026,Tea stall,10,,970\n';
  const r = app.parseStatement(csv);
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 3);
  const once = app.mergeLedger([], app.toLedger(r.rows, { batch: 'a' }));
  assert.equal(once.added, 3);
  assert.equal(app.mergeLedger(once.merged, app.toLedger(r.rows, { batch: 'b' })).added, 0);
});

test('never guesses: unreadable rows are skipped with a reason, not invented', () => {
  const csv = 'Date,Narration,Debit,Credit\n05/04/2026,UPI rent,15000,\n,Page 1 of 2,,\nnot-a-date,Mystery,100,\n06/04/2026,Both sides,50,50\n07/04/2026,No amount,,\n';
  const r = app.parseStatement(csv);
  assert.equal(r.rows.length, 1);
  assert.equal(r.skipped.length, 4);
  assert.deepEqual(r.skipped.map((s: any) => s.reason), ['not a transaction row', 'not a transaction row', 'both a debit and a credit', 'no amount']);   // blank date, words-in-date, two amounts, none
  assert.equal(app.parseStatement('hello,world\n1,2').ok, false);
  assert.equal(app.parseStatement('').ok, false);
});

test('payment-app names do not decide the category ("PhonePe" is not a phone bill); credits are Income', () => {
  const csv = 'Date,Narration,Debit,Credit\n05/04/2026,UPI/PhonePe/Zomato dinner,420,\n06/04/2026,NEFT SALARY ACME,,85000\n';
  const r = app.parseStatement(csv);
  const l = app.toLedger(r.rows, { batch: 'p' });
  assert.equal(l[1].category, 'Income');
  assert.notEqual(l[0].category, 'Bills & Utilities');
  assert.equal(l[0].date, '2026-04-05T12:00:00.000Z');                       // noon UTC: no timezone can move the day
});

test('Account Aggregator JSON: same rows as the website; encrypted/unknown data is refused, not guessed', () => {
  const aa = { account: { type: 'deposit', transactions: { transaction: [
    { type: 'CREDIT', amount: '85000.00', transactionTimestamp: '2026-04-01T10:00:00+05:30', narration: 'SALARY', currentBalance: '90000' },
    { type: 'DEBIT', amount: '420', transactionTimestamp: '2026-04-02T09:30:00+05:30', narration: 'UPI Swiggy' },
    { type: 'DEBIT', amount: '-5', transactionTimestamp: '2026-04-03', narration: 'bad' },
    { type: 'WHAT', amount: '5', transactionTimestamp: '2026-04-03', narration: 'weird' },
  ] } } };
  assert.deepEqual(app.fromAA(aa), web.fromAA(aa));
  assert.equal(app.fromAA(aa).rows.length, 2);
  assert.deepEqual(app.fromAA('{"encryptedFI": "abc"}'), web.fromAA('{"encryptedFI": "abc"}'));
  assert.equal(app.fromAA('not json').ok, false);
});
