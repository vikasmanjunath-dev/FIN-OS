// Trade journal files and storage: CSV round trip, broker trade book pairing, the website's backup, merge / dedupe / undo, damaged storage.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as tj from '../lib/tradeJournal.ts';
import * as imp from '../lib/tradeJournalImport.ts';
import * as st from '../lib/tradeJournalStorage.ts';
import { isSyncKey } from '../lib/trackerSync.ts';
import { isBackupKey } from '../lib/backup.ts';
import { ARRAY_KEYS } from '../lib/keyShapes.ts';

const TODAY = '2026-10-16';
const T = (o: Record<string, unknown>) => tj.readTrade({ id: 'x', date: '2026-10-05', symbol: 'NIFTY', ...o })!;
const parse = (s: string, batch = 'b1') => imp.parseJournalFile(s, { batch, today: TODAY });
beforeEach(async () => { await AsyncStorage.clear(); });

test('export then import returns the same trades, including commas, quotes, new lines, zero prices and a spreadsheet formula', () => {
  const tags: tj.Tag[] = [{ id: 'g1', name: 'Gap up', type: 'setup', color: '#00ff88' }];
  const list = [
    T({ id: 'a', direction: 'Long', entry: 80, exit: 0, qty: 50, brokerage: 20, exchange: 11, other: 3, strategy: 'ORB, "fast"', notes: 'line1\nline2', emotion: 'FOMO', isRevenge: true, isImpulsive: false, tags: ['g1'], entryTime: '09:20', exitTime: '09:40', confidence: 7 }),
    T({ id: 'b', date: '2026-10-06', symbol: 'M&M', direction: 'Short', entry: 100.5, exit: 90.25, qty: 3, lotSize: 10, chargesTotal: 12, reason: '=HYPERLINK("x")' }),
    T({ id: 'c', date: '2026-10-07', symbol: 'TCS', gross: -250 }),
    T({ id: 'd', date: '2026-10-08', symbol: 'INFY', direction: 'Long', entry: 10 }),         // open, no profit
  ];
  const csv = imp.toCsv(list, tags);
  assert.ok(!/^=/m.test(csv.split('\r\n')[2]), 'a formula must not start a cell');
  const r = parse(csv);
  assert.equal(r.format, 'journal-csv');
  assert.equal(r.trades.length, 4);
  r.trades.forEach((t, i) => {
    const o = list[i];
    for (const k of ['date', 'symbol', 'direction', 'entry', 'exit', 'qty', 'lotSize', 'brokerage', 'exchange', 'other', 'chargesTotal', 'strategy', 'notes', 'emotion', 'isRevenge', 'isImpulsive', 'entryTime', 'exitTime', 'confidence', 'reason'] as const)
      assert.deepEqual(t[k], o[k], `${i}.${k}`);
    assert.equal(tj.netOf(t), tj.netOf(o), `${i} net`);
  });
  assert.deepEqual(r.tags.map(t => t.name), ['Gap up']);
  assert.deepEqual(r.trades[0].tags, [r.tags[0].id]);
  assert.equal(r.trades[3].gross, undefined);
  assert.match(r.warnings.join(' '), /1 trade has no profit/);
});

test('broker trade book: fills are paired into round trips (scale in/out, short, reversal, open leftovers), dates read day-first', () => {
  const csv = ['symbol,trade_date,trade_type,quantity,price,order_execution_time',
    'AAA,2026-10-05,buy,10,100,2026-10-05T09:15:00',
    'AAA,2026-10-05,buy,10,110,2026-10-05T09:30:00',
    'AAA,2026-10-05,sell,5,120,2026-10-05T10:00:00',
    'AAA,2026-10-05,sell,15,130,2026-10-05T11:00:00',          // long 20: cost 2100, proceeds 600+1950 = 2550 -> +450
    'BBB,2026-10-06,sell,10,50,2026-10-06T09:20:00',
    'BBB,2026-10-06,buy,25,48,2026-10-06T09:40:00',            // short 10 closed (+20), then 15 bought and still open
    'CCC,2026-10-07,buy,5,10,2026-10-07T09:20:00'].join('\n');
  const r = parse(csv);
  assert.equal(r.format, 'fills-csv');
  const by = Object.fromEntries(r.trades.map(t => [t.symbol, t]));
  assert.deepEqual([by.AAA.direction, by.AAA.qty, by.AAA.entry, by.AAA.exit, by.AAA.gross, by.AAA.entryTime, by.AAA.exitTime], ['Long', 20, 105, 127.5, 450, '09:15', '11:00']);
  assert.deepEqual([by.BBB.direction, by.BBB.qty, by.BBB.gross], ['Short', 10, 20]);
  assert.equal(r.trades.length, 2);
  assert.equal(r.openPositions, 2);                                // BBB leftover 15 long, CCC 5 long
  assert.match(r.warnings.join(' '), /still open/);
  assert.match(r.warnings.join(' '), /none recorded/);
  assert.equal(r.trades.every(t => !imp.contentKey(t).includes('NaN')), true);
});

