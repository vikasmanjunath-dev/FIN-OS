// The last-good-response cache: what the phone shows when the backend cannot be reached.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as s from '../lib/marketDataStorage.ts';
import { normaliseNews, normaliseFx } from '../lib/marketData.ts';

beforeEach(async () => { await AsyncStorage.clear(); });

const NEWS = { articles: [{ id: 'a', title: 'Nifty rallies', url: 'https://example.test/a', source: 'Mint', sentiment: 'bullish', published_ts: 100 }] };

test('a good answer is returned live and saved with its time', async () => {
  const r = await s.loadWithCache({ key: 'news', fetcher: async () => NEWS, normalise: normaliseNews, usable: f => f.articles.length > 0, now: 5000 });
  assert.equal(r.fromCache, false);
  assert.equal(r.error, null);
  assert.equal(r.savedAt, 5000);
  assert.equal(r.data!.articles.length, 1);
  const c = await s.readCached<any>('news');
  assert.equal(c!.savedAt, 5000);
});

test('a failed fetch returns the last good answer marked as saved, with a plain reason', async () => {
  await s.loadWithCache({ key: 'news', fetcher: async () => NEWS, normalise: normaliseNews, now: 1000 });
  const r = await s.loadWithCache({ key: 'news', fetcher: async () => { throw new Error('Network request failed'); }, normalise: normaliseNews, now: 9000 });
  assert.equal(r.fromCache, true);
  assert.equal(r.savedAt, 1000);
  assert.equal(r.data!.articles[0].id, 'a');
  assert.match(r.error!, /Can't reach the Arya backend/);
});

test('with nothing saved, a failure gives no data and the reason (not a made-up value)', async () => {
  const r = await s.loadWithCache({ key: 'fx', fetcher: async () => { throw new Error('timeout'); }, normalise: normaliseFx });
  assert.deepEqual([r.data, r.savedAt, r.fromCache], [null, null, false]);
  assert.match(r.error!, /too long/);
});

test('an empty or error answer does not overwrite a good saved one', async () => {
  await s.loadWithCache({ key: 'fx', fetcher: async () => ({ USD_INR: 94.9 }), normalise: normaliseFx, usable: v => v.rates.length > 0, now: 1000 });
  const r = await s.loadWithCache({ key: 'fx', fetcher: async () => ({ error: 'FX rates unavailable: the rate source could not be reached' }), normalise: normaliseFx, usable: v => v.rates.length > 0, now: 2000 });
  assert.equal(r.fromCache, true);
  assert.equal(r.savedAt, 1000);
  assert.equal(r.data!.rates[0].rate, 94.9);
  assert.match(r.error!, /rate source could not be reached/);
  assert.equal((await s.readCached<any>('fx'))!.savedAt, 1000);
});

test('HTTP 404 explains an older backend; 5xx blames the provider', () => {
  assert.match(s.describeFailure(new Error('HTTP 404')), /older version/);
  assert.match(s.describeFailure(new Error('HTTP 502')), /data provider/);
  assert.match(s.describeFailure(new Error('The operation was aborted')), /too long/);
});

test('corrupt saved data is ignored, not thrown', async () => {
  await AsyncStorage.setItem(s.CACHE_PREFIX + 'news', '{not json');
  assert.equal(await s.readCached('news'), null);
  await AsyncStorage.setItem(s.CACHE_PREFIX + 'news', JSON.stringify({ data: 1 }));
  assert.equal(await s.readCached('news'), null);
  const r = await s.loadWithCache({ key: 'news', fetcher: async () => { throw new Error('x'); }, normalise: normaliseNews });
  assert.equal(r.data, null);
});

test('the cache is bounded: the oldest entries are evicted', async () => {
  for (let i = 0; i < s.MAX_ENTRIES + 5; i++) await s.writeCached('k' + i, { i }, 1000 + i);
  const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(s.CACHE_PREFIX));
  assert.equal(keys.length, s.MAX_ENTRIES);
  assert.equal(await s.readCached('k0'), null);
  assert.ok(await s.readCached('k' + (s.MAX_ENTRIES + 4)));
  assert.deepEqual(s.pruneIndex({ a: 3, b: 1, c: 2 }, 2), ['b']);
  assert.deepEqual(s.pruneIndex({ a: 1 }, 2), []);
});

test('the cache stays out of the data export and backup (no finos_ prefix) and can be cleared', async () => {
  assert.ok(!s.CACHE_PREFIX.startsWith('finos_'));
  await s.writeCached('quote:INFY', { price: 1 });
  await AsyncStorage.setItem('finos_goals', '[]');
  assert.equal(await s.clearMarketCache(), 2);        // the entry and the index
  assert.equal(await AsyncStorage.getItem('finos_goals'), '[]');
  assert.equal(await s.readCached('quote:INFY'), null);
});
