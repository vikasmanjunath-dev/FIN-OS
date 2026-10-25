'use strict';
// Money Reels on the website (html/reels.html): the exported data, the maths copy that runs the sliders, and the page's promises
// (everything stays in the browser, only files that exist, in the service worker's precache).
// The export and the parity check run the app's own TypeScript through mobile/scripts/export-reels-web.mts (the same loader the app's tests use).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const zlib = require('node:zlib');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const E = require('../js/reels-eval.js');

// Same limits as the export script (a failing test here means the script and its test disagree, not that the data is too big).
const BUDGET_KB = 720, GZIP_BUDGET_KB = 190;

const memo = {};
function exporter(...args) {
  const key = args.join(' ');
  if (!memo[key]) {
    const r = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './__tests__/register-aliases.mjs', 'scripts/export-reels-web.mts', ...args],
      { cwd: path.join(ROOT, 'mobile'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, EXPO_PUBLIC_REELS_DRAFTS: '' } });
    assert.equal(r.status, 0, 'export script failed:\n' + r.stderr);
    memo[key] = r.stdout;
  }
  return memo[key];
}
const rawData = () => JSON.parse(read('js/reels-data.json'));
const data = () => E.expand(rawData());           // the long form: every key spelled out, shared texts put back

// ── the export ────────────────────────────────────────────────────────────────────────────────────────────────

test('the export is deterministic and js/reels-data.json is what the app\'s live reels export today', () => {
  const a = exporter('--stdout');
  const again = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './__tests__/register-aliases.mjs', 'scripts/export-reels-web.mts', '--stdout'],
    { cwd: path.join(ROOT, 'mobile'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(again.status, 0, again.stderr);
  assert.equal(again.stdout, a, 'two runs gave different output');
  assert.equal(read('js/reels-data.json'), a, 'js/reels-data.json is stale: run mobile/scripts/export-reels-web.mts');
});

test('the data is under its size budget (raw and gzipped)', () => {
  const buf = fs.readFileSync(path.join(ROOT, 'js/reels-data.json'));
  assert.ok(buf.length / 1024 <= BUDGET_KB, `${(buf.length / 1024).toFixed(1)} KB raw, budget ${BUDGET_KB} KB`);
  assert.ok(zlib.gzipSync(buf).length / 1024 <= GZIP_BUDGET_KB, `${(zlib.gzipSync(buf).length / 1024).toFixed(1)} KB gzipped, budget ${GZIP_BUDGET_KB} KB`);
});

const NON_TEXT = new Set(['id', 'topic', 'kind', 'mood', 'who', 'tone', 'format', 'asOf', 'href', 'xFormat']);
const isPair = (v) => Array.isArray(v) && v.length === 2 && v.every((s) => typeof s === 'string');

test('every exported reel has both languages everywhere, and no text sits outside an [english, hindi] pair', () => {
  const d = data();
  assert.ok(d.reels.length >= 100, 'expected the live library, saw ' + d.reels.length);
  const bad = [];
  let pairs = 0;
  const walk = (v, where, key) => {
    if (isPair(v)) {
      pairs++;
      if (!v[0].trim() || !v[1].trim()) bad.push(where + ': empty text');
      if (/[A-Za-z]/.test(v[0]) && v[0].length > 12 && !/[ऀ-ॿ]/.test(v[1])) bad.push(where + ': Hindi has no Devanagari: ' + v[1]);
      if (/[A-Za-z]/.test(v[0]) && v[0] === v[1] && v[0].length > 6) bad.push(where + ': same in both languages: ' + v[0]);
      if (/\{\w+\}|NaN|undefined|Infinity/.test(v.join(' ')) && key !== 'takeaway') bad.push(where + ': unfilled or broken: ' + v.join(' / '));
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, where + '[' + i + ']', key));
    if (v && typeof v === 'object') return Object.entries(v).forEach(([k, x]) => walk(x, where + '.' + k, k));
    if (typeof v === 'string' && !NON_TEXT.has(key)) bad.push(where + ': text outside a language pair: ' + v);
  };
  d.reels.forEach((r) => {
    walk(r, r.id, '');
    assert.ok(isPair(r.title), r.id + ' title');
    assert.ok(r.scenes.length >= 4 && r.scenes.every((s) => isPair(s.say) && s.ms > 0), r.id + ' scenes');
    assert.ok(isPair(r.quiz.q) && isPair(r.quiz.why) && r.quiz.options.every(isPair) && r.quiz.answer >= 0 && r.quiz.answer < r.quiz.options.length, r.id + ' quiz');
  });
  assert.deepEqual(bad, []);
  assert.ok(pairs > 3000, 'the walk should have seen thousands of texts, saw ' + pairs);
});

