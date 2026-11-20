const test = require('node:test');
const assert = require('node:assert');
const L = require('../../tools/claims/labeling-core.js');

const row = (i, extra) => Object.assign({ claim_id: 'c' + String(i).padStart(4, '0'), claim: 'Claim number ' + i + ' is here.', evidence: [{ title: 'T', text: 'passage ' + i }] }, extra || {});
const rows = (n) => Array.from({ length: n }, (_, i) => row(i + 1));

test('parseJsonl keeps good rows and reports bad ones with their line numbers', () => {
  const text = [JSON.stringify(row(1)), '', 'not json', JSON.stringify({ claim_id: 'x', claim: '  ', evidence: [] }), JSON.stringify(row(1)), JSON.stringify({ claim_id: 'y', claim: 'ok', evidence: 'no' }), JSON.stringify(row(2))].join('\n');
  const r = L.parseJsonl(text);
  assert.deepStrictEqual(r.rows.map((x) => x.claim_id), ['c0001', 'c0002']);
  assert.deepStrictEqual(r.errors.map((e) => e.line), [3, 4, 5, 6]); assert.match(r.errors[2].error, /duplicate/);
  assert.deepStrictEqual(L.parseJsonl(null), { rows: [], errors: [] });
});
test('nothing is labelled until the person clicks: a fresh session has no labels, whatever the rows carry', () => {
  const st = L.create(rows(5).map((r) => Object.assign(r, { label: 'supported', labels: ['supported'], existing_label: 'supported' })));
  assert.deepStrictEqual(st.labels, {}); assert.strictEqual(L.toJsonl(st), ''); assert.strictEqual(L.progress(st).labelled, 0);
});
test('label, advance to the next unlabelled, undo restores the previous state and the position', () => {
  const st = L.create(rows(4));
  assert.strictEqual(st.cursor, 0);
  assert.ok(L.setLabel(st, 'c0001', 'supported')); L.next(st); assert.strictEqual(st.cursor, 1);
  assert.ok(L.setLabel(st, 'c0002', 'not_supported')); assert.ok(L.setLabel(st, 'c0002', 'unsure'));           // relabel
  assert.strictEqual(st.labels.c0002, 'unsure');
  assert.ok(L.undo(st)); assert.strictEqual(st.labels.c0002, 'not_supported');
  assert.ok(L.undo(st)); assert.strictEqual(st.labels.c0002, undefined); assert.strictEqual(st.cursor, 1);
  assert.ok(L.undo(st)); assert.strictEqual(st.labels.c0001, undefined); assert.strictEqual(L.undo(st), false);
  assert.strictEqual(L.setLabel(st, 'zzzz', 'supported'), false); assert.strictEqual(L.setLabel(st, 'c0001', 'maybe'), false);
});
test('next skips labelled rows and wraps; prev/jump stay in range', () => {
  const st = L.create(rows(4)); L.setLabel(st, 'c0002', 'supported'); L.setLabel(st, 'c0003', 'unsure');
  assert.strictEqual(L.next(st), 3); assert.strictEqual(L.next(st), 0); assert.strictEqual(L.prev(st), 0); assert.strictEqual(L.jump(st, 99), 0); assert.strictEqual(L.jump(st, 2), 2);
  L.setLabel(st, 'c0001', 'supported'); L.setLabel(st, 'c0004', 'not_supported');
  const n = L.next(st); assert.ok(Number.isInteger(n) && n >= 0 && n < 4, 'when every row is labelled, next still returns a valid position');
});
test('progress counts the mix and the gate (300 decided, 100 not supported); unsure does not count as decided', () => {
  const big = L.create(rows(400));
  for (let i = 1; i <= 310; i++) L.setLabel(big, 'c' + String(i).padStart(4, '0'), i <= 90 ? 'not_supported' : 'supported');
  for (let i = 311; i <= 320; i++) L.setLabel(big, 'c' + String(i).padStart(4, '0'), 'unsure');
  let p = L.progress(big); assert.deepStrictEqual(p.mix, { supported: 220, not_supported: 90, unsure: 10 });
  assert.strictEqual(p.decided, 310); assert.strictEqual(p.labelled, 320); assert.strictEqual(p.remaining, 80); assert.strictEqual(p.gate.met, false); assert.strictEqual(p.gate.not_supported_toward_target, 90);
  for (let i = 91; i <= 100; i++) L.setLabel(big, 'c' + String(i).padStart(4, '0'), 'not_supported');
  p = L.progress(big); assert.strictEqual(p.gate.met, true); assert.strictEqual(p.gate.decided_toward_target, 300);
  assert.strictEqual(L.progress(L.create(rows(3)), { labelled: 2, not_supported: 0 }).gate.labelled_target, 2);
});
test('save and resume: unknown ids and invalid labels in a saved session are dropped, the cursor is clamped', () => {
  const st = L.create(rows(3), { labels: { c0001: 'supported', c0002: 'bogus', nope: 'supported' }, cursor: 99 });
  assert.deepStrictEqual(st.labels, { c0001: 'supported' }); assert.strictEqual(st.cursor, 1);
  assert.strictEqual(L.create(rows(3), { labels: {}, cursor: 2 }).cursor, 2);
});
test('export is JSON lines of claim_id + label only (no claim text, no timestamps), and parseLabels reads it back', () => {
  const st = L.create(rows(3)); L.setLabel(st, 'c0003', 'not_supported'); L.setLabel(st, 'c0001', 'supported');
  const out = L.toJsonl(st); assert.deepStrictEqual(out.split('\n').map(JSON.parse), [{ claim_id: 'c0001', label: 'supported' }, { claim_id: 'c0003', label: 'not_supported' }]);
  assert.ok(!/Claim number|passage|ts|time/i.test(out));
  const back = L.parseLabels(out + '\nbad line\n{"claim_id":"c0002","label":"maybe"}'); assert.deepStrictEqual(back.labels, { c0001: 'supported', c0003: 'not_supported' }); assert.deepStrictEqual(back.errors, [3, 4]);
});
test('signature is stable per pool and differs between pools', () => {
  assert.strictEqual(L.signature(rows(5)), L.signature(rows(5))); assert.notStrictEqual(L.signature(rows(5)), L.signature(rows(6))); assert.notStrictEqual(L.signature(rows(5)), L.signature(rows(5).reverse()));
});
