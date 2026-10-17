import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitBySector, sectorConcentration, topHolding, UNMAPPED, FUNDS, toTreeGroups, concentrationBand } from '../lib/portfolioSectors.ts';
import { toView, normaliseHolding, fromRemote, type Holding } from '../lib/holdings.ts';
import { layoutTwoLevel, tileFill } from '../lib/portfolioTreemap.ts';
import { newsByHolding, mentions, namePhrases } from '../lib/portfolioNews.ts';
import type { NewsArticle } from '../lib/marketData.ts';

const H = (type: Holding['type'], symbol: string, units: number, avg: number, last?: number): Holding => ({ id: `${type}:${symbol}`, type, symbol, name: symbol, units, avgPrice: avg, lastPrice: last });
const near = (a: number, b: number, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('a stock the source did not name is Unmapped: the ticker is never used to guess a sector', () => {
  const views = [H('Stock', 'INDIGO', 10, 100, 100), H('Stock', 'HDFCBANK', 10, 100, 100), H('Stock', 'BANKBEES', 10, 100, 100)].map(toView);
  const s = splitBySector(views, { HDFCBANK: 'Financial Services' });
  assert.equal(s.groups.find(g => g.sector === 'Financial Services')!.cells.length, 1);
  const un = s.groups.find(g => g.sector === UNMAPPED)!;
  assert.deepEqual(un.cells.map(c => c.symbol).sort(), ['BANKBEES', 'INDIGO']);
  assert.equal(un.kind, 'unmapped'); assert.equal(s.unmappedStocks, 2); assert.equal(s.mappedStocks, 1);
});

test('funds sit together, weights add to 100, named sectors come first, gain uses priced holdings only', () => {
  const views = [H('Stock', 'A', 10, 100, 120), H('Stock', 'B', 10, 100, 80), H('MF', '1234', 100, 10, 12), H('Stock', 'C', 5, 100)].map(toView);   // C has no live price
  const s = splitBySector(views, { A: 'Tech', B: 'Tech', C: 'Energy' });
  near(s.groups.reduce((t, g) => t + g.weightPct, 0), 100);
  assert.deepEqual(s.groups.map(g => g.sector), ['Tech', 'Energy', FUNDS]);
  near(s.groups[0].gainPct!, 0);                     // +200 and -200 on 2000 cost
  assert.equal(s.groups[1].gainPct, null);           // Energy has only an unpriced holding: no gain figure, not 0
  assert.equal(s.unpriced, 1);
  assert.equal(s.groups[1].cells[0].gainPct, null);
  near(s.groups[2].gainPct!, 20);
});

test('concentration covers named sectors only; empty and unnamed portfolios give null', () => {
  const views = [H('Stock', 'A', 10, 100, 100), H('Stock', 'B', 10, 100, 100), H('Stock', 'C', 10, 100, 100)].map(toView);
  const s = splitBySector(views, { A: 'X', B: 'Y', C: null });
  const c = sectorConcentration(s)!;
  near(c.hhi, 5000); assert.equal(c.effectiveN, 2); assert.equal(c.band, 'concentrated'); assert.equal(c.named, 2);
  assert.equal(sectorConcentration(splitBySector(views, {})), null);
  assert.equal(concentrationBand(999), 'spread out'); assert.equal(concentrationBand(2500), 'moderate'); assert.equal(concentrationBand(2501), 'concentrated');
  assert.equal(topHolding(splitBySector([], {})), null);
});

test('zero-value holdings are not drawn; the treemap tiles cover each group and stay inside the box', () => {
  const views = [H('Stock', 'A', 10, 100, 100), H('Stock', 'Z', 0, 100, 100), H('Stock', 'B', 5, 100, 100), H('MF', '9', 7, 10, 10)].map(toView);
  const s = splitBySector(views, { A: 'X', B: 'X' });
  assert.ok(!s.groups.flatMap(g => g.cells).some(c => c.symbol === 'Z'));
  const placed = layoutTwoLevel(toTreeGroups(s), 400, 300);
  for (const g of placed) {
    assert.ok(g.x >= -1e-9 && g.y >= -1e-9 && g.x + g.w <= 400 + 1e-6 && g.y + g.h <= 300 + 1e-6);
    for (const l of g.leaves) assert.ok(l.x >= g.x - 1e-6 && l.y >= g.y - 1e-6 && l.x + l.w <= g.x + g.w + 1e-6 && l.y + l.h <= g.y + g.h + 1e-6);
  }
  near(placed.reduce((t, g) => t + g.w * g.h, 0), 400 * 300, 1e-6);
});

test('holdings with overflowing unit-value products are rejected before analytics can show Infinity', () => {
  assert.equal(normaliseHolding({ type: 'Stock', symbol: 'HUGE', units: 1e308, avgPrice: 1e308 }), null);
  assert.equal(normaliseHolding({ type: 'Stock', symbol: 'HUGE', units: 1e308, avgPrice: 1, lastPrice: 1e308 }), null);
  assert.equal(fromRemote({ symbol: 'HUGE', asset_type: 'equity', quantity: 1e308, avg_price: 1e308, current_price: null, name: 'Huge', sip_monthly: null, updated_at: null }), null);
});

test('tile colours: grey for unknown, slate at zero, and never the same for a gain and a loss', () => {
  assert.equal(tileFill(null), '#4b5563');
  assert.equal(tileFill(0), 'rgb(55,65,81)');
  assert.notEqual(tileFill(10), tileFill(-10));
  assert.equal(tileFill(500), tileFill(30));
});

const art = (title: string, summary = '', sentiment: NewsArticle['sentiment'] = 'neutral'): NewsArticle =>
  ({ id: title, title, summary, url: null, source: 's', sentiment, score: null, tags: [], publishedMs: null });

test('headline matching: name phrases and capital tickers, not generic words or lower-case look-alikes', () => {
  assert.deepEqual(namePhrases('Reliance Industries Ltd'), ['reliance industries']);
  assert.deepEqual(namePhrases('Infosys Limited'), ['infosys']);
  assert.deepEqual(namePhrases('Bank'), []);
  assert.deepEqual(namePhrases('ITC'), []);
  const rel = { key: 'k', symbol: 'RELIANCE', name: 'Reliance Industries Ltd' };
  assert.ok(mentions('Reliance Industries posts record profit', rel));
  assert.ok(mentions('Shares of RELIANCE rose', rel));
  assert.ok(!mentions('Reliance on imports is rising', rel));
  const itc = { key: 'k2', symbol: 'ITC', name: 'ITC' };
  assert.ok(mentions('ITC hotels demerger', itc));
  assert.ok(!mentions('The ITCHY stock', itc));
});

test('portfolio news counts only the feed\'s own labels and lists holdings with no headline as quiet', () => {
  const arts = [art('Infosys wins big deal', '', 'bullish'), art('Infosys and TCS face margin pressure', '', 'bearish'), art('Markets flat', '', 'neutral'), art('TCS unrated', '', null)];
  const hs = [{ key: 'a', symbol: 'INFY', name: 'Infosys Ltd' }, { key: 'b', symbol: 'TCS', name: 'Tata Consultancy Services' }, { key: 'c', symbol: 'WIPRO', name: 'Wipro' }];
  const r = newsByHolding(arts, hs);
  assert.equal(r.matchedArticles, 3); assert.equal(r.totalArticles, 4);
  assert.deepEqual(r.quiet.map(q => q.symbol), ['WIPRO']);
  assert.deepEqual(r.overall, { bullish: 1, bearish: 1, neutral: 0, unrated: 1, total: 3 });
  assert.equal(r.rows[0].holding.symbol, 'INFY');
});