test('reel ids are unique; beats and tool links are sound; a scam reel has no tool button', () => {
  const d = data(), ids = d.reels.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  const kinds = new Set(['guess', 'slider', 'myth', 'spot', 'path', 'sort', 'order']);
  for (const r of d.reels) {
    if (r.beat) {
      assert.ok(kinds.has(r.beat.kind), r.id + ' beat kind ' + r.beat.kind);
      assert.ok(r.beat.after >= 1 && r.beat.after <= r.scenes.length - 2, r.id + ' beat position');
    }
    if (r.act) {
      const p = decodeURIComponent(r.act.href);
      assert.ok(fs.existsSync(path.join(ROOT, p)), r.id + ' tool button points at a file that does not exist: ' + p);
      assert.ok(isPair(r.act.label));
    }
    if (r.topic === 'safety') assert.ok(!r.act || /^html\//.test(r.act.href), r.id);
    if (r.trust) assert.ok(isPair(r.trust.formula) && isPair(r.trust.assumes) && /^\d{4}-\d{2}-\d{2}$/.test(r.trust.asOf), r.id + ' trust note');
  }
  const sliderKinds = new Set(d.reels.filter((r) => r.beat && r.beat.kind === 'slider').map((r) => r.beat.model.kind));
  assert.ok(sliderKinds.size >= 8, 'the library should exercise most slider models, saw ' + [...sliderKinds].join(','));
});

test('the data holds no web addresses and no personal figures (example figures only, no reel built from a person\'s own numbers)', () => {
  const raw = read('js/reels-data.json');
  assert.ok(!/http:\/\//i.test(raw), 'an http:// address is in the data');
  assert.ok(!/https?:\/\//i.test(raw), 'a web address is in the data');
  assert.ok(!/"mine"/.test(raw));
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(raw), 'an email address is in the data');
});

test('the data file uses short keys and shared texts, and expand() restores the long form exactly (no short key is left, no pointer is left)', () => {
  const raw = rawData(), long = data();
  assert.equal(raw.v, 2);
  assert.ok(Array.isArray(raw.texts) && raw.texts.length > 10 && raw.texts.every(isPair), 'the shared text table');
  assert.ok(raw.reels.every((r) => !('scenes' in r) && !('quiz' in r)), 'reels should be written with short keys');
  const codes = new Set(Object.values(E.KEYS)), left = new Set();
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (codes.has(k)) left.add(k); walk(x); } };
  walk(long.reels);
  assert.deepEqual([...left], [], 'short keys left after expand');
  assert.equal(new Set(Object.values(E.KEYS)).size, Object.keys(E.KEYS).length, 'two keys share a short code');
  for (const r of long.reels) {
    if (r.trust) assert.ok(isPair(r.trust.formula), r.id + ' trust formula was not restored');
    if (r.act) assert.ok(isPair(r.act.label), r.id + ' act label was not restored');
  }
  const shared = raw.reels.filter((r) => r.w && typeof r.w.o === 'number').length;
  assert.ok(shared > 20, 'the shared table should be used by many reels, saw ' + shared);
});

test('the money facts are exported in both languages, with the figures already worked out', () => {
  const f = data().facts;
  assert.ok(f.length >= 20 && f.every(isPair));
  for (const x of f) { assert.ok(/[\u0900-\u097F]/.test(x[1]), x[0]); assert.ok(!/\{\w+\}|NaN|undefined/.test(x.join(' ')), x[0]); }
});

// ── the maths copy ─────────────────────────────────────────────────────────────────────────────────────────

const close = (a, b, what) => {
  if (a === null || b === null || b === undefined) return assert.ok((a === null || a === undefined || Number.isNaN(a)) && (b === null || b === undefined || Number.isNaN(b)), what + ': ' + a + ' vs ' + b);
  assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)), what + ': ' + a + ' vs ' + b);
};
const dataBeats = () => Object.fromEntries(data().reels.filter((r) => r.beat && r.beat.kind === 'slider').map((r) => [r.id, r.beat]));

