const test = require('node:test');
const assert = require('node:assert');
const T = require('../js/finos-taxdates.js');

test('FY boundaries', () => {
  assert.strictEqual(T.fyOf('2026-03-31'), 2025);
  assert.strictEqual(T.fyOf('2026-04-01'), 2026);
  assert.strictEqual(T.fyLabel(2026), 'FY 2026-27');
  assert.strictEqual(T.fyLabel(2099), 'FY 2099-00');
});

test('FY 2026-27 produces the standard statutory dates', () => {
  const dates = Object.fromEntries(T.forFY(2026).map((e) => [e.title.split(' (')[0], e.date]));
  assert.strictEqual(dates['Advance Tax Q1'], '2026-06-15');
  assert.strictEqual(dates['Advance Tax Q2'], '2026-09-15');
  assert.strictEqual(dates['Advance Tax Q3'], '2026-12-15');
  assert.strictEqual(dates['Advance Tax Q4'], '2027-03-15');
  assert.strictEqual(dates['Tax-saving deadline'], '2027-03-31');
  assert.strictEqual(dates['ITR filing deadline'], '2027-07-31');
});

test('never runs dry: events exist for every future quarter', () => {
  for (const d of ['2026-10-01', '2027-04-02', '2030-01-01', '2041-09-09']) {
    const n = T.next(d);
    assert.ok(n && n.date >= d, 'no event after ' + d);
    const gapDays = (new Date(n.date) - new Date(d)) / 86400000;
    assert.ok(gapDays < 120, `gap ${gapDays}d after ${d}`);
  }
});

test('events() is sorted, in range, and includes prior-FY filing dates', () => {
  const ev = T.events('2026-10-01', '2027-08-31');
  assert.deepStrictEqual(ev.map((e) => e.date), [...ev.map((e) => e.date)].sort());
  assert.ok(ev.every((e) => e.date >= '2026-10-01' && e.date <= '2027-08-31'));
  assert.ok(ev.some((e) => e.date === '2026-12-31' && /Belated/.test(e.title)));     // FY 2025-26 belated window
  assert.ok(ev.some((e) => e.date === '2027-07-31' && /FY 2026-27/.test(e.title)));
  assert.ok(ev.every((e) => e.type === 'tax'));
});

test('date-sensitive events carry the "verify" caveat', () => {
  assert.ok(T.forFY(2026).filter((e) => /Advance Tax|ITR filing/.test(e.title)).every((e) => /verify/i.test(e.sub)));
});
