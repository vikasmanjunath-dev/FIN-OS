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
const data = () => JSON.parse(read('js/reels-data.json'));

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
  const literals = [...new Set([...js.matchAll(/['"`](finos[_-][A-Za-z0-9_-]*)['"`]/g)].map((m) => m[1]))];
  for (const k of literals) assert.ok(/^finos_session_reels_web_$|^finos_lang$/.test(k), 'unexpected storage key: ' + k);
  assert.match(js, /KEY_SEEN = PREFIX \+ 'seen'/);
  assert.ok([...js.matchAll(/(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g)].every((m) => /^(key|'finos_lang')$/.test(m[1].trim())), 'storage is only reached through the key-taking helper');
  assert.match(js, /finos_session_reels_web_/);
  const html = read('html/reels.html');
  const css = read('css/reels.css');
  assert.ok(!/@import|url\(\s*["']?https?:/i.test(css));
  assert.ok(!/<script[^>]+src=["']https?:\/\/(?!cdn\.jsdelivr\.net)/i.test(html), 'only the site\'s usual script hosts');
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