test('js/reels-eval.js gives the app\'s answers for every slider model at every slider position (figures, takeaway, bars, labels)', () => {
  const ref = JSON.parse(exporter('--parity'));
  const beats = dataBeats();
  assert.ok(ref.sliders.length >= 8);
  const kinds = new Set();
  let checked = 0;
  for (const s of ref.sliders) {
    const b = beats[s.id];
    assert.ok(b, s.id + ' is a slider in the app but not in the export');
    kinds.add(s.kind);
    assert.equal(b.model.kind, s.kind);
    for (const st of s.steps) {
      const f = E.evalModel(b.model, st.x), w = `${s.id} @ ${st.x}`;
      for (const k of ['value', 'put', 'base', 'lost', 'diff']) close(Number.isFinite(f[k]) ? f[k] : null, st.fig[k], w + ' ' + k);
      assert.equal(!!f.years, !!st.fig.years, w + ' years flag');
      assert.deepEqual(E.sliderLine(b, st.x), [st.line.en, st.line.hi], w + ' takeaway');
      assert.deepEqual([E.xText(b, st.x, 'en'), E.xText(b, st.x, 'hi')], st.xt, w + ' x label');
      const bars = E.sliderBars(b, st.x);
      assert.equal(bars.length, st.bars.length, w + ' bars');
      bars.forEach((bar, i) => {
        assert.deepEqual(bar.label, [st.bars[i].label.en, st.bars[i].label.hi], w + ' bar label');
        assert.deepEqual(bar.text, [st.bars[i].text.en, st.bars[i].text.hi], w + ' bar text');
        assert.equal(bar.tone, st.bars[i].tone);
        close(bar.frac, st.bars[i].frac, w + ' bar frac');
      });
      checked++;
    }
  }
  assert.ok(checked > 200, 'checked ' + checked + ' slider positions');
  // every kind the app can draw is exercised by some live reel, or is at least handled by the evaluator
  for (const k of ['sip-years', 'sip-delay', 'inflation-years', 'emi-rate', 'emi-tenure', 'goal-sip', 'step-up', 'tax-income', 'corpus-spend', 'card-interest']) {
    if (!kinds.has(k)) {
      const probe = { 'sip-years': { monthly: 5000, rate: 12 }, 'sip-delay': { monthly: 5000, rate: 12, horizon: 30 }, 'inflation-years': { amount: 1e5, rate: 6 }, 'emi-rate': { principal: 3e6, years: 20, rate0: 9 }, 'emi-tenure': { principal: 1e6, rate: 9 }, 'goal-sip': { target: 1e6, rate: 12 }, 'step-up': { monthly: 5000, rate: 12, years: 20 }, 'tax-income': { deduction: 150000 }, 'corpus-spend': { corpus: 1e7, rate: 7 }, 'card-interest': { balance: 50000, monthlyPct: 3.5 } }[k];
      assert.ok(Number.isFinite(E.evalModel({ kind: k, ...probe }, 10).value) || k === 'corpus-spend', k + ' is not handled by the evaluator');
    }
  }
});

test('guess scale, verdicts, rupee wording and the fixed shuffle match the app', () => {
  const ref = JSON.parse(exporter('--parity'));
  for (const g of ref.guess) {
    for (const p of g.pos) assert.equal(E.posToValue(p.p, g.min, g.max), p.v, `posToValue ${p.p} on ${g.min}..${g.max}`);
    for (const b of g.back) close(E.valueToPos(b.v, g.min, g.max), b.p, 'valueToPos');
  }
  for (const p of ref.pairs) {
    const r = E.scoreGuess(p.g, p.a);
    assert.equal(r.verdict, p.res.verdict); assert.equal(r.side, p.res.side);
    close(Number.isFinite(r.times) ? r.times : null, p.res.times, 'times');
  }
  for (const r of ref.rounds) assert.equal(E.niceRound(r.v), r.r);
  for (const m of ref.moneys) assert.deepEqual(E.money(m.v), [m.m.en, m.m.hi], 'money ' + m.v);
  for (const d of ref.decks) assert.deepEqual(E.orderDeck(d.n), d.d, 'orderDeck ' + d.n);
});

test('every exported quiz keeps the same options, and its answer still points at the same option text as in the app\'s library (only the order is scrambled)', () => {
  const ref = JSON.parse(exporter('--parity')).quizzes, d = data(), byId = new Map(d.reels.map((r) => [r.id, r]));
  assert.equal(ref.length, d.reels.length);
  let moved = 0;
  for (const q of ref) {
    const r = byId.get(q.id);
    assert.ok(r, q.id + ' is in the library but not in the export');
    assert.deepEqual(r.quiz.options.map((o) => o.join('|')).sort(), q.options.map((o) => o.join('|')).sort(), q.id + ' options changed');
    assert.deepEqual(r.quiz.options[r.quiz.answer], q.answer, q.id + ' answer points at a different option');
    if (r.quiz.options.map((o) => o[0]).join('|') !== q.options.map((o) => o[0]).join('|')) moved++;
  }
  assert.ok(moved > ref.length / 2, 'the scramble should have moved most quizzes, moved ' + moved);
});

