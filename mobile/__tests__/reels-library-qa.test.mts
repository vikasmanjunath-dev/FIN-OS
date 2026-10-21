// Library-wide invariants for Money Reels. Where reels.test.mts and the other reels-*.test.mts check what a rule means on chosen examples, this file holds
// EVERY reel in the library (and the 50 drafts) to the checks in lib/reels/qa.ts, and names the reel that breaks one. Known findings are listed, with a
// reason each, in lib/reels/qa-allowlist.ts; nothing else is excused. The same checks run for an author with `npm run reels:check`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY } from '../lib/reels/library.ts';
import { DRAFT_REELS } from '../lib/reels/drafts.ts';
import { reelById } from '../lib/reels/content.ts';
import { SERIES, DRAFT_SERIES } from '../lib/reels/series.ts';
import { CAST_IDS } from '../lib/reels/cast.ts';
import { LEVELS } from '../lib/reels/meta.ts';
import { TOPIC_ORDER, buildMap } from '../lib/reels/map.ts';
import { totalMs } from '../lib/reels/engine.ts';
import { sipFutureValue, emi, inflatedValue, money } from '../lib/reels/figures.ts';
import { validateBeat } from '../lib/reels/beats.ts';
import { personaliseReels } from '../lib/reels/personal.ts';
import { shareText } from '../lib/reels/share.ts';
import { QA_ALLOWLIST } from '../lib/reels/qa-allowlist.ts';
import { BUDGET, QA_CODES, answerSkew, beatCost, checkBeatFigures, checkLibrary, checkReel, coverage, deriveSlider, draftContext, liveContext, propCost, reelCost, sceneCost, teachingTexts, voicedMs, type QaContext } from '../lib/reels/qa.ts';
import type { Reel } from '../lib/reels/types.ts';

const root = path.join(import.meta.dirname, '..');
const lessons = new Set((JSON.parse(fs.readFileSync(path.join(root, 'content/learn/manifest.json'), 'utf8')) as { lessons: { id: string }[] }).lessons.map(l => l.id));
const live = liveContext(lessons), drafts = draftContext(lessons);

/** Blocking findings (errors the allowlist does not excuse) with these codes, one line each naming the reel. */
function blockers(ctx: QaContext, codes: string[] | null = null): string[] {
  const out: string[] = [];
  for (const r of ctx.reels) for (const x of checkReel(r, ctx).blocking) if (!codes || codes.includes(x.code)) out.push(`${r.id}: [${x.code}] ${x.message}`);
  for (const x of checkLibrary(ctx)) if (!codes || codes.includes(x.code)) { if (!QA_ALLOWLIST.some(e => e.id === x.id && e.code === x.code)) out.push(`${x.id}: [${x.code}] ${x.message}`); }
  return out;
}
const clean = (lines: string[]) => assert.deepEqual(lines, [], `\n${lines.join('\n')}\n`);
/** A copy of a library reel to break on purpose. */
const copy = (id = 'start-early'): Reel => structuredClone(reelById(id)!);

// ── Identity ───────────────────────────────────────────────────────────────────────────────────────────────────────────

test('library QA: ids are unique across the library and the drafts, and titles are unique in both languages', () => {
  clean(blockers(live, ['dup-id', 'dup-title']));
  clean(blockers(drafts, ['dup-id', 'dup-title']));
  const all = [...LIBRARY, ...DRAFT_REELS];
  assert.equal(new Set(all.map(r => r.id)).size, new Set([...LIBRARY.map(r => r.id), ...DRAFT_REELS.map(r => r.id)]).size);
  assert.ok(LIBRARY.length >= 150, `only ${LIBRARY.length} reels`);
});

test('library QA: every live reel has a ladder entry, a topic with a chip and a Money Map row, and no entry points at a missing reel', () => {
  clean(blockers(live, ['meta-missing', 'meta-level', 'meta-needs', 'topic-orphan', 'meta-stray', 'act-stray', 'trust-stray', 'act-missing', 'act-label', 'act-on-scam']));
  // the feed's topic chips are drawn by app/learn/reels.tsx: every topic in use has one there
  const feed = fs.readFileSync(path.join(root, 'app/learn/reels.tsx'), 'utf8');
  for (const t of TOPIC_ORDER) assert.match(feed, new RegExp(`key: '${t}'`), `the feed has no chip for the topic "${t}"`);
  for (const r of LIBRARY) assert.ok((TOPIC_ORDER as string[]).includes(r.topic), `${r.id}: topic "${r.topic}" has no chip`);
});

