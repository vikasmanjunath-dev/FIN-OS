// Hindi coverage for the Money Score, Future Loss and feedback prompt. Structural checks only: a fluent speaker still has to review the wording.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/finos-money-score.js');

const ROOT = path.join(__dirname, '..');
const TABLE = {};
global.FinosI18n = { register: (code, t) => Object.assign(TABLE, t) };
delete require.cache[require.resolve('../js/i18n/hi.js')];
require('../js/i18n/hi.js');
delete global.FinosI18n;

const holes = (s) => (String(s).match(/\{\w+\}/g) || []).sort();
const tags = (s) => String(s).match(/<\/?[a-z][^>]*>/gi) || [];
const HAS_DEVANAGARI = /[ऀ-ॿ]/;
const src = (f) => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');

test('every translation keeps the {placeholders} and HTML tags of its English key exactly', () => {
  const bad = [];
  for (const [k, v] of Object.entries(TABLE)) {
    if (JSON.stringify(holes(k)) !== JSON.stringify(holes(v))) bad.push(['placeholders', k.slice(0, 70), holes(k), holes(v)]);
    if (JSON.stringify(tags(k)) !== JSON.stringify(tags(v))) bad.push(['tags', k.slice(0, 70), tags(k), tags(v)]);
  }
  assert.deepStrictEqual(bad, []);
});

test('every translation is real Hindi (or a bare number/symbol), never empty or left in English by accident', () => {
  const bad = Object.entries(TABLE).filter(([k, v]) => !String(v).trim() || (!HAS_DEVANAGARI.test(v) && v !== k && !/^[\d\s{}/→·%+▲▼✓👍👎.…:()\-–—]*$/.test(v) && !/^[A-Z0-9 &/+.\-]+$/.test(v)));
  assert.deepStrictEqual(bad.map(([k]) => k), []);
});

/* ── every key the scoring core can ask for ──────────────────────────────────────────────────────────────── */
function coreKeys() {
  const keys = new Set();
  const addT = (t) => { if (!t) return; keys.add(t.key); Object.values(t.params || {}).forEach((v) => { if (v && typeof v === 'object' && 't' in v) keys.add(v.t); }); };
  let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const base = { age: 30, monthlyIncome: 100000, monthlyExpenses: 70000, monthlyEmi: 20000, liquidSavings: 100000, monthlyInvesting: 5000, investedTotal: 600000, termCover: 0, healthCover: 0, dependents: 1 };
  const profiles = [base, { ...base, highInterestDebt: true }, { ...base, dependents: 0 }, { ...base, termCover: 12e6 }, { ...base, monthlyExpenses: 130000, monthlyEmi: 0, liquidSavings: 2e6 }];
  for (let i = 0; i < 3000; i++) {
    const inc = 20000 + Math.floor(rnd() * 400000);
    profiles.push({ age: 18 + Math.floor(rnd() * 60), monthlyIncome: inc, monthlyExpenses: 1000 + Math.floor(rnd() * inc * 1.2), monthlyEmi: rnd() < 0.3 ? 0 : Math.floor(rnd() * inc * 0.7), liquidSavings: Math.floor(rnd() * 3e6),
      monthlyInvesting: Math.floor(rnd() * inc * 0.3), investedTotal: Math.floor(rnd() * 5e7), termCover: rnd() < 0.4 ? 0 : Math.floor(rnd() * 5e7), healthCover: rnd() < 0.4 ? 0 : Math.floor(rnd() * 2e6), dependents: Math.floor(rnd() * 4), highInterestDebt: rnd() < 0.3 });
  }
  for (const ctx of [undefined, { leakMonthly: 5400 }]) for (const p of profiles) {
    const r = M.compute(p, ctx);
    if (!r.ok) continue;
    r.actions.forEach((a) => { addT(a.titleT); addT(a.detailT); keys.add(a.cta); });
    r.pillars.forEach((x) => { addT(x.detailT); keys.add(x.label); });
    keys.add(r.band.label);
  }
  // the validation messages, including the ones with a field name inside
  ['age', 'monthlyIncome', 'monthlyExpenses', 'dependents', 'monthlyEmi', 'liquidSavings', 'monthlyInvesting', 'investedTotal', 'termCover', 'healthCover'].forEach((f) => {
    M.compute({ ...base, [f]: f === 'age' ? 5 : f === 'dependents' ? 99 : '' }).errorsT?.forEach(addT);
    M.compute({ ...base, [f]: -1 }).errorsT?.forEach(addT);
    M.compute({ ...base, [f]: 1e13 }).errorsT?.forEach(addT);
  });
  M.compute({}).errorsT.forEach(addT);
  M.BANDS.forEach((b) => keys.add(b.label));
  Object.values(M.LABELS).forEach((l) => keys.add(l));
  return keys;
}