// ── seasons, the fact of the day, the week, saved and "I'll do this", the other beats ──────────────────────────

const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

test('seasonOf gives the app\'s season for every day from 2026 to 2031, and its badges, labels and tints', () => {
  const ref = JSON.parse(exporter('--parity'));
  let days = 0;
  for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2031, 11, 31); t += 86400000) {
    const u = new Date(t), local = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()), key = ymd(local), s = E.seasonOf(local);
    assert.equal(s ? s.id : undefined, ref.seasons[key], 'season on ' + key);
    days++;
  }
  assert.ok(days > 2000 && Object.keys(ref.seasons).length > 150);
  for (const id of ['diwali', 'budget', 'yearend']) {
    assert.deepEqual([E.SEASONS[id].badge, E.SEASONS[id].label, E.SEASONS[id].tint], [ref.seasonMeta[id].badge, ref.seasonMeta[id].label, ref.seasonMeta[id].tint], id);
  }
  // known edges, written out
  const id = (y, m, d) => (E.seasonOf(new Date(y, m - 1, d)) || {}).id || null;
  assert.equal(id(2026, 11, 3), 'diwali'); assert.equal(id(2026, 11, 2), null); assert.equal(id(2026, 11, 10), 'diwali'); assert.equal(id(2026, 11, 11), null);
  assert.equal(id(2027, 1, 28), null); assert.equal(id(2027, 1, 29), 'budget'); assert.equal(id(2027, 2, 4), 'budget'); assert.equal(id(2027, 2, 5), null);
  assert.equal(id(2027, 3, 14), null); assert.equal(id(2027, 3, 15), 'yearend'); assert.equal(id(2027, 3, 31), 'yearend');
  assert.equal(id(2031, 10, 20), null, 'Diwali dates are listed only to 2030');
});

test('the fact of the day is the app\'s fact for each sample date, and cycles through the whole list', () => {
  const ref = JSON.parse(exporter('--parity')), facts = data().facts;
  for (const f of ref.facts) assert.deepEqual(facts[E.factIndex(new Date(f.y, f.m - 1, f.d), facts.length)], f.text, `fact on ${f.y}-${f.m}-${f.d}`);
  const seen = new Set(); for (let i = 0; i < facts.length; i++) seen.add(E.factIndex(new Date(2026, 9, 1 + i), facts.length));
  assert.equal(seen.size, facts.length);
  assert.notEqual(E.factIndex(new Date(2026, 9, 1), facts.length), E.factIndex(new Date(2026, 9, 2), facts.length));
});

test('the weekly line and the seven-day count match the app, and a quiet week says nothing', () => {
  const ref = JSON.parse(exporter('--parity'));
  assert.ok(ref.weeks.length >= 4);
  for (const w of ref.weeks) {
    const mine = E.weekOf({ days: w.days }, new Date(2026, 9, 24));
    assert.deepEqual(mine, w.week);
    assert.deepEqual(E.weekLine(mine), w.line);
  }
  assert.equal(E.weekLine(E.weekOf({ days: {} }, new Date(2026, 9, 24))), null);
  const one = E.weekLine({ days: 1, reels: 1, pledges: 0, moves: 0, receipts: 0, together: 0, saves: 0 });
  assert.equal(one[0], 'This week: 1 reel on 1 day.');
  assert.ok(!/missed|streak|lost|behind/i.test(ref.weeks.map((w) => (w.line || []).join(' ')).join(' ')));
});

test('saved reels and "I\'ll do this" behave as the app\'s profile does, including bad ids and the caps (60 saved, 20 moves)', () => {
  const ref = JSON.parse(exporter('--parity')).profile;
  let saved = [], pledges = []; const at = new Date('2026-10-24T08:00:00.000Z');
  for (const step of ref) {
    if (step.op === 'save') { const r = E.toggleSaved(saved, step.id); saved = r.list; assert.equal(r.kept, step.kept, step.id); }
    else if (step.op === 'pledge') pledges = E.addPledge(pledges, step.id, at);
    else pledges = E.removePledge(pledges, step.id);
    assert.deepEqual(saved, step.saved, 'saved after ' + step.op + ' ' + step.id);
    assert.deepEqual(pledges.map((p) => p.id), step.pledged, 'moves after ' + step.op + ' ' + step.id);
  }
  assert.equal(saved.length, 60); assert.equal(pledges.length, 20);
  assert.ok(pledges.every((p) => p.at === '2026-10-24T08:00:00.000Z'));
});

