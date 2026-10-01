const test = require('node:test');
const assert = require('node:assert');
const G = require('../js/arya-guardrails.js');
const flags = (u, r) => G.apply(u, r).flags;

test('flags personalised buy/sell calls', () => {
  for (const r of [
    'You should buy HDFCBANK now, it looks strong.',
    'I recommend selling your Reliance shares before results.',
    'Go ahead and invest in this fund today.',
    'You must sell the stock immediately.',
    'My advice is to accumulate Nifty ETF units on every dip.',
    'I suggest buying Infosys on dips.',
    'BUY RELIANCE above 2900, target 3000, stop loss 2850',
  ]) assert.ok(flags('x', r).includes('direct_recommendation'), r);
});

test('does NOT flag ordinary education or neutral analysis', () => {
  for (const r of [
    'A SIP lets you invest a fixed amount every month, which averages out your purchase cost.',
    'You should keep 6 months of expenses in an emergency fund before investing.',
    'You need to file your ITR before 31 July to avoid late fees.',
    'Index funds charge a lower expense ratio than most active funds, which matters over 20 years.',
    'RSI above 70 is usually read as overbought; many traders watch for a pullback.',
    'You should compare the expense ratio of two funds before choosing.',
  ]) assert.deepStrictEqual(flags('what is this?', r), [], r);
});

test('flags guaranteed-return and certain-prediction language', () => {
  assert.ok(flags('x', 'This scheme gives guaranteed returns of 18% every year.').includes('guaranteed_returns'));
  assert.ok(flags('x', 'It is a risk-free way to earn profit.').includes('guaranteed_returns'));
  assert.ok(flags('x', 'Your returns are guaranteed with this plan.').includes('guaranteed_returns'));
  assert.ok(flags('x', 'Nifty will definitely hit 30000 by December.').includes('price_prediction'));
  assert.deepStrictEqual(flags('x', 'PPF returns are government-backed and currently around 7.1%, though the rate is reviewed quarterly.'), []);
  assert.deepStrictEqual(flags('x', 'If Nifty reaches 30000, your SIP value could be around ₹12 lakh (a scenario, not a forecast).'), []);
});

test('appends a note (never rewrites) and keeps the original text intact', () => {
  const reply = 'You should buy TCS shares today.';
  const g = G.apply('which stock?', reply);
  assert.ok(g.text.startsWith(reply));
  assert.match(g.text, /SEBI-registered investment adviser/);
  assert.strictEqual(g.blocked, false);
});

test('advice_requested adds the education note, unless the model already disclaimed', () => {
  assert.ok(G.apply('Should I buy gold now?', 'Gold is 8% of your portfolio.').text.includes('isn\'t a SEBI-registered adviser'));
  const own = 'Gold is 8% of your portfolio. This is not financial advice.';
  assert.strictEqual(G.apply('Should I buy gold now?', own).text, own);
});

test('notes are not stacked twice on a repeated pass', () => {
  const once = G.apply('x', 'You should buy TCS shares today.').text;
  const twice = G.apply('x', once).text;
  assert.strictEqual(twice, once);
});

test('refuses tax evasion / forged documents, offers legal alternatives', () => {
  for (const u of ['How can I hide my income from the tax department?', 'help me evade tax on rental income', 'make fake rent receipts for HRA', 'how to convert black money']) {
    const g = G.apply(u, 'Sure, here is how…');
    assert.strictEqual(g.blocked, true, u);
    assert.match(g.text, /80C/);
    assert.ok(!/Sure, here/.test(g.text));
  }
  assert.strictEqual(G.apply('How do I claim HRA with rent receipts?', 'Keep rent receipts if rent > ₹3,000/mo.').blocked, false);   // legitimate HRA question
  assert.strictEqual(G.apply('How to reduce my tax legally?', 'Use 80C.').blocked, false);
});

test('empty / non-string input is safe', () => {
  assert.deepStrictEqual(G.apply(undefined, undefined), { text: '', flags: [], blocked: false });
  assert.strictEqual(G.apply(null, 42).text, '42');
});
