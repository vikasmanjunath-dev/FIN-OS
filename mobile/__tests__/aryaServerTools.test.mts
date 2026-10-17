// The public-market tools: what is sent, how results are worded, and that no buy/sell wording is passed on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverCallFor, formatServer, missingFor, plainSignal } from '../lib/aryaServerTools.ts';

const NOW = Date.UTC(2026, 9, 16, 9, 0);
const fmt = (tool: any, args: any, name: any, result: any, ts: number | null = 1792175330) => formatServer(serverCallFor(tool, args)!, result, ts, NOW);

test('a call carries a public symbol, coin or fund words only, and says so', () => {
  assert.deepEqual(serverCallFor('quote', { symbol: 'RELIANCE' })!.args, { symbol: 'RELIANCE', exchange: 'NSE' });
  assert.equal(serverCallFor('quote', { symbol: 'my house' }), null);
  assert.equal(serverCallFor('quote', {}), null);
  assert.deepEqual(serverCallFor('market', {})!.args, {});
  assert.deepEqual(serverCallFor('crypto', { query: 'ethereum' })!.args, { coins: ['ethereum'] });
  assert.equal(serverCallFor('mf_nav', { query: '120503' })!.name, 'get_mf_nav');
  assert.equal(serverCallFor('mf_nav', { query: 'parag parikh flexi' })!.name, 'search_mf');
  assert.equal(serverCallFor('net_worth', {}), null);
  for (const c of [serverCallFor('quote', { symbol: 'TCS' }), serverCallFor('market', {}), serverCallFor('news', {})]) assert.ok(c!.sends.length > 10);
  assert.match(missingFor('quote', {})!, /Which share/);
});

test('quote, market, commodities, crypto, fx are worded the same way every time; bad shapes give null', () => {
  assert.equal(fmt('quote', { symbol: 'TCS' }, 'get_quote', { symbol: 'TCS', name: 'Tata Consultancy', price: 3912.5, change: -12.3, change_pct: -0.31 })!.text, 'TCS (Tata Consultancy) last traded at ₹3,912.50 (-12.30, -0.31%).');
  assert.match(fmt('market', {}, '', { indices: { 'NIFTY 50': { price: 24500.1, change: 50, change_pct: 0.2 } } })!.text, /NIFTY 50: 24,500.1 \(\+50.00, \+0.20%\)/);
  const gold = fmt('commodities', {}, '', { commodities: { 'GOLD (10g, global equiv.)': { price: 127735, unit: '₹/10g', change_pct: 0.34, note: 'global futures price converted to INR, not MCX\'s actual quote', price_date: '2026-10-16' } }, unavailable: {}, as_of: 1792175330 })!;
  assert.match(gold.text, /₹1,27,735 \/10g \(\+0.34%\), price of 2026-10-16/);
  assert.match(gold.text, /not MCX/);
  assert.match(fmt('crypto', {}, '', { crypto: { bitcoin: { name: 'Bitcoin', price_inr: 5400000, change_24h: 1.234 } } })!.text, /Bitcoin: ₹54,00,000 \(\+1.2% in 24h\)/);
  assert.match(fmt('fx', {}, '', { USD_INR: 83.1234 })!.text, /USD to INR: 83.12/);
  [null, {}, { error: 'x' }, { price: 'abc', symbol: 'A' }, 'text', 5].forEach(r => assert.equal(fmt('quote', { symbol: 'TCS' }, '', r), null));
});

test('every result carries the time it was fetched', () => {
  assert.equal(fmt('quote', { symbol: 'TCS' }, '', { symbol: 'TCS', price: 1 }, 1792175330)!.asOf, 1792175330000);
  assert.equal(fmt('quote', { symbol: 'TCS' }, '', { symbol: 'TCS', price: 1 }, null)!.asOf, NOW);
});

test('technical indicators: the server\'s buy/sell wording and verdict are not passed on', () => {
  const r = fmt('technical', { symbol: 'TCS' }, '', { symbol: 'TCS', exchange: 'NSE', verdict: 'SELL', score: 33, signals: {
    RSI: { value: 74.02, signal: 'OVERBOUGHT (SELL)' }, MACD: { crossover: 'BULLISH CROSS' }, 'Bollinger Bands': { signal: 'NEAR UPPER BAND (SELL)' }, 'EMA Cross': { signal: 'BEARISH (20<50)' },
    ADX: { value: 27.5, signal: 'STRONG TREND' }, Supertrend: { signal: 'BULLISH (price above band)' }, Volume: { signal: 'HIGH VOLUME' } } })!;
  assert.ok(!/\b(buy|sell|hold)\b/i.test(r.text), r.text);
  assert.ok(!/verdict|score/i.test(r.text));
  assert.match(r.text, /not a recommendation/);
  assert.equal(plainSignal('OVERSOLD (BUY)'), 'oversold');
});

test('fund NAV, news and announcements', () => {
  assert.match(fmt('mf_nav', { query: 'parag' }, '', { results: [{ scheme_name: 'Parag Parikh Flexi Cap - Direct Growth', nav: 85.1234, date: '15-Oct-2026' }] })!.text, /NAV ₹85.1234 on 15-Oct-2026/);
  assert.match(fmt('mf_nav', { query: 'zzz' }, '', { results: [] })!.text, /No fund matched/);
  const n = fmt('news', {}, '', { articles: [{ title: 'Markets close higher', source: 'Mint', published_ts: 1792174495 }] })!;
  assert.match(n.text, /Markets close higher \(Mint, /);
  assert.match(n.text, /not Arya's view/);
  assert.match(fmt('announcements', { symbol: 'TCS' }, '', { announcements: [{ symbol: 'TCS', subject: 'Board meeting', date: '16-Oct' }] })!.text, /TCS: Board meeting \(16-Oct\)/);
});