test('myth, spot, sort and order are marked as the app marks them', () => {
  const s = JSON.parse(exporter('--parity')).scoring;
  const myth = [{ fact: true }, { fact: false }, { fact: true }, { fact: false }];
  for (const x of s.myth) assert.deepEqual(E.scoreMyth(myth, x.a.map((v) => (v === undefined ? null : v))), x.r);
  const parts = [{}, { flag: 'a' }, {}, { flag: 'b' }, { flag: 'c' }];
  for (const x of s.spot) assert.deepEqual(E.scoreSpot(parts, x.p), x.r);
  const cards = [{ bin: 0 }, { bin: 1 }, { bin: 1 }, { bin: 0 }, { bin: 2 }];
  for (const x of s.sort) assert.deepEqual(E.scoreSort(cards, x.a), x.r);
  for (const x of s.order) assert.deepEqual(E.scoreOrder(x.c, 4), x.r);
  assert.ok(s.spot.some((x) => x.r.missed.length) && s.spot.some((x) => x.r.wrong.length), 'the samples should include misses and wrong taps');
});


// ── the page script itself, run without a browser ────────────────────────────────────────────────────────────

/** Loads js/reels.js into a bare context (no DOM: its start-up waits for the document, which never comes) and returns its pure helpers. */
function pageHelpers(stored = {}) {
  const win = { FinosReelsEval: E, matchMedia: () => ({ matches: false }), addEventListener() {}, requestAnimationFrame() {}, location: { search: '' },
    localStorage: { getItem: (k) => (k in stored ? stored[k] : null), setItem() {}, removeItem() {} } };
  const ctx = vm.createContext({ window: win, document: { readyState: 'loading', addEventListener() {} }, performance: { now: () => 0 }, URLSearchParams, Math, Date, JSON, Number, Object, Array, Set, Map, String, RegExp, Error, console });
  vm.runInContext(read('js/reels.js'), ctx, { filename: 'js/reels.js' });
  assert.ok(win.FinosReelsPage, 'js/reels.js should expose its pure helpers');
  const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
  return new Proxy(win.FinosReelsPage, { get: (o, k) => (typeof o[k] === 'function' && /^clean/.test(String(k)) ? (...a) => plain(o[k](...a)) : o[k]) });
}

test('every picture draws with real numbers: no NaN, undefined or Infinity in any attribute of any scene, in either language, at every moment', () => {
  const H = pageHelpers(), bad = [];
  let drawn = 0;
  for (const lang of ['en', 'hi']) {
    H.setLang(lang);
    for (const r of data().reels) {
      r.scenes.forEach((sc, i) => {
        for (const p of [0, 0.2, 0.5, 0.8, 1]) {
          if (!sc.prop) continue;
          const svg = H.propSvg(sc.prop, p, 1234);
          drawn++;
          for (const m of svg.matchAll(/\s([\w:-]+)="([^"]*)"/g)) if (/NaN|undefined|Infinity|null/.test(m[2])) bad.push(`${r.id} scene ${i + 1} ${sc.prop.kind} @${p}: ${m[1]}="${m[2]}"`);
          for (const m of svg.matchAll(/<text\b([^>]*)>/g)) for (const a of ['x', 'y', 'font-size']) { const v = (m[1].match(new RegExp('\\s' + a + '="([^"]*)"')) || [])[1]; if (v === undefined || !Number.isFinite(Number(v))) bad.push(`${r.id} scene ${i + 1} ${sc.prop.kind}: <text> ${a}=${v}`); }
          if (/>(NaN|undefined|Infinity)</.test(svg)) bad.push(`${r.id} scene ${i + 1}: a number printed as text`);
        }
      });
    }
  }
  assert.deepEqual([...new Set(bad)].slice(0, 10), []);
  assert.ok(drawn > 2000, 'drew ' + drawn + ' pictures');
  // the old bug: a counter with a label and no size
  assert.ok(!/NaN/.test(H.propSvg({ kind: 'counter', from: 0, to: 5000, format: 'inr', label: ['a label', 'एक लेबल'] }, 1, 0)));
  assert.ok(!/NaN/.test(H.propSvg({ kind: 'counter', from: 0, to: 12, format: 'plain', unit: ['years', 'साल'], label: ['a label', 'एक लेबल'] }, 1, 0)));
});