// ── Share safety ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('library QA: the text a reel shares is its title and explanation only, in both languages, and never holds a personal figure or an identifier', () => {
  clean(blockers(live, ['share-mine', 'share-unsafe', 'personal-data']));
  const mine = { sip: 6543, spend: 48765, fund: 123456, loan: { label: { en: 'car loan', hi: 'कार लोन' }, balance: 2_468_135, rate: 9.3, emi: 31_415 } };
  personaliseReels(LIBRARY, mine);
  for (const r of LIBRARY) for (const lang of ['en', 'hi'] as const) {
    const s = shareText(r.id, lang);
    assert.ok(s.startsWith(`🦉 ${r.title[lang]}\n\n${r.quiz.why[lang]}\n\n`), `${r.id}: the share text is not the title and the explanation (${lang})`);
    assert.ok(s.length < 700, `${r.id}: share text is ${s.length} characters`);
    for (const secret of ['6,543', '48,765', '1,23,456', '24,68,135', '31,415', '6543', '48765', '123456', '2468135']) assert.ok(!s.includes(secret), `${r.id}: shares ${secret}`);
    assert.ok(!/https?:\/\/|@|\b\d{9,}\b/.test(s), `${r.id}: the share text holds a link or a long number`);
  }
});

// ── Budgets ───────────────────────────────────────────────────────────────────────────────────────────────────────────

test('library QA: size budget — each serialised reel is under 30 KB, and the library total is reported', t => {
  clean(blockers(live, ['reel-size']));
  clean(blockers(drafts, ['reel-size']));
  const sizes = LIBRARY.map(r => ({ id: r.id, bytes: JSON.stringify(r).length })).sort((a, b) => b.bytes - a.bytes);
  const total = sizes.reduce((n, s) => n + s.bytes, 0);
  t.diagnostic(`${LIBRARY.length} live reels: ${(total / 1024).toFixed(0)} KB as JSON; largest ${sizes[0].id} at ${(sizes[0].bytes / 1024).toFixed(1)} KB; budget ${BUDGET.reelBytes / 1024} KB a reel`);
  assert.ok(total < 2 * 1024 * 1024, `the library is ${(total / 1024 / 1024).toFixed(2)} MB as text; the plan promises under 2 MB`);
});

test('library QA: timeline budget — every scene is 1.5 to 12 s and every reel 20 to 60 s, silent and with the English and the Hindi voice', () => {
  clean(blockers(live, ['scene-length', 'reel-length', 'scene-length-voice', 'reel-length-voice']));
  clean(blockers(drafts, ['scene-length', 'reel-length', 'scene-length-voice', 'reel-length-voice']));
  for (const r of LIBRARY) for (const lang of ['en', 'hi'] as const) {
    const v = voicedMs(r, lang);
    assert.ok(v >= totalMs(r) - 1, `${r.id}: the ${lang} voice made the reel shorter than written`);
    assert.ok(v <= BUDGET.reelMs[1], `${r.id}: ${lang} voice runs ${(v / 1000).toFixed(1)} s`);
  }
});

test('library QA: no scene or beat is too heavy to draw (animated primitives within budget)', () => {
  for (const r of LIBRARY) {
    const c = reelCost(r);
    assert.ok(c.heaviest <= BUDGET.sceneCost, `${r.id}: a scene draws ${c.heaviest} animated pieces; budget ${BUDGET.sceneCost}`);
    assert.ok(c.beat <= BUDGET.beatCost, `${r.id}: the beat draws ${c.beat} animated pieces; budget ${BUDGET.beatCost}`);
  }
  for (const r of DRAFT_REELS) { const c = reelCost(r); assert.ok(c.heaviest <= BUDGET.sceneCost && c.beat <= BUDGET.beatCost, `${r.id}: too heavy (${c.heaviest}, beat ${c.beat})`); }
});