test('every sentence, label, button and message the scoring core can produce has a Hindi entry', () => {
  const keys = coreKeys();
  assert.ok(keys.size >= 45, 'the harvest looks too small: ' + keys.size);
  const missing = [...keys].filter((k) => !(k in TABLE));
  assert.deepStrictEqual(missing, []);
});

/* ── every literal the three UI modules pass to tr() or declare as a label ──────────────────────────────── */
function uiKeys(file) {
  const text = src(file), keys = new Set();
  const lit = /'((?:[^'\\\n]|\\.)*)'/;
  const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  // tr('literal' ...), Tt('literal'), S('literal' ...)
  for (const m of text.matchAll(/\b(?:tr|Tt|S)\(\s*'((?:[^'\\\n]|\\.)*)'/g)) keys.add(unescape(m[1]));
  // tr(cond ? 'a' : 'b', ...) and nested ternaries: every quoted literal inside a tr( ... ) argument list that contains a template hole or a tag
  for (const m of text.matchAll(/\btr\(\s*(?:one|same|w\.delta|filled|r\.ok|lang\(\)|sample|r\.enoughData|ctx\.subs)[^;]*?\)/g)) for (const q of m[0].matchAll(new RegExp(lit.source, 'g'))) if (/[A-Za-z]{3}/.test(q[1])) keys.add(unescape(q[1]));
  // label/hint/group declarations and option labels
  for (const m of text.matchAll(/\b(?:label|hint|group):\s*'((?:[^'\\\n]|\\.)*)'/g)) if (m[1]) keys.add(unescape(m[1]));
  for (const m of text.matchAll(/\[\d+,\s*'((?:[^'\\\n]|\\.)*)'\]/g)) keys.add(unescape(m[1]));
  // OUTCOME messages and the sources of prefilled answers
  const outcome = /const OUTCOME = \{([\s\S]*?)\n  \};/.exec(text);
  if (outcome) for (const m of outcome[1].matchAll(/:\s*'((?:[^'\\\n]|\\.)*)'/g)) keys.add(unescape(m[1]));
  return keys;
}

test('every literal the Money Score, Future Loss and feedback UI can show has a Hindi entry', () => {
  const missing = {};
  for (const f of ['finos-money-score.js', 'finos-leak.js', 'finos-feedback.js']) {
    const keys = uiKeys(f);
    assert.ok(keys.size >= (f === 'finos-money-score.js' ? 40 : 10), f + ' harvest looks too small: ' + keys.size);
    // The insurance sentences are built as 'first half' + tail, so the scan sees the first half only. The full sentences are checked above through the core harvest.
    const FIRST_HALVES = [/^Add (term life|health) cover of \{/];
    const gone = [...keys].filter((k) => !(k in TABLE) && !FIRST_HALVES.some((re) => re.test(k)) && !/^[\d\s/→+·%.{}:()\-]+$/.test(k) && !/^(hint|label|group|none)$/i.test(k));
    if (gone.length) missing[f] = gone;
  }
  assert.deepStrictEqual(missing, {});
});

test('money formatting turns L and Cr into लाख and करोड़ for Hindi readers', () => {
  global.FinosI18n = { lang: () => 'hi', t: (k, fb) => (k in TABLE ? TABLE[k] : fb) };
  const tr = M.tr;
  assert.strictEqual(tr('Build your emergency fund by {gap}', { gap: { m: 440000 } }), 'अपनी आपातकालीन निधि में ₹4.40 लाख और जोड़ें');
  assert.strictEqual(tr('Free up {free} a month', { free: { m: 25000000 } }), 'हर महीने ₹2.50 करोड़ बचाएँ');
  assert.strictEqual(tr('Free up {free} a month', { free: { m: 5000 } }), 'हर महीने ₹5,000 बचाएँ');
  assert.strictEqual(tr('Your FIN-OS Money Score is <b>{score}</b> out of 100.', { score: 35 }), 'आपका FIN-OS मनी स्कोर 100 में से <b>35</b> है।');
  assert.strictEqual(tr('Something with no entry {x}', { x: 5 }), 'Something with no entry 5');          // no entry: English, filled in
  delete global.FinosI18n;
});

test('without a language, tr() returns the English template filled in (nothing changes for English readers)', () => {
  delete global.FinosI18n;
  assert.strictEqual(M.tr('Build your emergency fund by {gap}', { gap: { m: 440000 } }), 'Build your emergency fund by ₹4.40 L');
  assert.strictEqual(M.tr('{cta} →', { cta: { t: 'Open the planner' } }), 'Open the planner →');
});
