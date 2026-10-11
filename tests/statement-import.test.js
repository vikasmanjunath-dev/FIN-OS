// FinosStatement — bank CSV / Account Aggregator JSON → transactions. Expected values are worked out by hand in the comments.
const test = require('node:test');
const assert = require('node:assert');
const S = require('../js/finos-statement-import.js');
const B = require('../js/finos-budget.js');

/* ── fixtures: three real-world layouts ─────────────────────────────────────────────────────────────────── */
// HDFC style: account details above the header, separate Withdrawal / Deposit columns, dd/mm/yy, running balance.
const HDFC = [
  'Account Branch :BANGALORE', 'Customer ID :12345678', 'Statement From : 01/09/2025 To : 30/09/2025', '',
  'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
  '01/09/25,"UPI-ZOMATO-ORDER 123,FOOD",0000412345,01/09/25,450.00,,49550.00',
  '02/09/25,NEFT CR-ACME CORP-SALARY SEP,N123456789,02/09/25,,90000.00,139550.00',
  '03/09/25,UPI-RAHUL S-PAID VIA PHONEPE,0000987654,03/09/25,"1,200.00",,138350.00',
  '03/09/25,ATM WDL SBI MG ROAD,000111,03/09/25,5000.00,,133350.00',
  '05/09/25,EMI HDFC HOME LOAN 7890,000222,05/09/25,"25,000.00",,108350.00',
].join('\r\n');
const OPENING = 50000;                                  // so the first row's balance 49550 = 50000 − 450

// ICICI style: BOM, "(INR )" headers, two date columns, S No. first.
const ICICI = '﻿' + [
  'S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )',
  '1,10/09/2025,10/09/2025,,UPI/AMAZON PAY INDIA/Shopping,2499.00,0.00,20000.00',
  '2,11/09/2025,11/09/2025,,BY CLG SALARY,0.00,55000.50,75000.50',
  '3,12/09/2025,12/09/2025,,ELECTRICITY BESCOM BILL,1800.50,0.00,73200.00',
].join('\n');

// SBI style: dd-Mon-yyyy dates, single Amount column with a separate Dr/Cr column, tab/semicolon-free.
const SBI = [
  'Txn Date,Value Date,Description,Ref No./Cheque No.,Amount,Dr/Cr,Balance',
  '03-Oct-2025,03-Oct-2025,UPI/DR/12345/SWIGGY,12345,350.00,DR,9650.00',
  '04 Oct 2025,04 Oct 2025,SALARY OCT,67890,30000.00,CR,39650.00',
].join('\n');

const find = (res, text) => res.rows.find((r) => r.desc.includes(text));

/* ── dates ───────────────────────────────────────────────────────────────────────────────────────────────── */
test('parseDate: every common bank date form, validated against the real calendar', () => {
  const ok = [['2025-04-03', '2025-04-03'], ['2025/04/03', '2025-04-03'], ['2025-04-03T10:15:00.000+05:30', '2025-04-03'], ['03/04/2025', '2025-04-03'], ['03-04-25', '2025-04-03'],
    ['3.4.2025', '2025-04-03'], ['03-Apr-2025', '2025-04-03'], ['03 Apr 25', '2025-04-03'], ['3-April-2025', '2025-04-03'], ['29/02/2024', '2024-02-29'], ['  03/04/2025  ', '2025-04-03']];
  ok.forEach(([i, o]) => assert.strictEqual(S.parseDate(i, 'dmy'), o, i));
  assert.strictEqual(S.parseDate('03/04/2025', 'mdy'), '2025-03-04');                          // month-first when the file proves it
  for (const bad of ['29/02/2025', '31/04/2025', '00/01/2025', '13/13/2025', '1999-01-01', '2099-01-01', 'yesterday', '', null, undefined, '03/04', 'Apr 2025', '12345678']) assert.strictEqual(S.parseDate(bad, 'dmy'), null, String(bad));
});

test('detectDateOrder: day-first by default, month-first only when a second part exceeds 12, and mixed files are flagged', () => {
  assert.deepStrictEqual(S.detectDateOrder(['03/04/2025', '05/06/2025']), { order: 'dmy', mixed: false });
  assert.deepStrictEqual(S.detectDateOrder(['03/04/2025', '25/06/2025']), { order: 'dmy', mixed: false });
  assert.deepStrictEqual(S.detectDateOrder(['04/03/2025', '06/25/2025']), { order: 'mdy', mixed: false });
  assert.strictEqual(S.detectDateOrder(['25/04/2025', '06/25/2025']).mixed, true);
});

