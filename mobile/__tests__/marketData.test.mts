// Market data normalisers, freshness helpers, fund returns and the screener. Fixtures are shaped like real Arya backend answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../lib/marketData.ts';

const QUOTE = { symbol: 'RELIANCE', name: 'RELIANCE', exchange: 'NSE', price: 1175.800048828125, change: 9.1, change_pct: 0.78, open: 1167.0, high: 1179.0, low: 1162.7,
  prev_close: 1166.7, volume: 3734493, market_cap: 15911481984998.27, pe_ratio: null, price_to_book: null, week52_high: 1611.8, week52_low: 1152.2, source: 'yfinance' };

test('num / pos never turn a missing figure into 0', () => {
  assert.equal(m.num('19.41'), 19.41);
  for (const v of [null, undefined, '', '  ', NaN, Infinity, true, {}, [], 'abc']) assert.equal(m.num(v), null, String(v));
  assert.equal(m.num(0), 0);
  assert.equal(m.pos(0), null);
  assert.equal(m.pos(-3), null);
});

test('quote: full, partial, error shape and junk', () => {
  const q = m.normaliseQuote(QUOTE)!;
  assert.equal(q.symbol, 'RELIANCE');
  assert.equal(q.week52High, 1611.8);
  assert.equal(q.peRatio, null);
  assert.equal(m.normaliseQuote({ error: 'Could not fetch quote for ZZZ', symbol: 'ZZZ' }), null);
  assert.equal(m.normaliseQuote({ symbol: 'X', price: null }), null);
  assert.equal(m.normaliseQuote({ symbol: 'X', price: 0 }), null);
  assert.equal(m.normaliseQuote(null), null);
  assert.equal(m.normaliseQuote('nope'), null);
  const partial = m.normaliseQuote({ symbol: 'abc', price: '250.5' })!;
  assert.equal(partial.symbol, 'ABC');
  assert.equal(partial.price, 250.5);
  assert.equal(partial.changePct, null);
  assert.equal(partial.volume, null);
  assert.equal(partial.name, 'ABC');
});

test('bulk quotes: failures are named, duplicates dropped, empty is empty', () => {
  const r = m.normaliseQuotes({ quotes: [QUOTE, { error: 'x', symbol: 'BAD' }, QUOTE], truncated: true }, ['reliance', 'bad', 'tcs']);
  assert.equal(r.quotes.length, 1);
  assert.deepEqual(r.failed, ['BAD', 'TCS']);
  assert.equal(r.truncated, true);
  assert.deepEqual(m.normaliseQuotes({ quotes: [] }).quotes, []);
  assert.deepEqual(m.normaliseQuotes({ error: 'down' }).quotes, []);
  assert.deepEqual(m.normaliseQuotes(undefined).quotes, []);
});

test('overview: NSE strings become numbers, rows without a price are left out, change stays null when absent', () => {
  const o = m.normaliseOverview({ indices: {
    'NIFTY 50': { price: 22685.6, change: -36.35, change_pct: -0.16, high: 22757.95, low: 22663.8, year_high: 26373.2, year_low: 22179.9, pe: '19.41', pb: 2.79, dividend_yield: 1.51, source: 'nse_api' },
    SENSEX: { price: 73069.04, change: null, change_pct: null, source: 'yfinance' },
    'INDIA VIX': { price: null },
  }, as_of: 1791957654 });
  assert.equal(o.indices['NIFTY 50'].pe, 19.41);
  assert.equal(o.indices.SENSEX.changePct, null);
  assert.ok(!('INDIA VIX' in o.indices));
  assert.equal(o.asOf, 1791957654);
  assert.deepEqual(m.normaliseOverview({ error: 'x' }).indices, {});
});

