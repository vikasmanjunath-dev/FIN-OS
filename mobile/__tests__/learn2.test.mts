// Learn wave 2: mindset / behaviour lessons, honest stubs for interactive pages, provenance, and the Health Score golden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as L from '@/lib/learn';
import * as T from '@/lib/trackers';

const MOBILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.join(MOBILE, '..');
const CONTENT = path.join(MOBILE, 'content', 'learn');
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8'));
const manifest: L.Manifest = readJson('manifest.json');
const lessonFiles = fs.readdirSync(CONTENT).filter(f => f.endsWith('.json') && f !== 'manifest.json' && f !== 'review.json');
const lessons: Record<string, L.Lesson> = Object.fromEntries(lessonFiles.map(f => [f.replace(/\.json$/, ''), readJson(f)]));
const byId = Object.fromEntries(manifest.lessons.map(e => [e.id, e]));

// The 24 Pending rows (L-27..L-51 except L-41) and the three Partial rows of docs/MOBILE_PARITY_TRACKER.xlsx, by website page.
const TRACKER_PAGES = ['mindset-sim', 'mindset-sim-hub', 'train-mindset', 'not-money', 'decision', 'clarity', 'scenarios', 'timeline', 'fear-roadmap',
  'roadmap', 'roadmaps', 'trader-roadmap', 'traditional-roadmap', 'simulator', 'simulator-landing', 'trading-simulator', 'trading-coach', 'trading-brain',
  'know-your-finances', 'financial-being', 'diagnostics', 'life-wealth', 'impact', 'impact-detail', 'foundations', 'investor-mindset', 'investor-profile'];
const NEW_LESSONS = ['mindset-sim', 'decision', 'clarity', 'life-wealth', 'impact-detail'];

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const decodeEntities = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&[a-z]+;/g, '');
/** Letters and digits of lines [from, to] of a file, with markup removed (variant A) and with markup kept (variant B). */
function windows(file: string, from: number, to: number): string[] {
  const lines = fs.readFileSync(path.join(REPO, file), 'utf8').split('\n').slice(Math.max(0, from - 1), to);
  const raw = lines.join('\n');
  return [alnum(decodeEntities(raw.replace(/<[a-zA-Z/!][^>]*>/g, ''))), alnum(raw)];
}
const quoteOf = (b: L.Block): string => {
  if (b.t === 'p' || b.t === 'h') return b.text;
  if (b.t === 'ul' || b.t === 'ol') return b.items[0];
  if (b.t === 'callout') return b.text || b.title;
  if (b.t === 'table') return b.rows[0].join(' ');
  return b.rows[0][1];
};

test('every page of the tracker rows has a page in the Learn manifest, and nothing is both lesson and stub', () => {
  for (const id of TRACKER_PAGES) assert.ok(byId[id], `${id} has no Learn page`);
  for (const id of TRACKER_PAGES) assert.equal(byId[id].source, `html/${id}.html`);
  for (const id of NEW_LESSONS) assert.equal(byId[id].kind, 'lesson');
  for (const e of manifest.lessons) if (e.kind === 'interactive') { assert.ok(e.stub, `${e.id}: stub`); assert.ok(!lessons[e.id], `${e.id}: stub must not be flattened`); }
  assert.equal(manifest.lessons.filter(e => e.kind === 'lesson').length, Object.keys(lessons).length);
});

