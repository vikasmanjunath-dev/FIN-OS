const test = require('node:test');
const assert = require('node:assert');
const S = require('../../../js/sml/sample-capture.js');
const mem = (flag) => { const m = {}; if (flag) m.finos_sml_samples = '1'; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m }; };

test('redaction masks phone, card, account, Aadhaar-like, PAN, e-mail, UPI and long digit runs (also spaced, dashed and Devanagari digits)', () => {
  const bad = ['call 9876543210 now', 'card 4111 1111 1111 1111', 'acct 1234-5678-9012', 'aadhaar 1234 5678 9012', 'PAN ABCDE1234F fee', 'mail a.b@example.com', 'pay ravi.kumar@okhdfc',
    'ref १२३४५६७८९०१२', 'ref 12 34 56 78 90 12', 'order 123456 shipped', 'tel 98765-43210'];
  for (const t of bad) {
    const r = S.redact(t).text;
    assert.ok(!/\d{5,}|[A-Z]{5}\d{4}[A-Z]|@|[०-९]/.test(r), `${t} -> ${r}`);
    assert.ok(S.redact(t).changed, t);
  }
});
test('money amounts are masked; ordinary words and short numbers survive', () => {
  assert.strictEqual(S.redact('I earn ₹1,25,000 a month and saved Rs. 5 lakh').text, 'I earn [AMT] a month and saved [AMT]');
  assert.match(S.redact('invest 25 hazaar in a SIP of 2.5 crore').text, /invest \[AMT\] in a SIP of \[AMT\]/);
  assert.strictEqual(S.redact('what is the 80C limit for FY 2025-26').text, 'what is the 80C limit for FY 2025-26');
  assert.strictEqual(S.redact('  spaced   out\n text ').text, 'spaced out text');
  assert.strictEqual(S.redact(null).text, ''); assert.strictEqual(S.redact(undefined).changed, false);
});
test('off by default: nothing is stored without the flag', () => {
  const st = mem(false);
  assert.strictEqual(S.add(st, 'hello', {}), null); assert.deepStrictEqual(S.list(st), []);
  assert.strictEqual(S.enabled(st), false);
});
test('with the flag: stores the REDACTED text, a day (no clock time) and the router verdict', () => {
  const st = mem(true);
  const row = S.add(st, 'send 5000000 to 9876543210 via me@upi', { pred: 'advice_seeking', guard: true, regex: false }, Date.UTC(2026, 9, 26, 12, 0, 0));
  assert.ok(row && !/9876543210|5000000|me@upi/.test(JSON.stringify(row)));
  assert.match(row.day, /^2026-10-2[67]$/); assert.strictEqual(row.pred, 'advice_seeking'); assert.strictEqual(row.guard, true);
  assert.ok(!/\d{2}:\d{2}/.test(JSON.stringify(row)));
  assert.ok(!/9876543210/.test(JSON.stringify(st._m)), 'raw text never reaches storage');
});
test('capped at 100 rows (oldest dropped) and at 300 characters per row', () => {
  const st = mem(true);
  for (let i = 0; i < 130; i++) S.add(st, 'message number ' + (i % 7) + ' x'.repeat(i % 5), {});
  const rows = S.list(st); assert.strictEqual(rows.length, 100); assert.strictEqual(rows[0].id, 31); assert.strictEqual(rows[99].id, 130);
  const long = S.add(st, 'a'.repeat(1000), {}); assert.ok(long.text.length <= S.MAXLEN + 1);
});
test('list, remove one, clear, export as JSON lines with an empty label', () => {
  const st = mem(true);
  S.add(st, 'first', { pred: 'smalltalk' }); const b = S.add(st, 'second', { pred: 'advice_seeking', guard: true, regex: true });
  assert.strictEqual(S.remove(st, b.id), 1); assert.strictEqual(S.list(st).length, 1);
  const out = S.exportJsonl(st).split('\n').map(JSON.parse); assert.deepStrictEqual(Object.keys(out[0]).sort(), ['day', 'intent', 'regex_guard', 'router_guard', 'router_pred', 'text']); assert.strictEqual(out[0].intent, '');
  assert.strictEqual(S.clear(st), true); assert.deepStrictEqual(S.list(st), []);
});
test('stored rows are re-cleaned on read: injected fields and unredacted text cannot come back out', () => {
  const st = mem(true); st.setItem(S.KEY, JSON.stringify([{ id: 1, day: '2026-10-26', text: 'call 9876543210', pred: 'bad intent!', guard: 1, secret: 'x', regex: 0 }, 'junk', null, { text: 5 }]));
  const rows = S.list(st); assert.strictEqual(rows.length, 1);
  assert.ok(!/9876543210/.test(rows[0].text)); assert.strictEqual(rows[0].pred, ''); assert.ok(!('secret' in rows[0]));
});
test('no network or storage side channel in the module source', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', 'js', 'sml', 'sample-capture.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|navigator\.|document\.cookie)\b/.test(src));
});

// ── user-facing "flagged examples" store (consent flag finos_sml_flagged) ─────────────────────────────────────────
const memF = (on) => { const m = {}; if (on) m.finos_sml_flagged = '1'; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m }; };
test('flagged store: off without the person\'s consent flag, separate from the founder store', () => {
  const st = memF(false); assert.strictEqual(S.flagged.add(st, 'should i sell', { guard: true }), null); assert.deepStrictEqual(S.flagged.list(st), []);
  const both = memF(true); S.flagged.add(both, 'hello', {}); assert.strictEqual(S.list(both).length, 0, 'the founder store is not touched'); assert.strictEqual(S.flagged.list(both).length, 1);
  assert.notStrictEqual(S.flagged.KEY, S.KEY); assert.notStrictEqual(S.flagged.FLAG, S.FLAG);
});
test('flagged store: redacted, capped at 50, delete one, delete all', () => {
  const st = memF(true);
  S.flagged.add(st, 'call 9876543210 about my Rs. 5 lakh and mail a@b.com', { pred: 'advice_seeking', guard: true });
  assert.ok(!/9876543210|5 lakh|a@b\.com/.test(JSON.stringify(st._m)));
  for (let i = 0; i < 70; i++) S.flagged.add(st, 'q' + i, { guard: true });
  const rows = S.flagged.list(st); assert.strictEqual(rows.length, 50); assert.strictEqual(S.flagged.MAX, 50);
  assert.strictEqual(S.flagged.remove(st, rows[0].id), 1); assert.strictEqual(S.flagged.list(st).length, 49);
  assert.strictEqual(S.flagged.clear(st), true); assert.deepStrictEqual(S.flagged.list(st), []);
});
test('the file a person can send has a header and redacted rows only: no ids, no clock time, no identifiers', () => {
  const st = memF(true); S.flagged.add(st, 'should i put it all in one stock? phone 9876543210', { pred: 'advice_seeking', guard: true, regex: false }, Date.UTC(2026, 9, 26, 15, 30, 0));
  const f = S.flaggedFile(st, Date.UTC(2026, 9, 26, 15, 30, 0)); const j = JSON.stringify(f);
  assert.strictEqual(f.schema, 'finos-flagged-examples/1'); assert.match(f.exported_day, /^2026-10-2[67]$/); assert.match(f.note, /nothing was sent automatically/i);
  assert.deepStrictEqual(Object.keys(f.rows[0]).sort(), ['day', 'regex_guard', 'router_guard', 'router_pred', 'text']);
  assert.ok(!/9876543210|\d{2}:\d{2}|"id"|userId|deviceId/.test(j), j);
});