/* ── the three layouts ───────────────────────────────────────────────────────────────────────────────────── */
test('HDFC layout: finds the header under the account details, reads every row, and the balances reconcile', () => {
  const r = S.parseStatement(HDFC);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.format, 'bank-csv');
  assert.strictEqual(r.rows.length, 5);
  assert.deepStrictEqual(r.dateRange, { from: '2025-09-01', to: '2025-09-05' });
  assert.deepStrictEqual(r.rows[0], { date: '2025-09-01', desc: 'UPI-ZOMATO-ORDER 123,FOOD', type: 'debit', amount: 450, balance: 49550, ref: '0000412345' });   // quoted comma kept
  assert.deepStrictEqual([r.rows[1].type, r.rows[1].amount, r.rows[1].balance], ['credit', 90000, 139550]);
  assert.strictEqual(find(r, 'PHONEPE').amount, 1200);                                           // "1,200.00" with its thousands comma
  assert.deepStrictEqual(r.totals, { count: 5, credits: 90000, debits: 450 + 1200 + 5000 + 25000 });   // 31,650
  assert.strictEqual(r.reconciled, 'yes');                                                       // 49550 + 90000 − 1200 − 5000 − 25000 = 108350
  assert.strictEqual(r.dateOrder, 'dmy');
  assert.deepStrictEqual(r.skipped, []);
});

test('ICICI layout: a BOM, "(INR )" headers, two date columns and 0.00 in the unused column', () => {
  const r = S.parseStatement(ICICI);
  assert.strictEqual(r.rows.length, 3);
  assert.deepStrictEqual(r.rows.map((x) => [x.type, x.amount]), [['debit', 2499], ['credit', 55000.5], ['debit', 1800.5]]);
  assert.strictEqual(r.rows[0].date, '2025-09-10');                                              // the transaction date, not the value date
  assert.deepStrictEqual(r.totals, { count: 3, credits: 55000.5, debits: 4299.5 });
  assert.strictEqual(r.reconciled, 'unknown');                                                   // only 3 rows: too few to judge
});

test('SBI layout: dd-Mon-yyyy dates and one Amount column with a Dr/Cr column', () => {
  const r = S.parseStatement(SBI);
  assert.deepStrictEqual(r.rows.map((x) => [x.date, x.type, x.amount]), [['2025-10-03', 'debit', 350], ['2025-10-04', 'credit', 30000]]);
});

test('other amount conventions: "1,234.50 Dr" suffixes, negative amounts, and semicolon or tab delimiters', () => {
  const suffix = S.parseStatement('Date,Particulars,Amount\n01/10/2025,Rent,"12,000.00 Dr"\n02/10/2025,Salary,"50,000.00 Cr"');
  assert.deepStrictEqual(suffix.rows.map((x) => [x.type, x.amount]), [['debit', 12000], ['credit', 50000]]);
  const signed = S.parseStatement('Date,Description,Amount\n01/10/2025,Rent,-12000\n02/10/2025,Refund,(300)');
  assert.deepStrictEqual(signed.rows.map((x) => [x.type, x.amount]), [['debit', 12000], ['debit', 300]]);
  const semi = S.parseStatement('Date;Narration;Debit;Credit\n01/10/2025;Tea;10,50;\n');
  assert.strictEqual(semi.ok, true);
  const tab = S.parseStatement('Date\tNarration\tDebit\tCredit\n01/10/2025\tTea\t10\t\n02/10/2025\tPay\t\t500');
  assert.deepStrictEqual(tab.rows.map((x) => [x.type, x.amount]), [['debit', 10], ['credit', 500]]);
});