test('stubs: valid status, plain reason, quotes from the page, redirects and hub targets resolve', () => {
  const routeExists = (r: string) => {
    const p = r.replace(/^\//, '');
    if (fs.existsSync(path.join(MOBILE, `app/${p}.tsx`)) || fs.existsSync(path.join(MOBILE, `app/${p}/index.tsx`)) || fs.existsSync(path.join(MOBILE, `app/(tabs)/${p}.tsx`))) return true;
    if (p.startsWith('tools/calc/')) return new RegExp(`id: '${p.slice(11)}'`).test(fs.readdirSync(path.join(MOBILE, 'lib', 'calcs')).map(f => fs.readFileSync(path.join(MOBILE, 'lib', 'calcs', f), 'utf8')).join('\n'));
    return false;
  };
  const statuses = new Set(Object.keys(L.STATUS_LABEL));
  for (const e of manifest.lessons.filter(x => x.kind === 'interactive')) {
    const st = e.stub!;
    assert.ok(statuses.has(st.status), e.id);
    assert.equal(e.status, st.status);
    assert.ok(st.why.length > 40, `${e.id}: reason`);
    if (e.tool) assert.ok(routeExists(e.tool), `${e.id}: tool ${e.tool}`);
    if (st.status === 'redirect') { assert.ok(byId[st.redirectTo!], `${e.id}: redirect target`); assert.ok(st.redirectLine! > 0); }
    if (st.status === 'hub') assert.ok(st.entries && st.entries.length >= 5, `${e.id}: entries`);
    for (const en of st.entries ?? []) {
      const t = en.target;
      if (t.type === 'lesson') assert.ok(byId[t.id], `${e.id}: ${en.title} -> lesson ${t.id}`);
      if (t.type === 'route') assert.ok(routeExists(t.route), `${e.id}: ${en.title} -> ${t.route}`);
      assert.ok(['same', 'close', 'note', 'none'].includes(t.match));
    }
  }
  // honest classification of the pages that cannot be turned into text
  for (const id of ['trader-roadmap', 'fear-roadmap', 'traditional-roadmap', 'timeline', 'know-your-finances', 'financial-being', 'trading-brain', 'trading-coach']) assert.equal(byId[id].status, 'no-equivalent', id);
  assert.equal(byId['trading-simulator'].status, 'website-only');
  for (const id of ['mindset-sim-hub', 'train-mindset', 'not-money', 'roadmaps', 'simulator']) assert.equal(byId[id].status, 'redirect', id);
  assert.equal(byId['not-money'].stub!.redirectTo, 'mindset-sim');
  assert.equal(byId['roadmaps'].stub!.redirectTo, 'roadmap');
  assert.equal(byId['simulator'].stub!.redirectTo, 'trading-simulator');
});

test('provenance: every block of every lesson quotes the file at the line it names (independent of the extractor)', () => {
  let checked = 0;
  for (const [id, l] of Object.entries(lessons)) {
    for (const s of l.sections) for (const b of s.blocks) {
      const q = alnum(quoteOf(b)).slice(0, 30);
      if (!q) continue;
      assert.ok(b.line && b.line > 0, `${id}: block without line: ${quoteOf(b).slice(0, 40)}`);
      const file = b.file ?? l.source;
      assert.ok(fs.existsSync(path.join(REPO, file)), `${id}: ${file}`);
      const ok = windows(file, b.line! - 1, b.line! + 8).some(w => w.includes(q));
      assert.ok(ok, `${id}: "${quoteOf(b).slice(0, 50)}" not at ${file}:${b.line}`);
      if (b.t === 'callout' && b.title) assert.ok(windows(file, b.line! - 12, b.line! + 8).some(w => w.includes(alnum(b.title))), `${id}: title ${b.title}`);
      checked++;
    }
  }
  assert.ok(checked > 700, `only ${checked} blocks checked`);
});

test('provenance of stubs: page quotes, hub entries and left-out items are at the line they name', () => {
  for (const e of manifest.lessons.filter(x => x.kind === 'interactive')) {
    const st = e.stub!;
    for (const a of st.about) assert.ok(windows(e.source, a.line - 1, a.line + 8).some(w => w.includes(alnum(a.text).slice(0, 30))), `${e.id}: about ${a.text.slice(0, 30)}`);
    for (const en of st.entries ?? []) assert.ok(windows(en.file ?? e.source, en.line - 1, en.line + 8).some(w => w.includes(alnum(en.title).slice(0, 30))), `${e.id}: entry ${en.title}`);
    for (const n of st.notCarried ?? []) assert.ok(windows(n.file, n.line - 1, n.line + 8).some(w => w.includes(alnum(n.quote).slice(0, 30))), `${e.id}: left out ${n.what.slice(0, 30)}`);
  }
  for (const id of NEW_LESSONS) for (const n of lessons[id].notShown ?? []) assert.ok(windows(n.file, n.line - 1, n.line + 8).some(w => w.includes(alnum(n.quote).slice(0, 30))), `${id}: not shown ${n.what.slice(0, 30)}`);
});

test('no assumed user data: nothing the website invents for everyone is presented as the person\'s own', () => {
  const all = JSON.stringify([lessons, manifest.lessons.map(e => [e.summary, e.stub?.about, e.stub?.entries])]);
  assert.doesNotMatch(all, /24,213|CALM WIN RATE.{0,40}74%|1,847|Conviction.{0,6}84/);          // simulator-landing ticker / demo verdicts
  assert.doesNotMatch(JSON.stringify(lessons.clarity.sections), /DONE|CURRENT|LOCKED|CALCULATING|SCANNING|DETECTED/);   // clarity.html demo progress and scanner
  assert.doesNotMatch(JSON.stringify(lessons['life-wealth'].sections), /95, ?20, ?30|\[95/);           // radar demo scores are not shown
  assert.doesNotMatch(JSON.stringify(byId['timeline'].stub!.about), /\b52\b|\b71\b/);
  // the reader components never read the person's data other than the Learn progress keys
  for (const f of ['components/LearnBlocks.tsx', 'app/learn/[id].tsx', 'app/learn/index.tsx']) {
    const src = fs.readFileSync(path.join(MOBILE, f), 'utf8');
    assert.doesNotMatch(src, /AsyncStorage|fetch\(|expo-location|expo-contacts/, f);
  }
  // each new lesson says it is from the website and that figures are the page's statements
  for (const id of NEW_LESSONS) { assert.ok(lessons[id].files?.length, id); assert.equal(typeof lessons[id].figures, 'boolean', id); }
  assert.equal(lessons['mindset-sim'].language, 'hinglish');
});

test('arithmetic claims in the new lessons that the review flags really are wrong (recomputed here)', () => {
  const sip = (p: number, rate: number, years: number) => { const i = rate / 12, n = years * 12; return p * ((1 + i) ** n - 1) / i * (1 + i); };
  assert.ok(sip(500, 0.12, 30) < 18_00_000 && sip(500, 0.12, 30) > 17_00_000);               // not "Rs 1 crore+"
  assert.ok(sip(500, 0.15, 30) < 36_00_000);
  const cost = (r: number) => 1 - sip(1, r, 25) / sip(1, r, 30);
  assert.ok(cost(0.08) > 0.35 && cost(0.12) > 0.45);                                         // 36% to 46%, not "30-40%" at 12%
  assert.ok(8_20_000 / 2_75_000 - 1 > 1.9 && Math.abs(8_20_000 / 5_00_000 - 1 - 0.64) < 1e-9);    // "64% gain from bottom" is the gain on the start
  const elss = 50_000 * ((1.12 ** 20 - 1) / 0.12);
  assert.ok(elss < 40_00_000 && elss * 1.12 < 41_00_000);                                    // not Rs 48 lakh
  const flagged = (id: string) => lessons[id].sections.flatMap(s => s.blocks).filter(b => b.needsReview).map(b => JSON.stringify(b)).join(' ');
  assert.match(flagged('impact-detail'), /1 crore/);
  assert.match(flagged('mindset-sim'), /64% gain from bottom/);
  assert.match(flagged('mindset-sim'), /3% CAGR/);
  // clarity.js multiplies by 120 and 1.8; the page's own number is below the compounded one
  assert.ok(10_000 * 120 * 1.8 < sip(10_000, 0.12, 10));
});

test('Health Score: the new lessons count for Knowledge exactly as the website counts finos_learned_modules', () => {
  const src = fs.readFileSync(path.join(REPO, 'js', 'finos-health-score.js'), 'utf8');
  const a = src.search(/const learned\s*=\s*Array\.isArray\(learnedRaw\)/);
  const snippet = src.slice(a, src.indexOf('const tradeStats')) + src.slice(src.indexOf('const moduleCount'), src.indexOf('const streakPts'));
  const web = (raw: unknown) => { const c: any = { learnedRaw: raw }; vm.createContext(c); vm.runInContext(`${snippet}; out = { moduleCount, knowledgePts };`, c); return c.out as { moduleCount: number; knowledgePts: number }; };
  const ids = manifest.lessons.filter(e => e.kind === 'lesson').map(e => e.id);
  let learned: L.Learned = {};
  ids.forEach((id, i) => { learned = L.markLearned(learned, id, new Date(Date.UTC(2026, 9, 1 + i))); const raw = JSON.stringify(learned);
    assert.equal(L.learnedCount(raw), web(learned).moduleCount, `${i + 1} lessons`);
    assert.equal(L.knowledgePoints(L.learnedCount(raw)), web(learned).knowledgePts, `${i + 1} lessons`); });
  for (const id of NEW_LESSONS) assert.ok(learned[id], id);
  assert.equal(L.knowledgePoints(L.learnedCount(JSON.stringify(learned))), 6);                // capped, as on the website
  // junk and falsy entries: the website skips falsy values, the phone drops them too
  const junk = { equity: { completed_at: 'x', attempts: 0 }, decision: null, clarity: false, 'impact-detail': 0, etf: true };
  assert.equal(L.learnedCount(JSON.stringify(junk)), web(junk).moduleCount);
  // marking a new lesson writes the same shape as js/learn-ai.js
  const m = L.markLearned({}, 'decision', new Date('2026-10-16T10:00:00.000Z'));
  assert.deepEqual(m, { decision: { completed_at: '2026-10-16T10:00:00.000Z', attempts: 0, last_visited: '2026-10-16T10:00:00.000Z' } });
  // stubs are never part of the progress totals, so they cannot be "learned" into the score
  const totals = L.overallProgress(manifest, {});
  assert.equal(totals.total, ids.length);
  assert.equal(L.overallProgress(manifest, { ...learned, 'trading-simulator': { completed_at: 'x', attempts: 0 } }).done, ids.length);
  assert.equal(T.computeAll({ ...T.EMPTY_TRACKER_DATA, learnedModules: ids.length }).health.pillars.find(p => p.name === 'Knowledge & engagement')!.score, 6);
});

test('reader: stub and notes components keep the 200% text cap, roles and no nested touchables', () => {
  const src = fs.readFileSync(path.join(MOBILE, 'components', 'LearnBlocks.tsx'), 'utf8');
  assert.equal([...src.matchAll(/<Text\b/g)].length, 1, 'only LText itself renders <Text>');
  assert.equal(L.rowMeta(byId['timeline']), 'Not on the phone');
  assert.equal(L.rowMeta(byId['decision']).endsWith('min read'), true);
  assert.equal(L.rowMeta({ ...byId['decision'], kind: 'interactive' } as any), 'Interactive on the website');
});

test('search finds the new lessons and the existing ranking is unchanged', () => {
  const bodies = Object.fromEntries(Object.entries(lessons).map(([id, l]) => [id, L.lessonBodyText(l)]));
  assert.ok(L.searchLessons(manifest, 'anchoring', bodies).some(e => e.id === 'decision'));
  assert.ok(L.searchLessons(manifest, 'lehman', bodies).some(e => e.id === 'mindset-sim'));
  assert.equal(L.searchLessons(manifest, 'sip')[0].id, 'insight-sip');
  assert.equal(L.nextLesson(manifest, {})!.id, 'finance101');
});
