const test = require('node:test');
const assert = require('node:assert');
const R = require('../../tools/review/router-review-core.js');
const row = (i, x) => Object.assign({ item_id: 'r' + String(i).padStart(4, '0'), text: 'message ' + i }, x || {});

test('13 intents, one distinct shortcut each, and u for unsure', () => {
  assert.strictEqual(R.INTENTS.length, 13); assert.strictEqual(new Set(R.KEYS).size, 13); assert.strictEqual(R.KEYS.length, 13);
  R.INTENTS.forEach((i) => assert.strictEqual(R.intentForKey(R.keyFor(i)), i));
  assert.strictEqual(R.intentForKey('u'), 'unsure'); assert.strictEqual(R.intentForKey('A'), 'advice_seeking'); assert.strictEqual(R.intentForKey('x'), null);
});
test('the file must be BLIND: any row carrying a label, intent, router output, reason or set is rejected', () => {
  const lines = [row(1), row(2, { label: 'smalltalk' }), row(3, { current_label: 'x' }), row(4, { router_0_5_1: 'x' }), row(5, { intent: 'x' }), row(6, { reason: 'control' }), row(7, { set: 'test_v8' }), row(8, { conf_0_4_1: 0.5 }), row(9)].map((r) => JSON.stringify(r)).join('\n');
  const r = R.parseJsonl(lines); assert.deepStrictEqual(r.rows.map((x) => x.item_id), ['r0001', 'r0009']); assert.strictEqual(r.errors.length, 7);
  assert.ok(r.errors.every((e) => /not blind/.test(e.error)));
  const bad = R.parseJsonl('nope\n' + JSON.stringify({ item_id: 'a', text: ' ' }) + '\n' + JSON.stringify(row(1)) + '\n' + JSON.stringify(row(1)));
  assert.deepStrictEqual(bad.errors.map((e) => e.line), [1, 2, 4]); assert.deepStrictEqual(R.parseJsonl(null), { rows: [], errors: [] });
});
test('labels come only from clicks; undo; unsure counts as labelled but is reported separately', () => {
  const st = R.create([row(1), row(2), row(3)]); assert.deepStrictEqual(st.labels, {});
  assert.ok(R.setLabel(st, 'r0001', 'smalltalk')); assert.ok(R.setLabel(st, 'r0002', 'unsure')); assert.strictEqual(R.setLabel(st, 'r0003', 'made_up'), false); assert.strictEqual(R.setLabel(st, 'zz', 'smalltalk'), false);
  const p = R.progress(st); assert.strictEqual(p.labelled, 2); assert.strictEqual(p.unsure, 1); assert.strictEqual(p.by_label.smalltalk, 1); assert.strictEqual(p.remaining, 1);
  assert.ok(R.undo(st)); assert.strictEqual(st.labels.r0002, undefined); assert.ok(R.undo(st)); assert.strictEqual(R.undo(st), false);
});
test('navigation skips labelled rows; save/resume drops unknown ids and invalid labels; export has ids and labels only', () => {
  const st = R.create([row(1), row(2), row(3)], { labels: { r0001: 'goal_status', r0002: 'bogus', nope: 'smalltalk' }, cursor: 99 });
  assert.deepStrictEqual(st.labels, { r0001: 'goal_status' }); assert.strictEqual(st.cursor, 1);
  R.setLabel(st, 'r0002', 'app_help'); assert.strictEqual(R.next(st), 2); assert.strictEqual(R.jump(st, 0), 0); assert.strictEqual(R.prev(st), 0);
  const out = R.toJsonl(st).split('\n').map(JSON.parse); assert.deepStrictEqual(out, [{ item_id: 'r0001', label: 'goal_status' }, { item_id: 'r0002', label: 'app_help' }]);
  const back = R.parseLabels(R.toJsonl(st) + '\nx\n{"item_id":"r0003","label":"maybe"}'); assert.deepStrictEqual(Object.keys(back.labels), ['r0001', 'r0002']); assert.deepStrictEqual(back.errors, [3, 4]);
});
test('signature differs per pool', () => { assert.notStrictEqual(R.signature([row(1), row(2)]), R.signature([row(1), row(3)])); });
