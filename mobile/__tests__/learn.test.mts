// Learn: the extracted content, the website-shaped progress, and the Health Score Knowledge pillar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L from '@/lib/learn';
import * as T from '@/lib/trackers';

const MOBILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.join(MOBILE, '..');
const CONTENT = path.join(MOBILE, 'content', 'learn');
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8'));
const manifest: L.Manifest = readJson('manifest.json');
const review: { items: L.ReviewItem[] } = readJson('review.json');
const lessonFiles = fs.readdirSync(CONTENT).filter(f => f.endsWith('.json') && f !== 'manifest.json' && f !== 'review.json');
const lessons: Record<string, L.Lesson> = Object.fromEntries(lessonFiles.map(f => [f.replace(/\.json$/, ''), readJson(f)]));

// ── content ──────────────────────────────────────────────────────────────────

test('the committed content is exactly what the extractor produces from the website pages', () => {
  const out = execFileSync('python3', [path.join(MOBILE, 'scripts', 'extract-learn.py'), '--check'], { encoding: 'utf8' });
  assert.match(out, /up to date/);
});

test('manifest: unique ids, known categories, real source pages, real phone routes, every lesson has a file', () => {
  const ids = new Set<string>();
  const cats = new Set(manifest.categories.map(c => c.id));
  for (const e of manifest.lessons) {
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`); ids.add(e.id);
    assert.ok(cats.has(e.category), `${e.id}: unknown category ${e.category}`);
    assert.ok(fs.existsSync(path.join(REPO, e.source)), `${e.id}: missing source ${e.source}`);
    assert.ok(['lesson', 'interactive'].includes(e.kind));
    if (e.tool) {
      const p = e.tool.replace(/^\//, '');
      const parent = path.dirname(p);
      const hit = [`app/${p}.tsx`, `app/${p}/index.tsx`, `app/(tabs)/${p}.tsx`, `app/${parent}/[id].tsx`].some(f => fs.existsSync(path.join(MOBILE, f)));
      assert.ok(hit, `${e.id}: tool route ${e.tool} has no screen`);
    }
    if (e.kind === 'lesson') {
      assert.ok(lessons[e.id], `${e.id}: no lesson file`);
      assert.ok(e.minutes >= 1 && e.words > 40, `${e.id}: reading time ${e.minutes} / words ${e.words}`);
      assert.ok(e.title && e.summary, `${e.id}: title/summary`);
    } else {
      assert.ok(!lessons[e.id], `${e.id}: interactive page must not be flattened`);
      assert.equal(e.minutes, 0);
    }
  }
  assert.deepEqual(Object.keys(lessons).sort(), manifest.lessons.filter(e => e.kind === 'lesson').map(e => e.id).sort());
  // every learn-*/insight-* page of the website is either a lesson here or listed as excluded
  const web = fs.readdirSync(path.join(REPO, 'html')).filter(f => /^(learn-|insight-)/.test(f));
  const covered = new Set(manifest.lessons.map(e => path.basename(e.source)));
  for (const f of web) assert.ok(covered.has(f) || f in manifest.excluded, `${f} is neither extracted nor excluded`);
  assert.equal(web.filter(f => f.startsWith('learn-')).length, 15);
  assert.equal(web.filter(f => f.startsWith('insight-')).length, 5);
});

test('lesson files: well-formed blocks, no markup leaking through, no empty sections', () => {
  for (const [id, l] of Object.entries(lessons)) {
    assert.equal(l.id, id);
    assert.ok(l.sections.length > 0, id);
    for (const s of l.sections) {
      assert.ok(s.heading || s.blocks.length, `${id}: empty section`);
      for (const b of s.blocks) {
        const text = JSON.stringify(b);
        assert.ok(!/<\/?[a-z][^>]*>/i.test(text), `${id}: html tag in ${text.slice(0, 80)}`);
        assert.ok(!/\bfunction\s*\(|\bdocument\.|getElementById|=>\s*\{/.test(text), `${id}: script text in ${text.slice(0, 80)}`);
        if (b.t === 'p' || b.t === 'h') assert.ok(b.text.trim().length > 0, id);
        if (b.t === 'ul' || b.t === 'ol') assert.ok(b.items.length > 0 && b.items.every(i => i.trim()), id);
        if (b.t === 'table') assert.ok(b.rows.length > 0, id);
        if (b.t === 'callout') assert.ok(b.title || b.text, id);
        assert.ok(!/\s{2,}/.test(JSON.stringify(b).replace(/\\n/g, ' ')), `${id}: unnormalised whitespace`);
      }
    }
  }
});

test('external web references stay available in the phone lesson reader as labelled HTTPS links', () => {
  for (const [id, lesson] of Object.entries(lessons)) {
    for (const source of lesson.sources ?? []) {
      assert.ok(source.label.trim(), `${id}: source has a label`);
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:', `${id}: source should use HTTPS`);
      assert.ok(url.hostname.includes('.'), `${id}: source has a hostname`);
    }
  }
  assert.ok(lessons.forex.sources?.some(s => s.url.includes('bis.org')));
  assert.ok(lessons.forex.sources?.some(s => s.url.includes('rbi.org.in')));
  assert.ok(lessons.commodity.sources?.some(s => s.url.includes('sebi.gov.in')));
  assert.ok(lessons.crypto.sources?.some(s => s.url.includes('incometax.gov.in')));
});

test('review: every doubt is flagged in a lesson, every flag has a documented reason, and the notes file lists them all', () => {
  const known = new Set(review.items.map(i => i.id));
  for (const i of review.items) {
    assert.ok(i.quote && i.why && i.current, i.id);
    assert.ok(['high', 'medium', 'low'].includes(i.confidence), i.id);
    assert.ok(lessons[i.lesson], `${i.id}: lesson ${i.lesson}`);
  }
  const flagged = new Set<string>();
  for (const [id, l] of Object.entries(lessons)) {
    const seen = new Set<string>();
    for (const s of l.sections) for (const b of s.blocks) {
      if (b.needsReview) {
        assert.ok(b.reviewReasons?.length, `${id}: flagged block without reasons`);
        for (const r of b.reviewReasons!) { assert.ok(known.has(r), `${id}: unknown reason ${r}`); seen.add(r); flagged.add(r); }
      }
    }
    assert.equal(l.needsReview, seen.size > 0, `${id}: needsReview mismatch`);
    assert.deepEqual([...l.reviewReasons].sort(), [...seen].sort(), id);
  }
  assert.deepEqual([...flagged].sort(), [...known].sort());
  const md = fs.readFileSync(path.join(REPO, 'docs', 'agent-notes', 'learn-review.md'), 'utf8');
  for (const i of review.items) assert.ok(md.includes(i.why.replace(/\|/g, '/')), `learn-review.md is missing ${i.id}`);
});

test('previously flagged stale claims are corrected in the website and extracted phone lessons', () => {
  const text = (id: string) => JSON.stringify(lessons[id].sections);
  assert.doesNotMatch(text('finance101'), /Government inflation is 6%/);
  assert.doesNotMatch(text('forex'), /83\.50|100x|Power of 100x/);
  assert.doesNotMatch(text('insight-emi'), /close a 20-year loan in 12 years/);
  assert.doesNotMatch(text('money_market'), /12\.5% after 1 year|risk-free but saves you/);
  assert.doesNotMatch(text('crypto'), /If Market Cap is \$1M but FDV is \$100M, run away/);
  assert.doesNotMatch(text('fno'), /66% of the time, markets are sideways/);
});

test('learnContent.ts requires every lesson file (generated, so Metro bundles all of them)', () => {
  const ts = fs.readFileSync(path.join(MOBILE, 'lib', 'learnContent.ts'), 'utf8');
  for (const id of Object.keys(lessons)) assert.ok(ts.includes(`'@/content/learn/${id}.json'`), id);
});

// ── progress, in the website's shape ────────────────────────────────────────

test('marking a lesson learned writes exactly what js/learn-ai.js _markCompleted writes', () => {
  const src = fs.readFileSync(path.join(REPO, 'js', 'learn-ai.js'), 'utf8');
  const fn = /function _markCompleted\(moduleId\) \{[\s\S]*?\n  \}\n/.exec(src)![0];
  const run = (start: string | null, id: string, iso: string) => {
    const store: Record<string, string> = start === null ? {} : { finos_learned_modules: start };
    const RealDate = Date;
    const ctx: any = {
      localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
      MOD_STORAGE: 'finos_learned_modules',
      Date: class extends RealDate { constructor() { super(iso); } },
    };
    vm.createContext(ctx);
    vm.runInContext(`${fn}; _markCompleted(${JSON.stringify(id)});`, ctx);
    return JSON.parse(store.finos_learned_modules);
  };
  const t1 = '2026-10-14T08:00:00.000Z', t2 = '2026-10-20T09:30:00.000Z';
  const start = run(null, 'equity', t1);
  assert.deepEqual(L.markLearned(L.parseLearned(null), 'equity', new Date(t1)), start);
  // a second lesson, and re-opening an already learned one keeps its completed_at and moves last_visited
  const two = run(JSON.stringify(start), 'etf', t2);
  assert.deepEqual(L.markLearned(L.parseLearned(JSON.stringify(start)), 'etf', new Date(t2)), two);
  const again = run(JSON.stringify(two), 'equity', t2);
  assert.deepEqual(L.markLearned(L.parseLearned(JSON.stringify(two)), 'equity', new Date(t2)), again);
  assert.equal(again.equity.completed_at, t1);
  assert.equal(again.equity.last_visited, t2);
});

test('parseLearned: junk-safe, accepts the array form, keeps unknown fields; unmark removes only that lesson', () => {
  assert.deepEqual(L.parseLearned('not json'), {});
  assert.deepEqual(L.parseLearned('"x"'), {});
  assert.deepEqual(L.parseLearned(undefined), {});
  assert.deepEqual(Object.keys(L.parseLearned('["equity","etf",3,""]')).sort(), ['equity', 'etf']);
  const p = L.parseLearned(JSON.stringify({ equity: { completed_at: 'x', attempts: 2, extra: 1 }, etf: null }));
  assert.deepEqual(Object.keys(p), ['equity']);
  assert.equal((p.equity as any).extra, 1);
  assert.deepEqual(Object.keys(L.unmarkLearned(L.markLearned({}, 'a', new Date()), 'a')), []);
});

test('progress counts: interactive pages are not in the totals; continue/next pick sensibly', () => {
  const lessonsOnly = manifest.lessons.filter(e => e.kind === 'lesson');
  assert.equal(L.overallProgress(manifest, {}).total, lessonsOnly.length);
  const l = L.markLearned({}, 'equity', new Date('2026-10-14T00:00:00Z'));
  assert.equal(L.overallProgress(manifest, l).done, 1);
  assert.equal(L.categoryProgress(manifest, l).find(c => c.id === 'markets')!.learned, 1);
  const o = L.markOpened(L.markOpened({}, 'etf', new Date('2026-10-14T01:00:00Z')), 'debt', new Date('2026-10-14T02:00:00Z'));
  assert.equal(L.continueLesson(manifest, l, o)!.id, 'debt');
  assert.equal(L.continueLesson(manifest, L.markLearned(l, 'debt', new Date()), o)!.id, 'etf');
  assert.equal(L.continueLesson(manifest, {}, {}), null);
  assert.equal(L.nextLesson(manifest, {})!.id, 'finance101');
  assert.equal(L.parseOpened('{"a":"nope","b":"2026-10-14T00:00:00Z"}').a, undefined);
});

test('search: title beats summary beats body; unknown words give nothing', () => {
  const bodies = Object.fromEntries(Object.entries(lessons).map(([id, l]) => [id, L.lessonBodyText(l)]));
  assert.equal(L.searchLessons(manifest, 'sip')[0].id, 'insight-sip');
  assert.ok(L.searchLessons(manifest, 'rsi', bodies).some(e => e.id === 'indicators'));
  assert.ok(!L.searchLessons(manifest, 'rsi', bodies).some(e => e.id === 'mutual_funds'), 'word-prefix, not substring');
  assert.equal(L.searchLessons(manifest, 'zzzzqqqq', bodies).length, 0);
  assert.equal(L.searchLessons(manifest, '   ', bodies).length, 0);
});

// ── Health Score: Knowledge & Engagement ─────────────────────────────────────

/** The two statements of the website's Knowledge pillar that matter: how the stored value becomes a list, and how the list becomes points. */
function websiteKnowledgeSnippet(src: string): string {
  const a = src.search(/const learned\s*=\s*Array\.isArray\(learnedRaw\)/);
  const b = src.indexOf('const tradeStats');
  const c = src.indexOf('const moduleCount');
  const d = src.indexOf('const streakPts');
  assert.ok(a > 0 && b > a && c > b && d > c, 'website formula not found');
  return src.slice(a, b) + src.slice(c, d);
}

test('knowledgePoints equals the website formula, evaluated from js/finos-health-score.js itself', () => {
  const src = fs.readFileSync(path.join(REPO, 'js', 'finos-health-score.js'), 'utf8');
  // Since Oct 15 the website reads the stored value itself (`learnedRaw`) and counts either shape, then applies the same 0.43 rule.
  const snippet = websiteKnowledgeSnippet(src);
  const web = (learned: unknown) => {
    const ctx: any = { learnedRaw: learned };
    vm.createContext(ctx);
    vm.runInContext(`${snippet}; out = { moduleCount, knowledgePts };`, ctx);
    return ctx.out as { moduleCount: number; knowledgePts: number };
  };
  for (let n = 0; n <= 40; n++) {
    const arr = Array.from({ length: n }, (_, i) => `m${i}`);
    const w = web(arr);
    assert.equal(L.knowledgePoints(L.learnedCount(JSON.stringify(arr))), w.knowledgePts, `${n} modules`);
    assert.equal(L.learnedCount(JSON.stringify(arr)), w.moduleCount);
  }
  assert.equal(web(Array.from({ length: 14 }, (_, i) => `m${i}`)).knowledgePts, 6);   // "14 modules = 6 pts"
  assert.equal(L.knowledgePoints(14), 6);
  assert.equal(L.knowledgePoints(0), 0);
  assert.equal(L.knowledgePoints(NaN), 0);
  assert.equal(L.knowledgePoints(-3), 0);
});

test('the website now counts the object shape that js/learn-ai.js writes, and the phone agrees with it', () => {
  // History: until Oct 15 the website read finos_learned_modules with Array.isArray(...) ? length : 0, so lessons read on the website
  // never earned Knowledge points, while the phone counted the object's entries. The website was fixed (see js/finos-health-score.js);
  // this test pins that both now count the same, so a regression on either side shows up here.
  const src = fs.readFileSync(path.join(REPO, 'js', 'finos-health-score.js'), 'utf8');
  assert.ok(!/const moduleCount = Array\.isArray\(learned\) \? learned\.length : 0;/.test(src), 'the website went back to ignoring the object shape');
  const snippet = websiteKnowledgeSnippet(src);
  const web = (learnedRaw: unknown) => { const c: any = { learnedRaw }; vm.createContext(c); vm.runInContext(`${snippet}; out = { moduleCount, knowledgePts };`, c); return c.out as { moduleCount: number; knowledgePts: number }; };
  const obj = { equity: { completed_at: 'x', attempts: 0 }, etf: { completed_at: 'y', attempts: 0 }, debt: { completed_at: 'z', attempts: 0 } };
  assert.equal(web(obj).moduleCount, 3);
  assert.equal(L.learnedCount(JSON.stringify(obj)), 3);
  assert.equal(web(obj).knowledgePts, L.knowledgePoints(L.learnedCount(JSON.stringify(obj))));
  assert.equal(L.learnedCount('[]'), 0);
  assert.equal(L.learnedCount(null), 0);
  assert.equal(L.learnedCount('garbage'), 0);
});

test('the Health Score pillar adds Knowledge points to the streak points (cap 10) and reports modules', () => {
  const base = { ...T.EMPTY_TRACKER_DATA };
  const pillar = (d: Partial<T.TrackerData>) => T.computeAll({ ...base, ...d }).health.pillars.find(p => p.name === 'Knowledge & engagement')!;
  assert.equal(pillar({}).score, 0);
  assert.equal(pillar({ learnedModules: 14 }).score, 6);
  assert.equal(pillar({ learnedModules: 14, streak: 30 }).score, 10);
  assert.equal(pillar({ learnedModules: 99, streak: 99 }).score, 10);
  assert.equal(pillar({ learnedModules: 5, streak: 7 }).score, 2 + 2);   // floor(5*0.43)=2, streak 7 -> 2
  assert.match(pillar({ learnedModules: 1, streak: 4 }).headline, /^1 module · 4 day streak$/);
  assert.equal(pillar({ learnedModules: 3 }).untracked, false);
  assert.deepEqual(pillar({ learnedModules: 3 }).tips, ['Complete 5 learning modules to unlock personalized insights']);
  // raw points over the measured areas: marking lessons as learned adds exactly the Knowledge points (the other area is held fixed)
  const pts = (m: number) => T.computeAll({ ...base, income: 100000, expense: 50000, learnedModules: m }).health.points;
  assert.equal(pts(14) - pts(1), 6 - 0);
});

// ── reader guards ────────────────────────────────────────────────────────────

test('the reader caps text scaling at 200% and uses no unscaled <Text> of its own', () => {
  assert.equal(L.MAX_FONT_SCALE, 2);
  const blocks = fs.readFileSync(path.join(MOBILE, 'components', 'LearnBlocks.tsx'), 'utf8');
  assert.match(blocks, /maxFontSizeMultiplier=\{MAX_FONT_SCALE\}/);
  const raw = [...blocks.matchAll(/<Text\b/g)].length;
  assert.equal(raw, 1, 'only LText itself may render <Text>');
});