test('rendering cost: counted from the data, per kind of picture, with the same caps the drawing code applies', () => {
  const l = { en: 'x', hi: 'क' };
  assert.equal(propCost(undefined), 0);
  assert.equal(propCost({ kind: 'counter', from: 0, to: 5, format: 'plain', unit: l }), 4);
  assert.equal(propCost({ kind: 'bars', items: [1, 2, 3].map(v => ({ label: l, value: v, text: l, tone: 'teal' as const })) }), 9);
  assert.equal(propCost({ kind: 'line', points: [1, 2, 3] }), 6);
  assert.equal(propCost({ kind: 'line', points: Array.from({ length: 40 }, (_, i) => i) }), 9);
  assert.equal(propCost({ kind: 'donut', parts: [1, 2].map(v => ({ value: v, label: l, tone: 'gold' as const })) }), 6);
  assert.equal(propCost({ kind: 'coins', count: 3 }), 7);
  assert.equal(propCost({ kind: 'coins', count: 500 }), 17, 'coins are drawn at most 8');
  assert.equal(propCost({ kind: 'shield', text: l }), 3);
  assert.equal(propCost({ kind: 'steps', items: [l, l, l, l] }), 12);
  const scene = (prop?: Reel['scenes'][number]['prop']) => ({ ms: 4000, mood: 'happy' as const, say: l, prop });
  assert.equal(sceneCost(scene()), 8);
  assert.equal(sceneCost(scene({ kind: 'shield', text: l })), 11);
  // a scene with ten bars is over budget; the checker flags it, as a warning, with the scene number
  const heavy: Reel = { ...copy(), scenes: [scene({ kind: 'bars', items: Array.from({ length: 10 }, (_, i) => ({ label: l, value: i + 1, text: l, tone: 'cyan' as const })) })] };
  assert.equal(sceneCost(heavy.scenes[0]), 38);
  const rep = checkReel(heavy, live);
  assert.ok(rep.warnings.some(w => w.code === 'scene-cost' && /scene 1 draws 38/.test(w.message)));
  assert.equal(beatCost({ kind: 'guess', q: l, min: 1, max: 10, answer: 5, reveal: l }), 6);
  assert.equal(beatCost({ kind: 'myth', q: l, cards: [{ s: l, fact: true, why: l }, { s: l, fact: false, why: l }, { s: l, fact: true, why: l }] }), 9);
  assert.equal(beatCost({ kind: 'spot', q: l, from: l, todo: l, parts: [{ t: l }, { t: l, flag: l }, { t: l }, { t: l, flag: l }] }), 10);
});

// ── Beats ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('library QA: every slider and guess beat passes validateBeat, and its numbers re-derive by a second method', () => {
  let sliders = 0, guesses = 0;
  for (const ctx of [live, drafts]) for (const r of ctx.reels) {
    const b = r.poke?.beat;
    if (!b || (b.kind !== 'slider' && b.kind !== 'guess')) continue;
    assert.deepEqual(validateBeat(b), [], `${r.id}: beat fails validateBeat`);
    if (b.kind === 'slider') {
      sliders++;
      if (b.model.kind !== 'tax-income') for (const x of [b.min, b.start, b.max]) assert.notEqual(deriveSlider(b.model, x), null, `${r.id}: no independent method for ${b.model.kind}`);
    } else guesses++;
    const bad = checkBeatFigures(r).filter(x => x.severity === 'error');
    assert.deepEqual(bad.map(x => x.message), [], `${r.id}: ${bad.map(x => x.message).join('; ')}`);
  }
  assert.ok(sliders >= 20 && guesses >= 10, `only ${sliders} sliders and ${guesses} guesses were checked`);
  // a guess whose answer is not the figure the reel states is flagged
  const g = LIBRARY.find(r => r.poke?.beat.kind === 'guess')!;
  const wrong = structuredClone(g); if (wrong.poke?.beat.kind === 'guess') wrong.poke.beat.answer = Math.round(wrong.poke.beat.answer * 0.7);
  assert.ok(checkBeatFigures(wrong).some(x => x.code === 'guess-answer'), 'a guess answer that no caption states should be flagged');
});