/* ── never guess ─────────────────────────────────────────────────────────────────────────────────────────── */
test('rows that cannot be read cleanly are skipped and each one is reported with a reason', () => {
  const csv = ['Date,Narration,Debit,Credit,Balance',
    '01/10/2025,Good row,100,,900',
    'Opening Balance,,,,1000',
    '02/10/2025,No amount,,,900',
    '03/10/2025,Both,50,60,900',
    '99/99/2025,Bad date,10,,900',
    '04/10/2025,Closing balance,,,900',
    'Page 1 of 3,,,,',
    '05/10/2025,Another good,25,,875'].join('\n');
  const r = S.parseStatement(csv);
  assert.deepStrictEqual(r.rows.map((x) => x.desc), ['Good row', 'Another good']);
  assert.deepStrictEqual(r.skipped.map((x) => x.reason), ['not a transaction row', 'no amount', 'both a debit and a credit', 'unreadable date', 'balance row', 'not a transaction row']);
  assert.match(r.warnings.join(' '), /6 rows were skipped/);
});

test('a missing balance column or description does not break a row', () => {
  const r = S.parseStatement('Date,Particulars,Debit,Credit\n01/10/2025,,100,\n');
  assert.deepStrictEqual([r.rows[0].desc, r.rows[0].balance, r.rows[0].ref], ['(no description)', null, null]);
});

test('not a statement: a clear message and no rows, for empty, wrong and header-less files', () => {
  assert.strictEqual(S.parseStatement('').ok, false);
  assert.match(S.parseStatement('').warnings[0], /empty/);
  for (const text of ['Name,Age\nA,3', 'hello world', 'Date,Narration\n01/10/2025,x', '\u0000\u0001garbage']) {
    const r = S.parseStatement(text);
    assert.strictEqual(r.ok, false, text);
    assert.deepStrictEqual(r.rows, []);
    assert.ok(r.warnings.length >= 1);
  }
  assert.match(S.parseStatement('Name,Age\nA,3').warnings[0], /does not look like a bank statement/);
  assert.match(S.parseStatement('Date,Narration,Debit,Credit\nnope,x,,').warnings[0], /no readable transactions/);
});

test('reconciliation: a missing row makes the balance check say so', () => {
  const rows = ['Date,Narration,Debit,Credit,Balance'];
  let bal = 10000;
  for (let i = 1; i <= 8; i++) { bal -= 100; rows.push(`0${i}/10/2025,Spend ${i},100,,${bal}`); }
  assert.strictEqual(S.parseStatement(rows.join('\n')).reconciled, 'yes');
  const missing = rows.filter((_, i) => i !== 4 && i !== 5);                                   // two rows lost from the middle
  const r = S.parseStatement(missing.join('\n'));
  assert.strictEqual(r.reconciled, 'no');
  assert.match(r.warnings.join(' '), /balance column does not add up/);
  const newestFirst = [rows[0], ...rows.slice(1).reverse()];                                   // many banks list newest first
  assert.strictEqual(S.parseStatement(newestFirst.join('\n')).reconciled, 'yes');
});

test('month-first files are read month-first, and a mixed file is flagged', () => {
  const r = S.parseStatement('Date,Narration,Debit,Credit\n06/25/2025,A,10,\n07/03/2025,B,20,');
  assert.deepStrictEqual([r.dateOrder, r.rows.map((x) => x.date)], ['mdy', ['2025-06-25', '2025-07-03']]);
  assert.match(S.parseStatement('Date,Narration,Debit,Credit\n25/06/2025,A,10,\n06/25/2025,B,20,').warnings.join(' '), /mix day-first and month-first/);
});

test('amounts: rounding to paise, huge values and junk never produce NaN', () => {
  const r = S.parseStatement('Date,Narration,Debit,Credit\n01/10/2025,A,10.005,\n02/10/2025,B,"1,00,00,000.10",\n03/10/2025,C,abc,');
  assert.deepStrictEqual(r.rows.map((x) => x.amount), [10.01, 10000000.1]);
  assert.ok(JSON.stringify(r).indexOf('NaN') === -1);
});

/* ── Account Aggregator JSON ─────────────────────────────────────────────────────────────────────────────── */
const deposit = (txns, extra) => Object.assign({
  type: 'deposit', version: '1.1',
  profile: { holders: { type: 'SINGLE', holder: [{ name: 'SOMEONE PRIVATE', pan: 'ABCDE1234F', mobile: '9876543210' }] } },
  summary: { currentBalance: '50000.00', type: 'SAVINGS', ifscCode: 'HDFC0001234', status: 'ACTIVE' },
  transactions: { startDate: '2025-09-01', endDate: '2025-09-30', transaction: txns },
}, extra);
const TX = [
  { type: 'DEBIT', mode: 'UPI', amount: '450.00', currentBalance: '49550.00', transactionTimestamp: '2025-09-01T23:30:00.000+05:30', valueDate: '2025-09-01', txnId: 'T1', narration: 'UPI/ZOMATO/FOOD', reference: 'R1' },
  { type: 'CREDIT', mode: 'NEFT', amount: '90000.00', currentBalance: '139550.00', transactionTimestamp: '2025-09-02T10:00:00.000+05:30', valueDate: '2025-09-02', txnId: 'T2', narration: 'SALARY SEP' },
];