const NEWS = { articles: [
  { id: 'a', title: 'Nifty rallies as bank stocks surge &amp; IT gains', summary: 'Strong earnings &lt;lift&gt; markets', url: 'https://example.test/a', source: 'Mint Markets',
    sentiment: 'bullish', sentiment_score: 0.5, tags: ['nifty', 'IPO'], published_ts: 1791950000 },
  { id: 'b', title: 'Sensex slips', url: 'javascript:alert(1)', source: '', sentiment: 'sad', tags: 'not-a-list', published_ts: 1791956910 },
  { id: 'c', title: '   ', url: 'https://example.test/c' },
  { id: 'a', title: 'duplicate', url: 'https://example.test/dup' },
  null,
], sentiment: { score: 0.088, label: 'neutral', bullish: 19, bearish: 11, neutral: 10, total: 40 },
sentiment_method: 'Keyword rules ...', sources: { at: null, feeds_ok: 3, feeds_failed: 2, feeds_total: 5 }, as_of: 1791957800 };

test('news: entities decoded, unsafe links dropped, newest first, odd sentiment is "not scored"', () => {
  const f = m.normaliseNews(NEWS);
  assert.deepEqual(f.articles.map(a => a.id), ['b', 'a']);
  const a = f.articles.find(x => x.id === 'a')!;
  assert.equal(a.title, 'Nifty rallies as bank stocks surge & IT gains');
  assert.equal(a.summary, 'Strong earnings <lift> markets');
  assert.deepEqual(a.tags, ['NIFTY', 'IPO']);
  assert.equal(a.publishedMs, 1791950000 * 1000);
  const b = f.articles.find(x => x.id === 'b')!;
  assert.equal(b.url, null);
  assert.equal(b.sentiment, null);
  assert.deepEqual(b.tags, []);
  assert.equal(b.source, 'Unknown source');
  assert.equal(f.overall?.label, 'neutral');
  assert.deepEqual(f.sources, { ok: 3, failed: 2, total: 5 });
});

test('news: error shape, empty list and missing sources', () => {
  for (const raw of [{ error: 'x' }, null, 'x', { articles: [] }, {}]) {
    const f = m.normaliseNews(raw);
    assert.deepEqual(f.articles, []);
    assert.equal(f.overall, null);
    assert.equal(f.sources, null);
  }
});

test('news tags: counted, filtered', () => {
  const f = m.normaliseNews({ articles: [
    { id: '1', title: 'a', tags: ['RBI', 'INR'] }, { id: '2', title: 'b', tags: ['RBI'] }, { id: '3', title: 'c', tags: [] }] });
  assert.deepEqual(m.tagCounts(f.articles), [{ tag: 'RBI', count: 2 }, { tag: 'INR', count: 1 }]);
  assert.deepEqual(m.filterNews(f.articles, 'RBI').map(a => a.id), ['1', '2']);
  assert.equal(m.filterNews(f.articles, null).length, 3);
});

