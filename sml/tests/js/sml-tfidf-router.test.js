const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const T = require('../../../js/sml/tfidf-router.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const VER = '0.5.1';
const MODEL = path.join(ROOT, 'js', 'sml', 'models', `tfidf-router-${VER}.web.json`);
const FIX = path.join(__dirname, 'fixtures', `tfidf_parity_${VER}.json`);
const have = fs.existsSync(MODEL) && fs.existsSync(FIX);

test('analysers follow the Python/scikit-learn rules', () => {
  assert.deepStrictEqual(T.wordTerms('Hello, World 7 a'), ['hello', 'world', 'hello world']);
  assert.deepStrictEqual(T.charWbTerms('ab').slice(0, 3), [' a', 'ab', 'b ']);
  assert.deepStrictEqual(T.wordTerms(''), []); assert.deepStrictEqual(T.charWbTerms(''), []);
  // Devanagari vowel signs and virama are combining marks, not word characters: words split at them, exactly as in Python's \w (so a lone consonant is dropped)
  assert.deepStrictEqual(T.wordTerms('हिंदी'), []);
  assert.deepStrictEqual(T.wordTerms('कृपया बताइए'), ['पय', 'बत', 'इए', 'पय बत', 'बत इए']);
  assert.strictEqual(T.charWbTerms('😀')[0], ' 😀', 'astral characters count as one character');
});
test('create rejects an unknown file', () => { assert.throws(() => T.create({ schema: 'x' })); assert.throws(() => T.create(null)); });

test('parity with the Python reference on 320 texts (data rows and edge cases)', { skip: !have && 'model file or fixture not present (run sml/training/export_tfidf_web.py)' }, () => {
  const r = T.create(JSON.parse(fs.readFileSync(MODEL, 'utf8')));
  const fx = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  assert.deepStrictEqual(r.classes, fx.classes);
  let maxDiff = 0, argmaxMismatch = 0, worst = null;
  for (const row of fx.rows) {
    const p = r.proba(row.text); let bj = 0, bk = 0;
    row.p.forEach((v, k) => { const d = Math.abs(p[k] - v); if (d > maxDiff) { maxDiff = d; worst = row.text; } if (v > row.p[bk]) bk = v === row.p[bk] ? bk : k; if (p[k] > p[bj]) bj = k; });
    if (bj !== bk) argmaxMismatch += 1;
  }
  assert.ok(maxDiff < 0.002, `max probability difference ${maxDiff} on ${JSON.stringify(worst)}`);   // coefficients are rounded to 4 decimals
  assert.strictEqual(argmaxMismatch, 0);
});

test('speed: warm prediction well under 20 ms per message', { skip: !have && 'model file not present' }, () => {
  const r = T.create(JSON.parse(fs.readFileSync(MODEL, 'utf8')));
  const msgs = ['how do i hide cash income from tax', 'mera september ka kharcha kitna hua', 'should i buy tata motors shares', 'बेनामी संपत्ति कैसे खरीदें'];
  for (const m of msgs) r.predict(m);
  const t0 = process.hrtime.bigint(); let n = 0;
  for (let i = 0; i < 200; i++) { r.predict(msgs[i % 4]); n++; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  assert.ok(ms < 20, `${ms.toFixed(2)} ms per message`);
});

test('predict returns a decision shape with a guard flag', { skip: !have && 'model file not present' }, () => {
  const r = T.create(JSON.parse(fs.readFileSync(MODEL, 'utf8')));
  const d = r.predict('how do i hide cash income from tax');
  assert.strictEqual(d.intent, 'evasion_request'); assert.strictEqual(d.risk, 'high'); assert.strictEqual(d.needs_guard, true);
  assert.ok(d.confidence > 0.5 && d.high_risk_mass >= d.confidence - 1e-9);
  assert.strictEqual(r.predict('what is the capital of france', { guardMass: 0.35 }).needs_guard, false);
});