test('AA JSON: reads a ReBIT deposit account, keeps the date as written (no timezone shift) and never reads personal fields', () => {
  const r = S.fromAA(deposit(TX));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.format, 'aa-json');
  assert.deepStrictEqual(r.rows[0], { date: '2025-09-01', desc: 'UPI/ZOMATO/FOOD', type: 'debit', amount: 450, balance: 49550, ref: 'T1' });   // 23:30 IST stays 1 Sep
  assert.deepStrictEqual(r.totals, { count: 2, credits: 90000, debits: 450 });
  const text = JSON.stringify(r);
  assert.doesNotMatch(text, /SOMEONE PRIVATE|ABCDE1234F|9876543210|HDFC0001234/);               // holder name, PAN, mobile, IFSC never appear in the output
});

test('AA JSON: handles the wrappers providers use, upper/lower-case keys, text input, and several accounts', () => {
  const wrapped = { Payload: [{ fipID: 'X', data: [{ linkRefNumber: 'a', maskedAccNumber: 'XXXX1234', decryptedFI: deposit(TX) }, { decryptedFI: deposit([{ Type: 'CREDIT', Amount: '10', TransactionTimestamp: '2025-09-05T00:00:00Z', Narration: 'Interest' }]) }] }] };
  const r = S.fromAA(JSON.stringify(wrapped));
  assert.strictEqual(r.rows.length, 3);
  assert.strictEqual(r.rows[2].desc, 'Interest');
  assert.strictEqual(S.fromAA([deposit(TX), deposit(TX)]).rows.length, 4);
});

test('AA JSON: says plainly when data is encrypted, empty or the wrong thing, and notes other account types', () => {
  assert.match(S.fromAA({ Payload: [{ data: [{ encryptedFI: 'abc==' }] }] }).warnings[0], /still encrypted/);
  assert.match(S.fromAA({}).warnings[0], /could not find any deposit-account/);
  assert.match(S.fromAA('{nope').warnings[0], /not valid JSON/);
  for (const bad of [null, undefined, 5, 'x', true]) assert.strictEqual(S.fromAA(bad).ok, false);
  const mixed = S.fromAA([deposit(TX), { type: 'mutual_funds', transactions: {} }, { type: 'insurance_policies' }]);
  assert.strictEqual(mixed.rows.length, 2);
  assert.match(mixed.warnings.join(' '), /2 other account types were ignored/);
});

test('AA JSON: bad transactions are skipped with reasons, not guessed', () => {
  const r = S.fromAA(deposit([...TX, { type: 'TRANSFER', amount: '5', transactionTimestamp: '2025-09-03' }, { type: 'DEBIT', amount: '0', transactionTimestamp: '2025-09-03' },
    { type: 'DEBIT', amount: '5', transactionTimestamp: 'sometime' }, { type: 'DEBIT', amount: 'x', valueDate: '2025-09-03' }]));
  assert.strictEqual(r.rows.length, 2);
  assert.deepStrictEqual(r.skipped.map((s) => s.reason), ['unknown transaction type', 'no amount', 'unreadable date', 'no amount']);
});

/* ── into the ledger ─────────────────────────────────────────────────────────────────────────────────────── */
test('toLedger: the shape the rest of FIN-OS reads, categorised, with noon-UTC dates and a batch id', () => {
  const rows = S.parseStatement(HDFC).rows;
  const led = S.toLedger(rows, { batch: 'imp_t1' });
  assert.strictEqual(led.length, 5);
  assert.deepStrictEqual(led[0], { id: 'imp_t1_0', type: 'debit', amount: 450, desc: 'UPI-ZOMATO-ORDER 123,FOOD', category: 'Food & Dining', date: '2025-09-01T12:00:00.000Z', src: 'import', batch: 'imp_t1' });
  assert.strictEqual(led[1].category, 'Income');
  assert.strictEqual(led[4].category, 'EMI & Loans');
  assert.strictEqual(led[2].category, 'Other', 'PhonePe must not read as a phone bill');                // "UPI-RAHUL S-PAID VIA PHONEPE"
  assert.ok(led.every((t) => /^\d{4}-\d{2}-\d{2}T12:00:00\.000Z$/.test(t.date)));
});

