const test = require('node:test');
const assert = require('node:assert');
const B = require('../js/finos-budget.js');

const NOW = new Date(2026, 9, 12, 10, 0, 0);          // 12 Oct 2026 (31-day month)

test('normalize: quick-capture shape (need_/want_/save_ keys)', () => {
  const t = B.normalize({ amount: 450, category: 'need_food', type: 'need_food', label: 'lunch', date: '2026-10-03', ts: 1 });
  assert.deepStrictEqual([t.kind, t.category, t.amount, t.date], ['expense', 'Food & Dining', 450, '2026-10-03']);
  assert.strictEqual(B.normalize({ amount: 3000, category: 'save_investment', type: 'save_investment', date: '2026-10-03' }).kind, 'saving');
  assert.strictEqual(B.normalize({ amount: 800, category: 'want_entertainment', type: 'want_entertainment', date: '2026-10-03' }).category, 'Entertainment');
  assert.strictEqual(B.normalize({ amount: 600, category: 'need_utilities', type: 'need_utilities', date: '2026-10-03' }).category, 'Bills & Utilities');
});

test('normalize: Account Aggregator shape (credit/debit + labels + ISO timestamps)', () => {
  const d = B.normalize({ id: 'x1', type: 'debit', category: 'Food & Dining', desc: 'SWIGGY ORDER', amount: 399, date: '2026-10-05T13:30:00+05:30' });
  assert.deepStrictEqual([d.kind, d.category, d.id], ['expense', 'Food & Dining', 'x1']);
  assert.strictEqual(B.normalize({ type: 'credit', category: 'Salary', desc: 'SAL OCT', amount: 90000, date: '2026-10-01' }).kind, 'income');
  assert.strictEqual(B.normalize({ type: 'debit', category: 'Investments', desc: 'SIP', amount: 5000, date: '2026-10-01' }).kind, 'saving');
  assert.strictEqual(B.normalize({ type: 'debit', category: 'EMI / Loans', desc: 'HDFC EMI', amount: 21000, date: '2026-10-05' }).category, 'EMI & Loans');
});

test('normalize: voice-journal shape — savings tagged type:"income" are NOT income', () => {
  const sip = B.normalize({ type: 'income', category: 'investment', description: 'SIP 5000', amount: 5000, date: '2026-10-02' });
  assert.strictEqual(sip.kind, 'saving');
  const saved = B.normalize({ type: 'income', category: 'savings', description: 'saved', amount: 2000, date: '2026-10-02' });
  assert.strictEqual(saved.kind, 'saving');
  assert.strictEqual(B.normalize({ type: 'income', category: 'income', description: 'bonus', amount: 20000, date: '2026-10-02' }).kind, 'income');
  const g = B.normalize({ type: 'expense', category: 'groceries', description: 'milk bigbasket', amount: 700, date: '2026-10-02' });
  assert.strictEqual(g.category, 'Groceries');
});

test('normalize rejects junk and never throws', () => {
  for (const bad of [null, undefined, 5, 'x', {}, { amount: 0, date: '2026-10-01' }, { amount: 'abc', date: '2026-10-01' }, { amount: 10 }, { amount: 10, date: 'not-a-date' }]) assert.strictEqual(B.normalize(bad), null);
  assert.deepStrictEqual(B.normalizeAll('nope'), []);
  assert.strictEqual(B.normalize({ amount: '₹1,200', date: '2026-10-01', category: 'transport' }).amount, 1200);
  assert.strictEqual(B.normalize({ amount: -300, date: '2026-10-01', category: 'transport' }).amount, 300);      // sign is not meaning
});

test('timestamps map to the LOCAL calendar day (IST must not shift a day)', () => {
  // 00:30 IST on 1 Oct is 19:00 UTC on 30 Sep — a UTC slice would put it in September
  const t = B.normalize({ amount: 100, category: 'food', date: new Date(2026, 9, 1, 0, 30).toISOString() });
  assert.strictEqual(t.date, '2026-10-01');
});

const TX = (cat, amt, day, extra) => ({ amount: amt, category: cat, date: `2026-10-${String(day).padStart(2, '0')}`, ...extra });

test('status: totals only count expenses in the month; SIPs and income never count', () => {
  const txns = [TX('need_food', 4000, 3), TX('need_food', 2000, 9), TX('need_transport', 1500, 4), TX('save_investment', 10000, 1),
    { type: 'credit', category: 'Salary', amount: 90000, date: '2026-10-01' }, TX('need_food', 9999, 1, { date: '2026-09-28' })];
  const st = B.status(txns, { 'Food & Dining': 10000, Transport: 5000 }, NOW);
  assert.strictEqual(st.total.spent, 7500);
  const food = st.rows.find((r) => r.category === 'Food & Dining');
  assert.deepStrictEqual([food.spent, food.limit, food.pct], [6000, 10000, 60]);
  assert.strictEqual(food.state, 'warn');                           // 60% used by day 12 projects to 155% — a pace warning, not an overrun
  assert.strictEqual(food.left, 4000);
});