test('hostile values in storage never stop the page: each reader returns a clean value or an empty one', () => {
  const H = pageHelpers();
  const hostile = [null, undefined, 0, 1, -5, NaN, 'text', '', true, [], {}, [1, 2, 3], [null, {}, [], 'x'], { a: 1 }, 'x'.repeat(1e5), { __proto__: { polluted: 1 } }];
  for (const v of hostile) {
    for (const f of ['cleanSeen', 'cleanDays', 'cleanStats', 'cleanSaved', 'cleanPledges']) assert.doesNotThrow(() => H[f](v), f + ' threw on ' + JSON.stringify(v));
    assert.doesNotThrow(() => H.cleanEpisode(v, '2026-10-25', new Set(['a'])));
    assert.doesNotThrow(() => H.streakNow(H.cleanDays(v), '2026-10-25'));
  }
  // days: numbers, impossible dates, repeats, wrong shapes: only real calendar days survive, once each, in order
  assert.deepEqual(H.cleanDays([20261025, '2026-13-45', '2026-02-30', 'yesterday', null, '2026-10-24', '2026-10-24', '2026-10-23', {}, ['2026-10-22']]), ['2026-10-23', '2026-10-24']);
  assert.equal(H.cleanDays(Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10))).length, 120);
  assert.equal(H.streakNow(H.cleanDays([1, 2, 3, 'x']), '2026-10-25'), 0);
  assert.equal(H.streakNow(['2026-10-24', '2026-10-23', 5, 'junk'], '2026-10-25'), 2, 'even a list that was not cleaned cannot throw');
  // seen: only well-formed ids with a real date and a boolean
  const seen = H.cleanSeen({ 'start-early': { at: '2026-10-24T08:00:00.000Z', correct: true }, 'bad id!': { at: '2026-10-24T08:00:00.000Z' }, 'emi-trap': { at: 'not a date', correct: true }, 'rule-of-72': 5, 'inflation': { at: 7 }, 'ok-one': { at: '2026-10-24', correct: 'yes' }, __proto__x: {} });
  assert.deepEqual(Object.keys(seen).sort(), ['ok-one', 'start-early']);
  assert.equal(seen['ok-one'].correct, false);
  assert.deepEqual(H.cleanSeen([{ at: '2026-10-24' }]), {});
  // stats: counters only, whole numbers, capped, real days
  const stats = H.cleanStats({ v: 9, days: { '2026-10-24': { fin: 3.7, pledges: -1, saves: 'x', moves: Infinity, evil: 1, receipts: 9999 }, '2026-99-99': { fin: 1 }, '2026-10-23': 5, '2026-10-22': { fin: NaN } } });
  assert.deepEqual(stats, { v: 1, days: { '2026-10-24': { fin: 3, receipts: 500 }, '2026-10-22': {} } });
  assert.doesNotThrow(() => E.weekOf(stats, new Date(2026, 9, 25)));
  // saved and moves
  assert.deepEqual(H.cleanSaved(['a-b', 'a-b', 'Bad Id', 5, null, 'c']), ['a-b', 'c']);
  assert.deepEqual(H.cleanPledges([{ id: 'a-b', at: '2026-10-24T00:00:00Z', extra: 1 }, { id: 'a-b', at: 'x' }, { id: 5, at: 'x' }, null, 'str', { id: 'ok', at: 'y'.repeat(50) }]), [{ id: 'a-b', at: '2026-10-24T00:00:00Z' }]);
  // today's episode: only for today, only real reels, no repeats
  const known = new Set(['a-b', 'c-d', 'e-f']);
  assert.deepEqual(H.cleanEpisode({ day: '2026-10-25', ids: ['a-b', 'c-d'] }, '2026-10-25', known), ['a-b', 'c-d']);
  for (const bad of [{ day: '2026-10-24', ids: ['a-b'] }, { day: '2026-10-25', ids: ['a-b', 'zzz'] }, { day: '2026-10-25', ids: ['a-b', 'a-b'] }, { day: '2026-10-25', ids: [] }, { day: '2026-10-25', ids: 'a-b' }, { day: '2026-10-25', ids: [1, 2] }, 'x', null]) assert.equal(H.cleanEpisode(bad, '2026-10-25', known), null, JSON.stringify(bad));
});