test('slider re-derivation: step-by-step ledgers agree with the closed forms at known points', () => {
  const near = (a: number | null, b: number, tol = 0.002) => assert.ok(a !== null && Math.abs(a - b) <= Math.abs(b) * tol, `${a} is not within ${tol * 100}% of ${b}`);
  near(deriveSlider({ kind: 'sip-years', monthly: 5000, rate: 12 }, 30), 17_474_820.66);                  // 5000 x ((1.01^360 - 1) / 0.01), worked by hand
  near(deriveSlider({ kind: 'sip-years', monthly: 5000, rate: 12 }, 30), sipFutureValue(5000, 12, 30));
  near(deriveSlider({ kind: 'emi-rate', principal: 1_000_000, years: 20, rate0: 9 }, 9), 8997.26);        // the ₹8,997 EMI printed in the EMI lesson
  near(deriveSlider({ kind: 'emi-rate', principal: 1_000_000, years: 20, rate0: 9 }, 9), emi(1_000_000, 9, 20));
  near(deriveSlider({ kind: 'inflation-years', amount: 100_000, rate: 6 }, 10), 55_839.48);
  near(deriveSlider({ kind: 'inflation-years', amount: 100_000, rate: 6 }, 10), inflatedValue(100_000, 6, 10));
  near(deriveSlider({ kind: 'goal-sip', target: 1_000_000, rate: 12 }, 10), 4347.1, 0.01);               // about ₹4,347 a month for ₹10 lakh in 10 years
  assert.equal(deriveSlider({ kind: 'corpus-spend', corpus: 10_000_000, rate: 7 }, 10_000), 60, 'a corpus that earns more than it pays out lasts for ever (shown as 60 years)');
  assert.equal(deriveSlider({ kind: 'tax-income', deduction: 150_000 }, 1_000_000), null);
});

// ── Cast, map, series ───────────────────────────────────────────────────────────────────────────────────────────────────

test('library QA: every cast member a scene or a series names exists', () => {
  for (const r of [...LIBRARY, ...DRAFT_REELS]) r.scenes.forEach((s, i) => { if (s.who) assert.ok((CAST_IDS as readonly string[]).includes(s.who), `${r.id}: scene ${i + 1} names the cast member "${s.who}", who does not exist`); });
  for (const s of [...SERIES, ...DRAFT_SERIES]) for (const name of s.cast.name.split(/\s+and\s+/)) assert.ok((CAST_IDS as readonly string[]).includes(name.toLowerCase()), `series ${s.id}: "${name}" is not in the cast`);
  const used = new Set([...LIBRARY, ...DRAFT_REELS].flatMap(r => r.scenes.map(s => s.who)).filter(Boolean));
  assert.ok(used.size >= 6, `only ${used.size} cast members appear in any reel`);
});

test('library QA: every series episode and Money Map cell resolves to a live reel, and the map accounts for every reel', () => {
  clean(blockers(live, ['series-episode', 'series-repeat', 'unreachable']));
  clean(blockers(drafts, ['series-episode', 'series-repeat']));
  const ids = new Set(LIBRARY.map(r => r.id));
  for (const s of SERIES) for (const e of s.episodes) assert.ok(ids.has(e.reel), `series ${s.id}: episode "${e.reel}" is not a live reel`);
  const rows = buildMap(LIBRARY, {});
  assert.deepEqual(rows.map(r => r.topic), TOPIC_ORDER);
  let counted = 0;
  for (const row of rows) for (const rung of row.rungs) {
    counted += rung.total;
    if (rung.state === 'empty') { assert.equal(rung.total, 0); assert.equal(rung.next, null); continue; }
    assert.ok(rung.next && ids.has(rung.next), `map ${row.topic}/${rung.level}: next reel "${rung.next}" does not resolve`);
    const r = LIBRARY.find(x => x.id === rung.next)!;
    assert.equal(r.topic, row.topic, `map ${row.topic}/${rung.level}: "${r.id}" is in another topic`);
  }
  assert.equal(counted, LIBRARY.length, 'every live reel sits in exactly one cell of the Money Map');
  // gaps are reported, not hidden: the summary names the empty cells and each one really is empty
  const cov = coverage(live);
  for (const g of cov.gaps) assert.equal(LIBRARY.filter(r => r.topic === g.topic && live.meta[r.id]?.level === g.level).length, 0);
  assert.equal(cov.count, LIBRARY.length);
  assert.deepEqual(Object.keys(cov.byLevel), LEVELS);
});

// ── Quiz and wording across the library ───────────────────────────────────────────────────────────────────────────────

test('library QA: quizzes are fair (answer in range, distinct options in both languages, an explanation) and the answer position is not a giveaway', () => {
  clean(blockers(live, ['quiz-answer', 'quiz-options', 'quiz-why', 'quiz-question']));
  clean(blockers(drafts, ['quiz-answer', 'quiz-options', 'quiz-why', 'quiz-question']));
  const sk = answerSkew(coverage(live));
  // The skew is a known library finding (see qa-allowlist.ts). It may get better, never worse.
  assert.ok(sk.share <= 0.9, `${Math.round(sk.share * 100)}% of the answers are option ${sk.position + 1}; the known level is about 85%`);
});