test('a day-first date is read day-first unless the file proves otherwise; future dates and bad rows are skipped and listed', () => {
  const r = parse('date,symbol,qty,price,net\n05/10/2026,AAA,1,1,10\n13/10/2026,AAA,1,1,10\n31/12/2026,AAA,1,1,10\nnonsense,AAA,1,1,10\n06/10/2026,,1,1,10\n07/10/2026,AAA,1,1,abc');
  assert.deepEqual(r.trades.map(t => t.date), ['2026-10-05', '2026-10-13']);
  assert.deepEqual(r.skipped.map(s => s.reason), ['date is in the future', 'unreadable date', 'no instrument', 'net is not a number']);
});

test('a file that is not trades is refused with a reason, and hostile input does not throw', () => {
  for (const bad of ['', '   ', 'a,b,c\n1,2,3', '{"x":1}', '[1,2]', '{"trades":"no"}', '\u0000\u0001', 'date,symbol\n']) {
    const r = parse(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.warnings.length > 0);
  }
  assert.equal(parse('x'.repeat(5_000_001)).ok, false);
});

test('only a net profit column: the net is the gross, no charges are invented', () => {
  const r = parse('date,symbol,net\n2026-10-05,AAA,"1,250.50"\n2026-10-06,BBB,(300)');
  assert.deepEqual(r.trades.map(t => [tj.netOf(t), tj.hasCharges(t)]), [[1250.5, false], [-300, false]]);
  assert.equal(r.totals.net, 950.5);
});

test('the website backup: ids kept (so a second import is recognised), tags mapped, defaults not imported, exit 0 recovered', () => {
  const backup = JSON.stringify({ trades: [
    { id: '171', date: '2026-09-01', symbol: 'nifty', direction: 'Long', entry: 80, exit: 0, qty: 50, lotSize: 0, gross: -4000, brokerage: 20, stt: 0, tax: 20, net: -4020, emotion: 'FOMO', confidence: 5, stress: 3, isRevenge: false, isImpulsive: true, tags: ['t1'], discipline: 'broken' },
    { id: '172', date: '2026-09-02', symbol: 'TCS', direction: 'Short', entry: 100, exit: 90, qty: 10, gross: 100, tax: 10, net: 90 },
    { id: '173', date: '2026-09-03', symbol: 'X', gross: 0, net: 0, tax: 0 },
    { id: '174', date: 'bad', symbol: 'X' },
  ], tags: [{ id: 't1', name: 'Gap up', type: 'setup', color: '#00ff88' }] });
  const r = parse(backup);
  assert.equal(r.format, 'web-json');
  assert.deepEqual(r.trades.map(t => t.id), ['w_171', 'w_172', 'w_173']);
  const [a, b, c] = r.trades;
  assert.deepEqual([a.exit, a.gross, tj.netOf(a), a.confidence, a.stress, a.isRevenge, a.isImpulsive, a.tags], [0, -4000, -4020, undefined, undefined, undefined, true, ['w_t1']]);
  assert.deepEqual([b.chargesTotal, tj.netOf(b)], [10, 90]);
  assert.equal(tj.netOf(c), null);                           // all zero and nothing else: nothing was recorded
  assert.equal(r.skipped.length, 1);
  assert.deepEqual(r.tags.map(t => t.name), ['Gap up']);
});

test('merge: a repeat is recognised by id or by content; identical trades inside one file are both kept; undo removes exactly one batch', () => {
  const a = parse('date,symbol,entry,exit,qty,side\n2026-10-05,AAA,10,12,5,buy\n2026-10-05,AAA,10,12,5,buy', 'b1');
  assert.equal(a.trades.length, 2);
  const first = imp.mergeTrades([{ weird: 1 }], a.trades);
  assert.deepEqual([first.added, first.duplicates, first.merged.length], [2, 0, 3]);
  const again = imp.mergeTrades(first.merged, parse('date,symbol,entry,exit,qty,side\n2026-10-05,AAA,10,12,5,buy\n2026-10-05,AAA,10,12,5,buy\n2026-10-05,AAA,10,12,5,buy', 'b2').trades);
  assert.deepEqual([again.added, again.duplicates], [1, 2]);
  const undone = imp.undoBatch(again.merged, 'b2');
  assert.equal(undone.length, 3);
  assert.deepEqual(undone[0], { weird: 1 });
});