test('toLedger: FinosBudget reads the result correctly (income vs expense, month, category)', () => {
  const norm = B.normalizeAll(S.toLedger(S.parseStatement(HDFC).rows, { batch: 'b' }));
  assert.strictEqual(norm.length, 5);
  assert.deepStrictEqual(norm.map((t) => t.kind), ['expense', 'income', 'expense', 'expense', 'expense']);
  assert.ok(norm.every((t) => t.date.startsWith('2025-09-')));
  assert.strictEqual(norm[0].category, 'Food & Dining');
  const spend = B.monthSpend(norm, '2025-09');
  assert.strictEqual(spend.total, 450 + 1200 + 5000 + 25000);
});

test('mergeLedger: a re-import adds nothing, an overlapping statement adds only the new rows', () => {
  const rows = S.parseStatement(HDFC).rows;
  const first = S.mergeLedger([], S.toLedger(rows, { batch: 'a' }));
  assert.strictEqual(first.added, 5);
  const again = S.mergeLedger(first.merged, S.toLedger(rows, { batch: 'b' }));
  assert.deepStrictEqual([again.added, again.duplicates, again.merged.length], [0, 5, 5]);
  const more = S.parseStatement(HDFC + '\r\n06/09/25,UPI-CHAI,0000333,06/09/25,40.00,,108310.00');
  const overlap = S.mergeLedger(first.merged, S.toLedger(more.rows, { batch: 'c' }));
  assert.deepStrictEqual([overlap.added, overlap.duplicates], [1, 5]);
  assert.strictEqual(overlap.merged[5].desc, 'UPI-CHAI');
});

test('mergeLedger: two identical payments on one day are both kept, and counted correctly on later imports', () => {
  const rows = (n) => S.parseStatement('Date,Narration,Debit,Credit\n' + Array.from({ length: n }, () => '01/10/2025,UPI-TEA STALL,10,').join('\n')).rows;
  const one = S.mergeLedger([], S.toLedger(rows(2), { batch: 'x' }));
  assert.strictEqual(one.added, 2);                                                            // two teas, both real
  assert.strictEqual(S.mergeLedger(one.merged, S.toLedger(rows(2), { batch: 'y' })).added, 0);
  assert.strictEqual(S.mergeLedger(one.merged, S.toLedger(rows(3), { batch: 'z' })).added, 1);   // a file with three teas holds one we did not have
});

test('mergeLedger: existing records of other shapes are never matched or changed, and junk input is safe', () => {
  const quick = { amount: 450, category: 'need_food', type: 'need_food', label: 'lunch', date: '2025-09-01' };     // quick-capture shape
  const led = S.toLedger([{ date: '2025-09-01', desc: 'lunch', type: 'debit', amount: 450 }], { batch: 'q' });
  const r = S.mergeLedger([quick, null, 5, 'x', {}], led);
  assert.strictEqual(r.added, 1);                                                              // a different record shape is not a duplicate
  assert.strictEqual(r.merged[0], quick);
  for (const junk of [null, undefined, 'x', 5, {}]) assert.doesNotThrow(() => S.mergeLedger(junk, null));
  assert.deepStrictEqual(S.mergeLedger(undefined, undefined), { merged: [], added: 0, duplicates: 0 });
});

test('undoBatch: removes exactly that import and nothing else', () => {
  const a = S.mergeLedger([], S.toLedger(S.parseStatement(HDFC).rows, { batch: 'a' })).merged;
  const keep = { id: 'mine', type: 'debit', amount: 99, desc: 'manual', date: '2025-09-09', src: 'manual' };
  const both = S.mergeLedger(a.concat(keep), S.toLedger(S.parseStatement(SBI).rows, { batch: 'b' })).merged;
  const undone = S.undoBatch(both, 'b');
  assert.strictEqual(undone.length, 6);
  assert.ok(undone.includes(keep) && undone.every((t) => t.batch !== 'b'));
  assert.deepStrictEqual(S.undoBatch(undone, 'nope'), undone);
  assert.deepStrictEqual(S.undoBatch(null, 'a'), []);
  assert.strictEqual(S.undoBatch([{ id: 'x', batch: 'a' }], 'a').length, 1);                   // a record not marked src:'import' is never removed
});