test('start-up with a damaged store works: the page reads corrupted raw values from localStorage and still builds today\'s episode and its status', () => {
  const raw = { finos_session_reels_web_days: '[1,2,{"x":3},"2026-02-31"]', finos_session_reels_web_seen: '{"a":1,"b":[],"__proto__":{"at":"2026-10-24"}}', finos_session_reels_web_episode: '{"day":5,"ids":"x"}',
    finos_session_reels_web_stats: '[[[', finos_session_reels_web_saved: '"str"', finos_session_reels_web_pledges: '{"id":1}' };
  for (const damaged of [raw, Object.fromEntries(Object.keys(raw).map((k) => [k, '{"a":'])), Object.fromEntries(Object.keys(raw).map((k) => [k, '0'])), Object.fromEntries(Object.keys(raw).map((k) => [k, 'null']))]) {
    const H = pageHelpers(damaged);
    assert.doesNotThrow(() => H.loadLists());
    const s = H.state;
    assert.deepEqual([s.days.length, Object.keys(s.seen).length, s.saved.length, s.pledges.length, Object.keys(s.stats.days).length], [0, 0, 0, 0, 0]);
    const ep = H.composeEpisode(data().reels, s.seen, '2026-10-25');
    assert.equal(ep.picks.length, 3);
    assert.ok(Number.isFinite(H.streakNow(s.days, '2026-10-25')));
  }
});