test('library QA: no http:// link, identifier or promise wording slips in, and the wording checks see through myth and scam statements', () => {
  clean(blockers(live, ['http-link', 'personal-data']));
  clean(blockers(drafts, ['http-link', 'personal-data']));
  // a myth card is SUPPOSED to say "A SIP guarantees a return"; the reel's own voice may not
  const myth = LIBRARY.find(r => r.poke?.beat.kind === 'myth' && r.poke.beat.cards.some(c => /guarantee/i.test(c.s.en)))!;
  assert.ok(myth, 'expected a myth deck with a "guarantees" card');
  assert.ok(!teachingTexts(myth).some(x => /guarantees a return/i.test(x.en)));
  assert.equal(checkReel(myth, live).warnings.filter(w => w.code === 'advice-wording').length, 0);
});

// ── The checker itself ────────────────────────────────────────────────────────────────────────────────────────────────

test('the checks catch what they are for: each broken copy of a good reel is stopped with the right code', () => {
  const codesOf = (r: Reel, ctx: QaContext = live) => checkReel(r, ctx).findings.map(x => x.code);
  assert.deepEqual(checkReel(copy(), live).blocking, [], 'the untouched reel is clean');
  const http = copy(); http.scenes[0].say.en += ' See http://example.com/offer now.'; assert.ok(codesOf(http).includes('http-link'));
  const dup = copy(); dup.id = 'a-copy'; assert.ok(codesOf(dup, { ...live, reels: [...live.reels, dup] }).includes('dup-title'));
  const ans = copy(); ans.quiz.answer = 9; assert.ok(codesOf(ans).includes('quiz-answer'));
  const same = copy(); same.quiz.options[1] = { ...same.quiz.options[0] }; assert.ok(codesOf(same).includes('quiz-options'));
  const why = copy(); why.quiz.why = { en: 'Yes.', hi: 'हाँ।' }; assert.ok(codesOf(why).includes('quiz-why'));
  const slow = copy(); slow.scenes[1].ms = 13_000; assert.ok(codesOf(slow).includes('scene-length'));
  const short = copy(); short.scenes = short.scenes.slice(0, 2); assert.ok(codesOf(short).includes('reel-length'));
  const cast = copy(); cast.scenes[0].who = 'nobody' as never; assert.ok(codesOf(cast).includes('cast-missing'));
  const topic = copy(); topic.topic = 'weather' as never; assert.ok(codesOf(topic).includes('topic-orphan'));
  const pan = copy(); pan.scenes[2].say.en += ' ABCDE1234F'; assert.ok(codesOf(pan).includes('personal-data'));
  const mail = copy(); mail.scenes[2].say.en += ' write to a@b.in'; assert.ok(codesOf(mail).includes('email-in-text'));
  const promise = copy(); promise.scenes[1].say.en = 'This plan guarantees a steady gain.'; assert.ok(codesOf(promise).includes('advice-wording'));
  const denied = copy(); denied.scenes[1].say.en = 'Returns are not guaranteed, and nothing here is advice.'; assert.ok(!codesOf(denied).includes('advice-wording'), '"not guaranteed" is the wording we want');
  const lonely = copy(); lonely.id = 'no-entries'; assert.ok(codesOf(lonely).includes('meta-missing') && codesOf(lonely).includes('act-missing'));
  const mine = copy(); mine.mine = true; assert.ok(codesOf(mine).includes('share-mine'));
  const fat = copy(); fat.tags = Array.from({ length: 4000 }, (_, i) => `tag-number-${i}`); assert.ok(codesOf(fat).includes('reel-size'));
  const wordy = copy(); wordy.scenes.forEach(s => { s.say.hi = s.say.hi.slice(0, 12); }); assert.ok(codesOf(wordy).includes('hindi-proportion'));
  // a broken beat
  const g = structuredClone(LIBRARY.find(r => r.poke?.beat.kind === 'guess')!); if (g.poke?.beat.kind === 'guess') g.poke.beat.min = g.poke.beat.answer * 2;
  assert.ok(codesOf(g).includes('beat-rule') || codesOf(g).includes('beat-unusable'));
  // library-wide: a signed-off id that is not a draft, a series pointing nowhere, answers all in one place
  const stray = checkLibrary({ ...live, reviewed: { 'start-early': { hindi: 'A', compliance: 'B', on: '2026-10-20' } } });
  assert.ok(stray.some(x => x.code === 'review-stray' && x.id === 'start-early'));
  const half = checkLibrary({ ...live, reviewed: { x: { hindi: '', compliance: 'B', on: 'soon' } }, draftIds: new Set(['x']) });
  assert.ok(half.some(x => x.code === 'review-incomplete'));
  const ghost = checkLibrary({ ...live, series: [{ ...SERIES[0], id: 'ghost', episodes: [{ reel: 'no-such-reel', intro: SERIES[0].episodes[0].intro }] }] });
  assert.ok(ghost.some(x => x.code === 'series-episode' && x.id === 'series:ghost'));
  const lopsided = checkLibrary({ ...live, reels: live.reels.map(r => ({ ...r, quiz: { ...r.quiz, answer: 0 } })) });
  assert.ok(lopsided.some(x => x.code === 'answer-skew'));
});

