const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/sml/pulse-counters.js');

const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };

test('emptyStats has the documented shape', () => {
  assert.deepStrictEqual(C.emptyStats(5), { since: 5, renders: 0, widgets: {} });
});
test('recordRender counts impressions, positions and top slots', () => {
  let s = C.recordRender(C.emptyStats(1), ['a', 'b', 'c', 'd']);
  s = C.recordRender(s, ['b', 'a', 'c', 'd']);
  assert.strictEqual(s.renders, 2);
  assert.deepStrictEqual(s.widgets.a, { imp: 2, tap: 0, pos_sum: 1, top_imp: 2, top_tap: 0 });
  assert.deepStrictEqual(s.widgets.d, { imp: 2, tap: 0, pos_sum: 6, top_imp: 0, top_tap: 0 });
});
test('recordTap counts taps and top-slot taps', () => {
  let s = C.recordRender(C.emptyStats(1), ['a', 'b', 'c', 'd']);
  s = C.recordTap(s, 'a', 0); s = C.recordTap(s, 'd', 3);
  assert.strictEqual(s.widgets.a.tap, 1); assert.strictEqual(s.widgets.a.top_tap, 1);
  assert.strictEqual(s.widgets.d.tap, 1); assert.strictEqual(s.widgets.d.top_tap, 0);
});
test('pure: inputs are not mutated', () => {
  const a = C.emptyStats(1); const snap = JSON.stringify(a);
  const b = C.recordRender(a, ['x']);
  assert.strictEqual(JSON.stringify(a), snap); assert.notStrictEqual(a, b);
});
test('invalid ids and shapes are ignored, never stored', () => {
  let s = C.emptyStats(1);
  s = C.recordRender(s, ['ok', 'has space', '<script>', '', 5, null, 'x'.repeat(41)]);
  s = C.recordTap(s, 'My salary is 90000', 0);
  s = C.recordRender(s, 'not an array');
  assert.deepStrictEqual(Object.keys(s.widgets), ['ok']);
});
test('widget count is capped', () => {
  const ids = Array.from({ length: 100 }, (_, i) => 'w' + i);
  const s = C.recordRender(C.emptyStats(1), ids);
  assert.ok(Object.keys(s.widgets).length <= 60);
});
test('hostile stored data is rebuilt: only known numeric fields survive', () => {
  const hostile = { since: 3, renders: 2, text: 'secret', widgets: { good: { imp: 1, tap: 1, pos_sum: 0, top_imp: 1, top_tap: 0, note: 'my PAN ABCDE1234F' }, 'bad id': { imp: 9 } }, extra: [1] };
  const s = C.saveStats(mem(), hostile);
  assert.strictEqual(s, true);
  const st = mem(); C.saveStats(st, hostile);
  const raw = st._m[C.KEY];
  assert.ok(!/secret|PAN|ABCDE|bad id|extra|note/.test(raw), raw);
  assert.deepStrictEqual(Object.keys(C.loadStats(st).widgets), ['good']);
});
test('negative, NaN and non-numeric counters become 0', () => {
  const st = mem(); st.setItem(C.KEY, JSON.stringify({ renders: -4, widgets: { a: { imp: 'x', tap: NaN, pos_sum: -1 } } }));
  const s = C.loadStats(st);
  assert.strictEqual(s.renders, 0); assert.deepStrictEqual(s.widgets.a, { imp: 0, tap: 0, pos_sum: 0, top_imp: 0, top_tap: 0 });
});
test('corrupt storage gives fresh stats; throwing storage does not throw', () => {
  const st = mem(); st.setItem(C.KEY, '{not json');
  assert.strictEqual(C.loadStats(st).renders, 0);
  const boom = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.strictEqual(C.loadStats(boom).renders, 0);
  assert.strictEqual(C.saveStats(boom, C.emptyStats(1)), false);
  assert.strictEqual(C.enabled(boom), false);
});
test('default off; on only for "1"', () => {
  const st = mem();
  assert.strictEqual(C.enabled(st), false);
  st.setItem(C.FLAG_KEY, 'true'); assert.strictEqual(C.enabled(st), false);
  st.setItem(C.FLAG_KEY, '1'); assert.strictEqual(C.enabled(st), true);
});
test('summary: empty and populated', () => {
  assert.match(C.summary(C.emptyStats(1)), /no renders yet/);
  let s = C.emptyStats(1);
  for (let i = 0; i < 3; i++) s = C.recordRender(s, ['a', 'b']);
  s = C.recordTap(s, 'b', 1);
  assert.match(C.summary(s), /3 renders, 1 taps.*b 1\/3/);
});
test('counters contain no timestamps beyond the single since', () => {
  const s = C.recordTap(C.recordRender(C.emptyStats(1), ['a']), 'a', 0);
  assert.deepStrictEqual(Object.keys(s).sort(), ['renders', 'since', 'widgets']);
});
test('ids that match inherited member names are counted as their own keys and never touch Object.prototype or Object', () => {
  let s = C.recordRender(C.emptyStats(1), ['constructor', 'toString', 'valueOf', 'a']);
  s = C.recordTap(s, 'constructor', 0);
  assert.deepStrictEqual(s.widgets.constructor, { imp: 1, tap: 1, pos_sum: 0, top_imp: 1, top_tap: 1 });
  assert.deepStrictEqual(s.widgets.toString, { imp: 1, tap: 0, pos_sum: 1, top_imp: 1, top_tap: 0 });
  assert.strictEqual(Object.imp, undefined); assert.strictEqual(Object.prototype.toString.imp, undefined); assert.strictEqual(Object.tap, undefined);
});
test('a negative or non-numeric position is not a top-slot tap', () => {
  let s = C.recordRender(C.emptyStats(1), ['a']);
  s = C.recordTap(s, 'a', -1); s = C.recordTap(s, 'a', NaN); s = C.recordTap(s, 'a', undefined);
  assert.strictEqual(s.widgets.a.tap, 3); assert.strictEqual(s.widgets.a.top_tap, 0);
});
test('a stored widget that is not an object is read as zeros', () => {
  const st = mem(); C.saveStats(st, { renders: 1, widgets: { a: 'secret text', b: 7 } });
  assert.deepStrictEqual(C.loadStats(st).widgets.a, { imp: 0, tap: 0, pos_sum: 0, top_imp: 0, top_tap: 0 });
});