test('status: states — pace warning, 80% warn, 100% over (day 12 of 31)', () => {
  const s = (amt, now) => B.status([TX('need_food', amt, 2)], { 'Food & Dining': 10000 }, now || NOW).rows[0];
  assert.strictEqual(s(3000).state, 'ok');                          // 30% → projects 7,750 (78%)
  assert.strictEqual(s(4000).state, 'ok');                          // 40% → projects 10,333 (103%): over 100% but not yet >110%
  assert.strictEqual(s(4000).projected, Math.round(4000 / 12 * 31));
  assert.strictEqual(s(4400).state, 'warn');                        // projects 11,367 (114%) → on pace to overshoot
  assert.strictEqual(s(8000).state, 'warn');                        // 80% used
  assert.strictEqual(s(10000).state, 'over');
  assert.strictEqual(s(12500).state, 'over');
  assert.strictEqual(s(6000, new Date(2026, 9, 3)).state, 'ok');    // day 3: too early to extrapolate (and only 60% used)
});

test('status: categories with spend but no limit are listed (limit 0), unlimited rows never alert', () => {
  const st = B.status([TX('want_shopping', 5000, 4)], {}, NOW);
  assert.deepStrictEqual([st.rows[0].category, st.rows[0].limit, st.rows[0].state, st.rows[0].pct], ['Shopping', 0, 'ok', null]);
});

test('suggest: uses the last complete months (avg + 5% headroom, ₹500 steps), else income-based defaults', () => {
  const hist = [
    { amount: 9000, category: 'need_food', date: '2026-09-10' }, { amount: 11000, category: 'need_food', date: '2026-08-10' },
    { amount: 100, category: 'need_transport', date: '2026-09-11' },                        // below ₹300 avg → ignored as noise
    { amount: 5000, category: 'need_food', date: '2026-10-02' },                            // current month is NOT history
  ];
  assert.deepStrictEqual(B.suggest(hist, 80000, NOW), { 'Food & Dining': 10500 });         // avg 10,000 × 1.05
  const d = B.suggest([], 100000, NOW);
  assert.strictEqual(d['Housing'], 25000);
  assert.strictEqual(d['Groceries'], 10000);
  assert.deepStrictEqual(B.suggest([], 0, NOW), {});
});

test('alertEvents: only for warn/over, once per category per level per month, stable keys', () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  globalThis.FinosStore = undefined;
  B.setLimits({ 'Food & Dining': 10000, Transport: 5000, Shopping: 8000 });
  store.finos_transactions = JSON.stringify([TX('need_food', 9200, 5), TX('need_transport', 1000, 5), TX('want_shopping', 8300, 6)]);
  const ev = B.alertEvents(NOW);
  const byTitle = Object.fromEntries(ev.map((e) => [e.title, e]));
  assert.ok(byTitle['Food & Dining budget 92% used'] && byTitle['Food & Dining budget 92% used'].key === 'budget|2026-10|Food & Dining|warn-90');
  assert.ok(byTitle['Shopping budget exceeded']);
  assert.ok(!ev.some((e) => /Transport/.test(e.title)));
  assert.ok(ev.every((e) => e.type === 'budget' && e.once === true && e.date === '2026-10-12'));
  assert.deepStrictEqual(B.alertEvents(NOW).map((e) => e.key), ev.map((e) => e.key));         // deterministic
  delete globalThis.localStorage;
});

test('limits: setLimit / setLimits sanitize; zero or junk removes a limit', () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  globalThis.FinosStore = undefined;
  assert.deepStrictEqual(B.setLimits({ Food: '12,000', Bad: 'abc', Neg: -5 }), { Food: 12000 });
  B.setLimit('Transport', 4000);
  assert.deepStrictEqual(B.getLimits(), { Food: 12000, Transport: 4000 });
  B.setLimit('Food', 0);
  assert.deepStrictEqual(B.getLimits(), { Transport: 4000 });
  delete globalThis.localStorage;
});

test('pace is flagged unreliable in the first week (no "1426%" projections)', () => {
  const early = B.status([TX('need_food', 9200, 2)], { 'Food & Dining': 10000 }, new Date(2026, 9, 2)).rows[0];
  assert.strictEqual(early.pace, false);
  assert.strictEqual(early.state, 'warn');                              // still a warning — 92% is real — just not a projection
  assert.strictEqual(B.status([TX('need_food', 9200, 2)], { 'Food & Dining': 10000 }, NOW).rows[0].pace, true);
});