test('review status in the checklist: signed off, draft waiting, or built before the gate', () => {
  const item = (r: Reel, ctx: QaContext) => checkReel(r, ctx).items.find(i => i.key === 'review')!;
  assert.equal(item(copy(), live).status, 'todo');
  assert.match(item(copy(), live).detail, /before the review gate/);
  const draft = DRAFT_REELS[0];
  assert.match(item(draft, drafts).detail, /draft: waiting/);
  const signed = { ...drafts, reviewed: { [draft.id]: { hindi: 'A. Sharma', compliance: 'B. Rao', on: '2026-10-25' } } };
  assert.equal(item(draft, signed).status, 'ok');
  assert.match(item(draft, signed).detail, /A\. Sharma/);
});

// ── The whole library, with the allowlist ─────────────────────────────────────────────────────────────────────────

test('library QA: no reel in the live library has a blocking finding the allowlist does not name', () => {
  clean(blockers(live));
});

test('library QA: the draft reels also pass every blocking check, so a review build ships clean', () => {
  clean(blockers(drafts));
});

test('the allowlist: every entry names a real code and (unless library-wide) a real reel, and gives a reason', () => {
  const ids = new Set([...LIBRARY, ...DRAFT_REELS].map(r => r.id));
  const seen = new Set<string>();
  for (const e of QA_ALLOWLIST) {
    assert.ok(QA_CODES.includes(e.code), `allowlist: "${e.code}" is not a QA code`);
    assert.ok(e.id === 'library' || ids.has(e.id), `allowlist: "${e.id}" is not a reel`);
    assert.ok(e.reason.trim().length >= 30, `allowlist: the entry for ${e.id}/${e.code} needs a reason a reader can act on`);
    assert.ok(!seen.has(`${e.id}/${e.code}`), `allowlist: ${e.id}/${e.code} is listed twice`);
    seen.add(`${e.id}/${e.code}`);
  }
  // warnings are never excusable: every listed code is an error somewhere
  for (const e of QA_ALLOWLIST) assert.ok(!['advice-wording', 'voice-stretch', 'caption-speed', 'scene-cost', 'quiz-tell', 'hindi-proportion'].includes(e.code), `allowlist: ${e.code} is a warning and cannot be excused`);
});

// ── The author's command ──────────────────────────────────────────────────────────────────────────────────────────────

test('npm run reels:check: the checklist for one reel, --all and --summary run on the live library, and a bad id is refused', () => {
  const run = (args: string[]) => {
    try { return { code: 0, out: execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './__tests__/register-aliases.mjs', 'scripts/reel-check.mts', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  const one = run(['start-early']);
  assert.equal(one.code, 0); assert.match(one.out, /Script rules/); assert.match(one.out, /Hindi and compliance review/); assert.match(one.out, /Safe to share/);
  const all = run(['--all']);
  assert.equal(all.code, 0, all.out.slice(-600)); assert.match(all.out, new RegExp(`${LIBRARY.length} reels`)); assert.match(all.out, /nothing blocks/);
  const sum = run(['--summary']);
  assert.equal(sum.code, 0); assert.match(sum.out, /Topic x ladder level/); assert.match(sum.out, /Gaps \(empty topic x level cells\)/); assert.match(sum.out, /Never reachable/);
  const none = run(['not-a-reel']);
  assert.equal(none.code, 2); assert.match(none.out, /No reel "not-a-reel"/);
});