test('the controls are at least 44 x 44 on this page (header, skip link, language toggle, back link, panels) and the page gives Hindi names to what it and the shared chrome say in English', () => {
  const css = read('css/reels.css'), js = read('js/reels.js'), html = read('html/reels.html');
  for (const rule of [/\.rl-body \.mob-ham[^{]*\{[^}]*min-width: 44px; min-height: 44px/, /#finos-skip-link \{[^}]*min-height: 44px/, /\.rl-lang button \{[^}]*min-height: 44px/, /\.page-back-link \{[^}]*min-height: 44px/,
    /\.rl-statusrow \.rl-btn \{ min-height: 44px/, /\.rl-msg \.rl-opt \{ min-height: 44px/, /input\[type="range"\] \{ height: 44px/, /\.rl-card summary \{ min-height: 44px/]) assert.match(css, rule);
  for (const sel of ['#floatThemeBtn', '#fs-toggle', '#finos-alert-bell']) assert.ok(css.includes('.rl-body ' + sel), sel);
  assert.match(html, /#floatThemeBtn \{[^}]*width:44px;height:44px/);
  assert.match(html, /<body class="rl-body"/);
  // Hindi names: the page's own (language group, owl) and the shared ones it translates
  assert.match(js, /langLabel: 'भाषा'/); assert.match(js, /mitra: 'मित्रा उल्लू'/);
  assert.ok(!/aria-label="Mitra the owl"/.test(js), 'the owl\'s name comes from the language table');
  for (const en of ['Skip to main content', 'Open navigation menu', 'Page tools', 'Search', 'FIN-OS Alerts']) assert.match(js, new RegExp("'" + en + "': '"));
  const H = pageHelpers(); H.setLang('hi'); assert.match(H.mitraSvg('happy'), /aria-label="मित्रा उल्लू"/);
  H.setLang('en'); assert.match(H.mitraSvg('happy'), /aria-label="Mitra the owl"/);
});

// ── the page ───────────────────────────────────────────────────────────────────────────────────────────────

const pageFiles = () => {
  const html = read('html/reels.html');
  const found = [];
  for (const m of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"'#?]+)/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|data:|javascript:|tel:)/i.test(u)) continue;
    found.push(path.normalize(path.join('html', decodeURIComponent(u))));
  }
  return found;
};

test('the reels page references only files that exist, and loads the new scripts in a working order', () => {
  const files = pageFiles();
  assert.ok(files.length > 10);
  for (const f of files) assert.ok(fs.existsSync(path.join(ROOT, f)), 'html/reels.html references a missing file: ' + f);
  const html = read('html/reels.html');
  for (const f of ['css/reels.css', 'js/reels-eval.js', 'js/reels.js', 'js/finos-taxcore.js']) assert.ok(files.includes(f), f + ' is not loaded by the page');
  assert.ok(html.indexOf('finos-taxcore.js') < html.indexOf('reels-eval.js') && html.indexOf('reels-eval.js') < html.indexOf('js/reels.js'), 'tax core, then the evaluator, then the page script');
  assert.match(html, /<h1[ >]/);
  assert.match(html, /education, not advice/i);
  assert.match(html, /<main[ >]/);
  assert.match(html, /mobile-nav\.js/, 'the off-canvas menu needs mobile-nav.js');
  // the page script fetches exactly the data file, relative to the page
  const js = read('js/reels.js');
  const fetches = [...js.matchAll(/fetch\(\s*([^)]*)\)/g)].map((m) => m[1].trim());
  assert.equal(fetches.length, 1, 'reels.js should make exactly one fetch, saw: ' + fetches.join(' | '));
  assert.match(js, /\.\.\/js\/reels-data\.json/);
  assert.ok(fs.existsSync(path.join(ROOT, 'js/reels-data.json')));
});

test('the page keeps everything in the browser: no other network calls, no analytics, only finos_session_reels_web_ keys (and the site language / theme)', () => {
  const js = read('js/reels.js') + '\n' + read('js/reels-eval.js');
  assert.ok(!/XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator\.share|gtag|dataLayer|analytics|mixpanel|segment\.|posthog|\bimport\(/i.test(js));
  assert.ok(!/https?:\/\//i.test(js), 'a web address in the page script');
  assert.ok(!/document\.cookie|indexedDB|sessionStorage/.test(js));
  // every storage key written in the page script is a literal: finos_session_reels_web_*, or the site's own language setting
  const literals = [...new Set([...js.matchAll(/['"`](finos_[A-Za-z0-9_-]*)['"`]/g)].map((m) => m[1]))];
  for (const k of literals) assert.ok(/^finos_session_reels_web_$|^finos_lang$/.test(k), 'unexpected storage key: ' + k);
  assert.match(js, /KEY_SEEN = PREFIX \+ 'seen'/);
  assert.ok([...js.matchAll(/(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g)].every((m) => /^(key|k|'finos_lang')$/.test(m[1].trim())), 'storage is only reached through the key-taking helper');
  assert.match(js, /finos_session_reels_web_/);
  const html = read('html/reels.html');
  const css = read('css/reels.css');
  assert.ok(!/@import|url\(\s*["']?https?:/i.test(css));
  assert.ok(!/<script[^>]+src=["']https?:\/\/(?!cdn\.jsdelivr\.net)/i.test(html), 'only the site\'s usual script hosts');
});

test('the page marks beats with the evaluator, expands the data, keeps its lists under the reels prefix and previews only known seasons', () => {
  const js = read('js/reels.js'), html = read('html/reels.html');
  assert.match(js, /E\.expand\(data\)/);
  for (const f of ['scoreMyth', 'scoreSpot', 'scoreSort', 'scoreOrder']) assert.match(js, new RegExp('E\\.' + f));
  assert.ok(!/filter\(\(c, k\) => st\.answers/.test(js), 'beats are marked by js/reels-eval.js, not by a second copy in the page');
  for (const k of ['KEY_STATS', 'KEY_SAVED', 'KEY_PLEDGES']) assert.match(js, new RegExp(k + ' = PREFIX'));
  assert.match(js, /E\.SEASONS\[want\]/);
  assert.match(html, /id="rl-moves-btn"[^>]*aria-expanded="false"[^>]*aria-controls="rl-moves"/);
  assert.match(html, /<section[^>]*id="rl-moves"[^>]*hidden/);
  assert.match(read('css/reels.css'), /prefers-reduced-motion/);
  // what the stats hold is numbers only, never a reel name
  assert.ok(!/bumpStat\([^)]*(id|title)/.test(js));
});

test('offline after the first visit: everything the page loads from this site is a type the service worker caches (precache or stale-while-revalidate)', () => {
  const sw = read('sw.js');
  const swr = /path\.endsWith\('\.js'\) \|\| path\.endsWith\('\.css'\) \|\| path\.endsWith\('\.json'\)/.test(sw);
  assert.ok(swr);
  for (const f of pageFiles()) {
    if (/\.(js|css|json|png|svg)$/.test(f)) continue;
    assert.ok(/html\/(reels|foundations)\.html$/.test(f) || /\.html$/.test(f), 'unexpected asset type: ' + f);
  }
  assert.match(read('html/reels.html'), /rel="manifest"/);
  assert.match(read('html/reels.html'), /pwa-init\.js/);
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.display, 'standalone'); assert.ok(m.icons.length >= 2);
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/icons/icon-192.png')));
});

test('the service worker precaches the reels page, script, maths and styles; the data file is cached on first use instead', () => {
  const sw = read('sw.js');
  for (const f of ['./html/reels.html', './js/reels.js', './js/reels-eval.js', './js/finos-taxcore.js', './css/reels.css']) {
    assert.ok(sw.includes("'" + f + "'"), f + ' is not in PRECACHE_ASSETS');
    assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' does not exist');
  }
  // 150 KB of Hindi and English text is not downloaded by every visitor at install; the existing .json strategy keeps it for offline after the first visit.
  assert.ok(!sw.includes("'./js/reels-data.json'"));
  assert.match(sw, /path\.endsWith\('\.json'\)\) \{\s*event\.respondWith\(staleWhileRevalidate/);
});

test('the page is reachable: linked from Learn and found by site search', () => {
  assert.match(read('html/foundations.html'), /href="reels\.html"/);
  assert.match(read('js/finos-search-index.js'), /reels\.html/);
});
