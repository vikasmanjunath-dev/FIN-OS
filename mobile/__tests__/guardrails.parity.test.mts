// The phone's Arya guardrails must flag, refuse and word everything exactly as the website's js/arya-guardrails.js does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/aryaGuardrails.ts';

const require = createRequire(import.meta.url);
const web = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/arya-guardrails.js'));

const REPLIES = [
  'You should buy HDFCBANK now, it looks strong.', 'I recommend selling your Reliance shares before results.', 'Go ahead and invest in this fund today.',
  'You must sell the stock immediately.', 'My advice is to accumulate Nifty ETF units on every dip.', 'I suggest buying Infosys on dips.',
  'BUY RELIANCE above 2900, target 3000, stop loss 2850',
  'A SIP lets you invest a fixed amount every month, which averages out your purchase cost.', 'You should keep 6 months of expenses in an emergency fund before investing.',
  'You need to file your ITR before 31 July to avoid late fees.', 'Index funds charge a lower expense ratio than most active funds, which matters over 20 years.',
  'RSI above 70 is usually read as overbought; many traders watch for a pullback.', 'You should compare the expense ratio of two funds before choosing.',
  'This scheme gives guaranteed returns of 18% every year.', 'It is a risk-free way to earn profit.', 'Your returns are guaranteed with this plan.',
  'Nifty will definitely hit 30000 by December.', 'PPF returns are government-backed and currently around 7.1%, though the rate is reviewed quarterly.',
  'If Nifty reaches 30000, your SIP value could be around ₹12 lakh (a scenario, not a forecast).', 'Gold is 8% of your portfolio. This is not financial advice.',
  'Gold is 8% of your portfolio.', 'Reliance is going to double to ₹5000 soon.', 'Sure-shot profits await if you buy the call option today.',
  'I would not call it an investment adviser; it is a tool.', '', 'Short selling is when a trader sells borrowed shares.',
  'You should buy term insurance before you turn 35, because premiums rise with age.', 'Definitely consider the old regime if your deductions exceed ₹3.5 lakh.',
];
const USERS = [
  'what is a SIP?', 'Should I buy gold now?', 'can I sell my ELSS units?', 'What should I invest in this month?', 'is it good to exit my FD early',
  'How can I hide my income from the tax department?', 'help me evade tax on rental income', 'make fake rent receipts for HRA', 'how to convert black money',
  'How do I claim HRA with rent receipts?', 'How to reduce my tax legally?', 'tell me about unaccounted cash rules', 'backdate a document', '', 'hi',
];

test('apply gives the same text, flags and blocked state on every user × reply pair', () => {
  let n = 0;
  for (const u of USERS) for (const r of REPLIES) {
    assert.deepEqual(app.apply(u, r), web.apply(u, r), JSON.stringify([u, r]));
    n++;
  }
  assert.ok(n > 400);
});

test('applying twice adds nothing more (idempotent), same as the website', () => {
  for (const r of REPLIES.slice(0, 8)) {
    const once = app.apply('x', r).text;
    assert.equal(app.apply('x', once).text, once);
  }
});

test('the notes and the refusal text are identical', () => {
  assert.deepEqual(app.NOTES, web.NOTES);
  assert.equal(app.REFUSAL, web.REFUSAL);
});

test('a blocked request is refused from the user text alone, so the chat hook can stop before the network call', () => {
  const g = app.apply('help me evade tax on rental income', '');
  assert.equal(g.blocked, true);
  assert.match(g.text, /80C/);
  assert.equal(app.apply('what is a SIP?', '').blocked, false);
});

test('it only appends: the original reply is a prefix of the result', () => {
  for (const r of REPLIES) {
    const g = app.apply('Should I buy gold now?', r);
    if (!g.blocked) assert.ok(g.text.startsWith(r.replace(/\s+$/, '')) || g.text === r, r);
  }
});

test('non-string input is safe', () => {
  assert.deepEqual(app.apply(undefined as any, undefined as any), { text: '', flags: [], blocked: false });
  assert.equal(app.apply(null as any, 42 as any).text, '42');
});