test('safeWebUrl and decodeEntities', () => {
  assert.equal(m.safeWebUrl('https://a.test/x?y=1'), 'https://a.test/x?y=1');
  for (const u of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://x', '', null, 'not a url', 'https://a b']) assert.equal(m.safeWebUrl(u), null, String(u));
  assert.equal(m.decodeEntities('M&amp;M &#8377;100 &#x20B9; &unknown;'), 'M&M ₹100 ₹ &unknown;');
});

test('commodities: converted gold, USD-only crude, and the "unavailable" gold when no live rate', () => {
  const ok = m.normaliseCommodities({ commodities: {
    'GOLD (10g, global equiv.)': { price: 127517, unit: '₹/10g', change_pct: 0.01, note: "global futures price converted to INR, not MCX's actual quote", price_usd: 4177.6, usd_unit: 'USD/oz', usd_inr: 94.94, price_date: '2026-10-14' },
    'CRUDE OIL (bbl)': { price: 94.52, unit: 'USD/bbl', change_pct: null },
    'BROKEN': { price: null, unit: 'x' },
  }, unavailable: {}, as_of: 1791957910 });
  assert.equal(ok.items.length, 2);
  assert.equal(ok.items[0].converted, true);
  assert.equal(ok.items[0].label, 'Gold');
  assert.equal(ok.items[1].converted, false);
  assert.equal(ok.items[1].changePct, null);
  const no = m.normaliseCommodities({ commodities: {}, unavailable: { 'GOLD (10g, global equiv.)': { reason: 'The USD/INR rate could not be fetched', price_usd: 4100, usd_unit: 'USD/oz', change_pct: 0.3 } } });
  assert.equal(no.items.length, 0);
  assert.equal(no.unavailable[0].priceUsd, 4100);
  assert.deepEqual(m.normaliseCommodities({ error: 'x' }).items, []);
  assert.deepEqual(m.normaliseCommodities(undefined).unavailable, []);
});

test('fx: pairs ordered, junk and error key ignored, error when nothing usable', () => {
  const f = m.normaliseFx({ JPY_INR: 0.5994, USD_INR: 94.94, EUR_INR: 106.3613, error: 'ignored', BAD: 3, GBP_INR: 0, AED_INR: 'x' });
  assert.deepEqual(f.rates.map(r => r.pair), ['USD_INR', 'EUR_INR', 'JPY_INR']);
  assert.equal(f.error, null);
  const e = m.normaliseFx({ error: 'FX rates unavailable: the rate source could not be reached' });
  assert.deepEqual(e.rates, []);
  assert.match(e.error!, /unavailable/);
  assert.deepEqual(m.normaliseFx(null).rates, []);
  assert.deepEqual(m.normaliseFx({}).rates, []);
});

test('crypto: missing fields stay null, coins with no price are skipped, error shape', () => {
  const c = m.normaliseCrypto({ crypto: {
    bitcoin: { name: 'Bitcoin', price_inr: 7916785, price_usd: 83446, change_24h: -0.49, market_cap_inr: 1.59e14, last_updated: 1791957000 },
    ripple: { name: 'XRP', price_inr: 129.38 },
    ghost: { name: 'Ghost' },
  }, as_of: 5 });
  assert.equal(c.coins.length, 2);
  assert.equal(c.coins[1].priceUsd, null);
  assert.equal(c.coins[1].change24h, null);
  assert.equal(c.coins[0].updatedMs, 1791957000 * 1000);
  const e = m.normaliseCrypto({ error: 'Crypto price source could not be reached' });
  assert.deepEqual(e.coins, []);
  assert.match(e.error!, /could not be reached/);
});

test('chart: aligned arrays, bad closes dropped from every array, too short is null', () => {
  const c = m.normaliseChart({ closes: [10, null, 12, 'x', 14], highs: [11, 99, 13, 99, 15], lows: [9, 1, 11, 1, 13], volumes: [100, 200, null, 300, 400],
    dates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05T00:00:00'], currentPrice: 14.2 })!;
  assert.deepEqual(c.closes, [10, 12, 14]);
  assert.deepEqual(c.highs, [11, 13, 15]);
  assert.deepEqual(c.volumes, [100, 0, 400]);
  assert.deepEqual(c.dates, ['2026-10-01', '2026-10-03', '2026-10-05']);
  const st = m.chartStats(c)!;
  assert.equal(st.changePct, 40);
  assert.equal(st.max, 15);
  assert.equal(st.min, 9);
  assert.equal(m.normaliseChart({ closes: [10] }), null);
  assert.equal(m.normaliseChart({ error: 'No data for X' }), null);
  assert.equal(m.normaliseChart({}), null);
  // arrays shorter than closes (no dates from an older backend) still work
  const nd = m.normaliseChart({ closes: [1, 2, 3] })!;
  assert.deepEqual(nd.dates, ['', '', '']);
  assert.deepEqual(nd.highs, [1, 2, 3]);
});

test('position helpers return null instead of guessing', () => {
  assert.equal(m.rangePosition(100, 200, 150), 0.5);
  assert.equal(m.rangePosition(100, 200, 250), 1);
  assert.equal(m.rangePosition(null, 200, 150), null);
  assert.equal(m.rangePosition(200, 200, 200), null);
  assert.equal(m.pctFrom(90, 100), -10);
  assert.equal(m.pctFrom(90, null), null);
  assert.equal(m.pctFrom(90, 0), null);
});

test('relative time and as-of labels', () => {
  const now = new Date(2026, 9, 14, 15, 42).getTime();
  assert.equal(m.relativeTime(now - 10_000, now), 'just now');
  assert.equal(m.relativeTime(now + 60_000, now), 'just now');
  assert.equal(m.relativeTime(now - 5 * 60_000, now), '5 min ago');
  assert.equal(m.relativeTime(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(m.relativeTime(now - 2 * 86400_000, now), '2 d ago');
  assert.equal(m.relativeTime(new Date(2026, 8, 1).getTime(), now), '1 Sep');
  assert.equal(m.relativeTime(null, now), 'time not given');
  assert.equal(m.formatAsOf(new Date(2026, 9, 14, 9, 5).getTime(), now), '9:05 am');
  assert.equal(m.formatAsOf(new Date(2026, 9, 14, 0, 30).getTime(), now), '12:30 am');
  assert.equal(m.formatAsOf(new Date(2026, 9, 13, 15, 42).getTime(), now), '13 Oct, 3:42 pm');
});

test('staleness', () => {
  const now = new Date(2026, 9, 14, 15, 42).getTime();
  const fresh = m.staleness(now - 60_000, now, m.FRESH_MS.news)!;
  assert.equal(fresh.stale, false);
  assert.match(fresh.label, /^as of 3:41 pm$/);
  assert.equal(m.staleness(now - 3600_000, now, m.FRESH_MS.news)!.stale, true);
  assert.equal(m.staleness(null, now, 1), null);
  assert.equal(m.staleness(now + 5000, now, 1000)!.ageMs, 0);
});

test('display formats', () => {
  assert.equal(m.fmtPct(0.784), '+0.78%');
  assert.equal(m.fmtPct(-1.236), '−1.24%');
  assert.equal(m.fmtPct(0), '0.00%');
  assert.equal(m.fmtPct(null), 'Not available');
  assert.equal(m.fmtVolume(3734493), '37.34 L');
  assert.equal(m.fmtVolume(12_345_678), '1.23 Cr');
  assert.equal(m.fmtVolume(98765), '98,765');
  assert.equal(m.fmtVolume(null), 'Not available');
  assert.equal(m.fmtMarketCap(15911481984998), '₹15.91 lakh Cr');
  assert.equal(m.fmtMarketCap(4.38e10), '₹4,380 Cr');
  assert.equal(m.fmtPrice(1175.8), '1,175.80');
  assert.equal(m.fmtInr(null), 'Not available');
});

test('tickers and scheme codes', () => {
  assert.equal(m.cleanTicker(' nse:m&m '), 'M&M');
  assert.equal(m.cleanTicker('reliance.ns'), 'RELIANCE');
  assert.equal(m.cleanTicker('bajaj-auto'), 'BAJAJ-AUTO');
  for (const s of ['', '[symbol]', 'a b', '../x', 'X'.repeat(21)]) assert.equal(m.cleanTicker(s), null, s);
  assert.equal(m.cleanSchemeCode('120503'), '120503');
  assert.equal(m.cleanSchemeCode('12'), null);
  assert.equal(m.cleanSchemeCode('abc'), null);
});

// ── funds ──
test('fund NAV and search', () => {
  const f = m.normaliseFundNav({ scheme_code: '119551', scheme_name: 'ABSL Banking & PSU Debt Fund', nav: 106.9563, date: '13-Oct-2026', fund_house: 'ABSL', plan: 'Direct Plan', option: 'IDCW-Re-investment', category: 'Open Ended Schemes(Debt)' })!;
  assert.equal(f.date, '2026-10-13');
  assert.equal(f.nav, 106.9563);
  assert.equal(m.normaliseFundNav({ scheme_code: '1', scheme_name: 'X', nav: null, date: 'garbage' })!.nav, null);
  assert.equal(m.normaliseFundNav({ error: 'Scheme code 1 not found in AMFI data' }), null);
  const s = m.normaliseFundSearch({ results: [{ scheme_code: '1', scheme_name: 'A' }, { scheme_code: '1', scheme_name: 'A' }, { scheme_code: '2' }, 5] });
  assert.deepEqual(s.map(x => x.code), ['1']);
  assert.deepEqual(m.normaliseFundSearch({ results: [] }), []);
  assert.deepEqual(m.normaliseFundSearch(null), []);
  assert.equal(m.isoDate('31-02-2026'), null);
  assert.equal(m.isoDate('29-Feb-2028'), '2028-02-29');
});

/** A fund that grows 10% a year, one NAV on every weekday between two dates. */
function series(start: string, end: string, annual = 0.10, startNav = 100) {
  const out: { date: string; nav: number }[] = [];
  const t0 = Date.parse(start);
  for (let t = t0; t <= Date.parse(end); t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    out.push({ date: d.toISOString().slice(0, 10), nav: startNav * Math.pow(1 + annual, (t - t0) / (365 * 86_400_000)) });
  }
  return out;
}

test('fund returns: known growth gives the known return; short history gives "not available", not a number', () => {
  const pts = series('2020-10-01', '2026-10-13');
  const r = Object.fromEntries(m.fundReturns(pts).map(x => [x.id, x]));
  assert.ok(Math.abs(r['1Y'].pct! - 10) < 0.2, String(r['1Y'].pct));
  assert.ok(Math.abs(r['3Y'].pct! - 10) < 0.2);       // annualised
  assert.ok(Math.abs(r['5Y'].pct! - 10) < 0.2);
  assert.ok(r['1M'].pct! > 0.5 && r['1M'].pct! < 1.2);
  assert.equal(r['5Y'].annualised, true);
  assert.equal(r['1Y'].annualised, false);
  const young = Object.fromEntries(m.fundReturns(series('2025-12-01', '2026-10-13')).map(x => [x.id, x]));
  assert.equal(young['6M'].pct !== null, true);
  assert.equal(young['1Y'].pct, null);
  assert.equal(young['3Y'].pct, null);
  assert.match(young['3Y'].reason!, /newer|go back/);
  assert.deepEqual(m.fundReturns([]), []);
  assert.deepEqual(m.fundReturns([{ date: '2026-10-13', nav: 10 }]), []);
});

test('fund returns: a month-end target date does not overflow, and a gap in history is refused', () => {
  const pts = [{ date: '2026-01-30', nav: 100 }, { date: '2026-02-27', nav: 101 }, { date: '2026-03-31', nav: 103 }];
  const one = m.fundReturns(pts).find(x => x.id === '1M')!;
  assert.equal(one.from!.date, '2026-02-27');          // 31 Mar minus a month is 28 Feb: nearest earlier NAV
  const gap = m.fundReturns([{ date: '2025-10-01', nav: 100 }, { date: '2026-10-13', nav: 110 }]).find(x => x.id === '1Y')!;
  assert.equal(gap.pct, null);                          // the only start NAV is 12 days before the target
});

test('fund history normaliser: sorts, dedupes, drops bad rows, needs two points', () => {
  const h = m.normaliseFundHistory({ scheme_code: '119551', scheme_name: 'X', history: [['2026-10-13', 106.9], ['2026-10-12', 106.8], ['2026-10-12', 106.85], ['bad', 1], ['2026-10-11', 0], ['2026-10-10', null], 'x'],
    earliest_available: '2013-01-02', source: 'AMFI NAVs', amfi_check: { checked: true, matches: true } })!;
  assert.deepEqual(h.points, [{ date: '2026-10-12', nav: 106.85 }, { date: '2026-10-13', nav: 106.9 }]);
  assert.equal(h.amfiCheck.matches, true);
  assert.equal(m.normaliseFundHistory({ history: [['2026-10-13', 1]] }), null);
  assert.equal(m.normaliseFundHistory({ error: 'No NAV history found' }), null);
  assert.equal(m.normaliseFundHistory(null), null);
});

test('IDCW options are flagged, Growth options are not', () => {
  assert.equal(m.isPayoutOption({ name: 'X Fund - Direct Plan - IDCW', option: 'IDCW Option' }), true);
  assert.equal(m.isPayoutOption({ name: 'X Fund', option: 'Growth Option' }), false);
  assert.equal(m.isPayoutOption({ name: 'X Fund - Growth', option: '' }), false);
});

// ── screener ──
const q = (symbol: string, price: number, over: Partial<Record<string, number | null>> = {}) =>
  m.normaliseQuote({ symbol, price, change_pct: 0, prev_close: price, volume: 1000, week52_high: price * 1.25, week52_low: price * 0.8, ...over })!;

test('screener rows: day change, distance from high and low, missing fields stay null', () => {
  const rows = m.screenRows([
    q('AAA', 95, { change_pct: 1.5, week52_high: 100, week52_low: 50 }),
    q('BBB', 80, { change_pct: null, prev_close: 100, week52_high: null, week52_low: null }),
    q('CCC', 50, { change_pct: null, prev_close: null }),
  ]);
  assert.equal(rows[0].dayChangePct, 1.5);
  assert.equal(rows[0].fromHighPct, -5);
  assert.equal(rows[0].fromLowPct, 90);
  assert.equal(rows[0].rangePos, 0.9);
  assert.equal(rows[1].dayChangePct, -20);          // derived from the previous close
  assert.equal(rows[1].fromHighPct, null);
  assert.equal(rows[1].rangePos, null);
  assert.equal(rows[2].dayChangePct, null);
});

test('screener filters and sorting; rows with no value go last either way', () => {
  const rows = m.screenRows([
    q('UP', 100, { change_pct: 2, week52_high: 102, week52_low: 60 }),           // 2% below high
    q('DOWN', 100, { change_pct: -3, week52_high: 150, week52_low: 95 }),        // 5% above low
    q('FLAT', 100, { change_pct: 0, week52_high: 200, week52_low: 20 }),
    q('NONE', 100, { change_pct: null, prev_close: null, week52_high: null, week52_low: null, volume: null }),
  ]);
  const ids = (o: m.ScreenOptions) => m.applyScreen(rows, o).map(r => r.symbol);
  assert.deepEqual(ids({ filter: 'gainers' }), ['UP']);
  assert.deepEqual(ids({ filter: 'losers' }), ['DOWN']);
  assert.deepEqual(ids({ filter: 'nearHigh' }), ['UP']);
  assert.deepEqual(ids({ filter: 'nearLow' }), ['DOWN']);
  assert.deepEqual(ids({ sort: 'change', desc: true }), ['UP', 'FLAT', 'DOWN', 'NONE']);
  assert.deepEqual(ids({ sort: 'change' }), ['DOWN', 'FLAT', 'UP', 'NONE']);
  assert.deepEqual(ids({ query: 'do' }), ['DOWN']);
  assert.deepEqual(ids({ sort: 'symbol' }), ['DOWN', 'FLAT', 'NONE', 'UP']);
  assert.deepEqual(m.breadth(rows), { up: 1, down: 1, flat: 1, unknown: 1 });
});

test('large-cap list: 50 unique valid tickers; batches split evenly', () => {
  assert.equal(m.LARGE_CAP_LIST.length, 50);
  assert.equal(new Set(m.LARGE_CAP_LIST).size, 50);
  for (const t of m.LARGE_CAP_LIST) assert.equal(m.cleanTicker(t), t);
  assert.deepEqual(m.batches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(m.batches([], 10), []);
});