test('topCategories: debits only, largest first', () => {
  const rows = S.parseStatement(HDFC).rows;
  const top = S.topCategories(rows, 3);
  assert.deepStrictEqual(top.map((c) => c.category), ['EMI & Loans', 'Other', 'Food & Dining']);        // 25,000 / (1,200 PhonePe + 5,000 ATM = 6,200) / 450
  assert.strictEqual(top[1].amount, 6200);
});

test('a hostile file cannot inject markup into descriptions beyond plain text, and a huge file is capped', () => {
  const r = S.parseStatement('Date,Narration,Debit,Credit\n01/10/2025,"<img src=x onerror=alert(1)>",10,\n');
  assert.strictEqual(r.rows[0].desc, '<img src=x onerror=alert(1)>');                           // kept as text; the page escapes it when shown
  const big = 'Date,Narration,Debit,Credit\n' + Array.from({ length: S.MAX_ROWS + 50 }, (_, i) => `01/10/2025,Row ${i},1,`).join('\n');
  const rb = S.parseStatement(big);
  assert.strictEqual(rb.rows.length, S.MAX_ROWS);
  assert.match(rb.warnings.join(' '), /first 20000 rows/);
});

/* ── investments are saved, not spent ────────────────────────────────────────────────────────────────────────── */
test('debits to brokers, fund houses and retirement accounts are categorised as savings, so they never count as spending', () => {
  const debit = (desc) => ({ type: 'debit', amount: 5000, desc, date: '2025-09-02' });
  const saved = ['UPI-ZERODHA BROKING LTD-ZERODHA@YESB', 'NACH DR-AMFI-SIP-HDFC MUTUAL FUND', 'GROWW INVEST TECH PVT LTD', 'IMPS-ICCL-UPSTOX-FUNDS', 'NEFT-PPF DEPOSIT SBI',
    'ACH D- NPS TRUST-A/C 1234', 'UPI/PAYTM MONEY/BUY', 'SIP KFINTECH ECS'];
  saved.forEach((d) => assert.strictEqual(S.categorize(debit(d)), 'Savings & Investments', d));
  // and the budget module agrees: kind 'saving', so monthSpend ignores it
  const led = S.toLedger(saved.map(debit).concat([{ type: 'debit', amount: 450, desc: 'UPI-ZOMATO-ORDER', date: '2025-09-02' }]), { batch: 'b1' });
  const norm = B.normalizeAll(led);
  assert.strictEqual(norm.filter((t) => t.kind === 'saving').length, saved.length);
  assert.strictEqual(B.monthSpend(norm, '2025-09').total, 450);
});

test('names that merely contain an investment word, and ordinary spending, are not mistaken for investments', () => {
  const cat = (d, type) => S.categorize({ type: type || 'debit', amount: 100, desc: d, date: '2025-09-02' });
  assert.notStrictEqual(cat('UPI-STOCKHOLM CAFE-CHAI'), 'Savings & Investments');
  assert.notStrictEqual(cat('UPI-ZOMATO-LUNCH'), 'Savings & Investments');
  assert.notStrictEqual(cat('UPI-RAHUL S-PAID VIA PHONEPE'), 'Savings & Investments');
  assert.notStrictEqual(cat('EMI HDFC HOME LOAN 7890'), 'Savings & Investments');
  assert.strictEqual(cat('ZERODHA PAYOUT', 'credit'), 'Income');                    // a credit keeps its old reading
});

test('the preview\'s biggest spending leaves out money that was invested', () => {
  const rows = [{ type: 'debit', amount: 20000, desc: 'ZERODHA', date: '2025-09-01' }, { type: 'debit', amount: 300, desc: 'UPI-ZOMATO', date: '2025-09-01' }];
  const top = S.topCategories(rows, 5);
  assert.deepStrictEqual(top.map((t) => t.category), ['Food & Dining']);
});
