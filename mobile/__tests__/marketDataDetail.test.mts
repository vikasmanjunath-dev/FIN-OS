import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cryptoAsset, commodityAsset, commoditySlug, fxAsset, summariseSeries, convertToInr, convertFromInr, cleanCoinId } from '../lib/marketDataDetail.ts';
import { joinValuation, applyValuation, sortValuation, sectorCounts, sameGroup, parseLimit } from '../lib/marketDataScreener.ts';
import { normaliseSectorIndices, mapLeaves, pointsOf, tally } from '../lib/marketDataMap.ts';
import { screenRows, type Quote, type Chart } from '../lib/marketData.ts';

const near = (a: number, b: number, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('symbols: known coins map to Yahoo, Polygon has no chart and says why, junk is refused', () => {
  assert.equal(cryptoAsset('bitcoin')!.yahoo, 'BTC-USD');
  assert.equal(cryptoAsset('matic-network')!.yahoo, null);
  assert.match(cryptoAsset('matic-network')!.noChartReason!, /no data/);
  assert.equal(cryptoAsset('some-new-coin')!.yahoo, null);
  assert.equal(cryptoAsset('../etc'), null); assert.equal(cleanCoinId('BTC'), null);
  assert.equal(commoditySlug('GOLD (10g, global equiv.)'), 'gold'); assert.equal(commoditySlug('CRUDE OIL (bbl)'), 'crude'); assert.equal(commoditySlug('NATURAL GAS'), 'natgas'); assert.equal(commoditySlug('COPPER'), null);
  assert.equal(commodityAsset('gold')!.yahoo, 'GC=F'); assert.equal(commodityAsset('copper'), null);
  assert.equal(fxAsset('USD_INR')!.yahoo, 'USDINR=X'); assert.equal(fxAsset('JPY_INR')!.yahoo, 'JPYINR=X'); assert.equal(fxAsset('XXX_INR'), null); assert.equal(fxAsset('USD_EUR'), null);
});

test('history summary from closes: change, range, drawdown, volatility', () => {
  const closes = [100, 110, 99, 120, 108, 130, 117, 140, 126, 150, 135, 160];
  const c: Chart = { closes, highs: closes, lows: closes, volumes: closes.map(() => 0), dates: closes.map((_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`), currentPrice: 160 };
  const s = summariseSeries(c, 252)!;
  near(s.changePct, 60); assert.equal(s.high, 160); assert.equal(s.low, 99); near(s.fromHighPct, 0); near(s.maxDrawdownPct, -10, 1e-9);
  assert.ok(s.volatilityPct! > 0); assert.equal(s.coarse, false);
  assert.equal(summariseSeries({ ...c, closes: [1] }, 252), null);
  assert.equal(summariseSeries({ ...c, closes: closes.slice(0, 5) }, 252)!.volatilityPct, null);        // under 10 moves: not annualised
  assert.equal(summariseSeries({ ...c, closes: closes.map(x => x / 100) }, 252)!.coarse, true);
});

test('currency conversion is plain multiplication and refuses bad input', () => {
  assert.equal(convertToInr(100, 83.5), 8350); near(convertFromInr(8350, 83.5)!, 100);
  assert.equal(convertToInr(-1, 83), null); assert.equal(convertToInr(1, 0), null); assert.equal(convertFromInr(NaN, 83), null);
});

const quote = (symbol: string, price: number, over: Partial<Quote> = {}): Quote => ({ symbol, name: symbol, exchange: 'NSE', price, change: null, changePct: 1, open: null, high: null, low: null, prevClose: null, volume: null, marketCap: null, week52High: null, week52Low: null, peRatio: null, priceToBook: null, source: '', ...over });
const fund = (symbol: string, sector: string | null, industry: string | null, pe: number | null, pb: number | null) => ({ symbol, name: null, sector, industry, peRatio: pe, peNote: null, peCrossChecked: null, priceToBook: pb, epsTtm: null, marketCap: 1, source: '' });

test('valuation filters: a missing figure never passes a limit; sorting puts missing last; peers use the source\'s own grouping', () => {
  const rows = screenRows([quote('A', 10), quote('B', 10), quote('C', 10), quote('D', 10)]);
  const v = joinValuation(rows, { A: fund('A', 'Tech', 'IT Services', 14, 1.5), B: fund('B', 'Tech', 'IT Services', null, 3), C: fund('C', 'Energy', 'Oil', 30, 4) });
  assert.deepEqual(applyValuation(v, { sector: null, peMax: 20, pbMax: null, preset: 'none' }).map(r => r.symbol), ['A']);
  assert.deepEqual(applyValuation(v, { sector: 'Tech', peMax: null, pbMax: null, preset: 'none' }).map(r => r.symbol), ['A', 'B']);
  assert.deepEqual(applyValuation(v, { sector: null, peMax: null, pbMax: null, preset: 'deep_value' }).map(r => r.symbol), ['A']);
  assert.deepEqual(sortValuation(v, 'pe', false).map(r => r.symbol), ['A', 'C', 'B', 'D']);
  assert.deepEqual(sortValuation(v, 'pe', true).map(r => r.symbol), ['C', 'A', 'B', 'D']);
  assert.deepEqual(sectorCounts(v), [{ sector: 'Tech', count: 2 }, { sector: 'Energy', count: 1 }]);
  assert.equal(v[3].loaded, false);
  const g = sameGroup({ symbol: 'A', industry: 'IT Services', sector: 'Tech' }, v)!;
  assert.equal(g.by, 'industry'); assert.deepEqual(g.peers.map(p => p.symbol), ['B']);
  assert.equal(sameGroup({ symbol: 'Z', industry: null, sector: null }, v), null);
  assert.equal(parseLimit(''), null); assert.equal(parseLimit('abc'), null); assert.equal(parseLimit('-3'), null); assert.equal(parseLimit(' 15 '), 15);
});

test('market map: sector indices need a numeric change, shares without a market value are listed, not sized', () => {
  const s = normaliseSectorIndices({ sectors: { 'NIFTY IT': { label: 'IT', price: 100, change_pct: 1.5 }, 'NIFTY BANK': { label: 'BANK', change_pct: 'x' }, 'NIFTY AUTO': { label: 'AUTO', change_pct: 0 } }, as_of: 5 });
  assert.deepEqual(s.sectors.map(x => [x.label, x.changePct]), [['IT', 1.5], ['AUTO', 0]]);
  assert.deepEqual(normaliseSectorIndices(null), { sectors: [], asOf: null });
  const m = mapLeaves([quote('A', 1, { marketCap: 5e12 }), quote('B', 1), quote('C', 1, { marketCap: -1 })]);
  assert.deepEqual(m.leaves.map(l => l.id), ['A']); assert.deepEqual(m.unsized, ['B', 'C']);
  assert.deepEqual(pointsOf(['2026-01-01', 'bad', '2026-01-03'], [1, 2, 0]), [{ date: '2026-01-01', close: 1 }]);
  assert.deepEqual(tally([1, -1, 0, null, 2]), { up: 2, down: 1, flat: 1, unknown: 1 });
});