test('storage: save, edit keeping unknown fields, delete; import with preview, tags, and undo', async () => {
  const t = tj.buildTrade({ ...tj.emptyForm('2026-10-14'), symbol: 'x', direction: 'Long', entry: '10', exit: '12', qty: '5' }, { id: 'one', today: TODAY, now: new Date() });
  assert.ok(t.ok);
  if (!t.ok) return;
  assert.deepEqual(await st.saveTrade(t.trade), { ok: true, added: true });
  const raw = JSON.parse((await AsyncStorage.getItem(st.TRADES_KEY))!);
  raw[0].futureField = 'keep me';
  await AsyncStorage.setItem(st.TRADES_KEY, JSON.stringify(raw));
  assert.deepEqual(await st.saveTrade({ ...t.trade, notes: 'edited' }), { ok: true, added: false });
  const after = JSON.parse((await AsyncStorage.getItem(st.TRADES_KEY))!);
  assert.deepEqual([after.length, after[0].notes, after[0].futureField], [1, 'edited', 'keep me']);

  const file = parse('date,symbol,entry,exit,qty,side,tags\n2026-10-05,AAA,10,12,5,buy,Gap up\n2026-10-06,BBB,10,9,5,sell,gap UP;Expiry', 'imp1');
  assert.deepEqual(await st.previewImport(file), { added: 2, duplicates: 0 });
  const res = await st.importTrades(file, 'imp1');
  assert.deepEqual([res.added, res.duplicates, res.tagsAdded], [2, 0, 2]);
  const data = await st.loadJournal();
  assert.equal(data.trades.length, 3);
  const gap = data.tags.find(x => x.name === 'Gap up')!;
  assert.equal(data.trades.filter(x => x.tags?.includes(gap.id)).length, 2);
  assert.deepEqual(await st.previewImport(file), { added: 0, duplicates: 2 });
  assert.deepEqual((await st.listBatches()).map(b => [b.batch, b.count]), [['imp1', 2]]);
  assert.equal(await st.undoImport('imp1'), 2);
  assert.equal((await st.loadJournal()).trades.length, 1);
  assert.equal(await st.deleteTag(gap.id), true);
  assert.equal(await st.deleteTrade('one'), true);
  assert.equal(await st.deleteTrade('one'), false);
});

test('deleting a tag removes it from the trades that carried it', async () => {
  const tag = await st.addTag({ name: 'News' });
  assert.ok(tag.ok);
  if (!tag.ok) return;
  await st.saveTrade(T({ id: 'k', tags: [tag.tag.id, 'other'], gross: 1 }));
  await st.deleteTag(tag.tag.id);
  assert.deepEqual((await st.loadJournal()).trades[0].tags, ['other']);
  assert.equal((await st.addTag({ name: 'news' })).ok, true);
});

test('damaged storage never crashes and is never silently overwritten', async () => {
  await AsyncStorage.setItem(st.TRADES_KEY, '{not json');
  let d = await st.loadJournal();
  assert.deepEqual([d.trades.length, d.damaged], [0, true]);
  await st.saveTrade(T({ id: 'n', gross: 5 }));
  const kept = await AsyncStorage.getItem('finos_sync_never_corrupt_sync_never_trade_journal_v1');
  assert.equal(kept, '{not json');
  await AsyncStorage.setItem(st.TRADES_KEY, JSON.stringify([{ id: 'ok', date: '2026-10-05', symbol: 'A', gross: 1 }, 'junk', { id: 'bad', date: 'x' }]));
  d = await st.loadJournal();
  assert.deepEqual([d.trades.length, d.unreadable, d.damaged], [1, 2, false]);
  await st.saveTrade(T({ id: 'm', gross: 2 }));
  assert.equal(JSON.parse((await AsyncStorage.getItem(st.TRADES_KEY))!).length, 4);           // the two unreadable entries are still there
  await AsyncStorage.setItem(st.TAGS_KEY, '42');
  assert.deepEqual((await st.loadJournal()).tags, []);
});

test('two quick saves cannot lose each other', async () => {
  await Promise.all(Array.from({ length: 8 }, (_, i) => st.saveTrade(T({ id: 'q' + i, gross: i }))));
  assert.equal((await st.loadJournal()).trades.length, 8);
});

test('the journal (notes, feelings) is never uploaded by the cloud sync, but is in the person\'s own backup and has a registered list shape', () => {
  for (const k of [st.TRADES_KEY, st.TAGS_KEY]) {
    assert.equal(isSyncKey(k), false, `${k} would sync`);
    assert.equal(isBackupKey(k), true, `${k} would be missing from the backup`);
    assert.ok(ARRAY_KEYS.has(k), `${k} is not registered as a list`);
  }
});
