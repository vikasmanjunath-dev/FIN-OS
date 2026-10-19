// Phase 2 of the reels blueprint: the signals the ranker reads, moments that make a reel timely, ranker v2 with made-up people, "I know this"
// and "less of this", the distress guard, moves and receipts, and Your Number for the playable reels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, libraryById } from '../lib/reels/library.ts';
import { META, LEVELS, metaOf } from '../lib/reels/meta.ts';
import { PILLAR_REELS } from '../lib/reels/journey.ts';
import { PILLARS, STRAIN_RATIO, deriveSignals, type Signals } from '../lib/reels/signals.ts';
import { KNOWN_TRIGGERS, activeTriggers, nearAdvanceTax } from '../lib/reels/triggers.ts';
import { rankReelsV2 } from '../lib/reels/ranker.ts';
import { EMPTY_PROFILE, MAX_KNOWN, MAX_LESS, addKnown, addLess, parseReelsProfile, type ReelsProfile } from '../lib/reels/reelsProfile.ts';
import { EMPTY_MOVES, METRIC_OF, improved, markSeen, metricValue, parseMoves, receiptText, settleMoves, startMove, unseenReceipts } from '../lib/reels/moves.ts';
import { composeEpisode } from '../lib/reels/episode.ts';
import { buildDelayCost, buildGuessEmi, buildGuessSip } from '../lib/reels/content-play.ts';
import { loanFor, monthsLeft, personalisePlay } from '../lib/reels/personal-play.ts';
import { trustFor } from '../lib/reels/trust.ts';
import { validateReel } from '../lib/reels/validate.ts';
import { emi, sipFutureValue } from '../lib/reels/figures.ts';
import { DEFS, type DeclaredEvent } from '../lib/lifeEvents.ts';
import * as privacy from '../lib/privacy.ts';
import type { Mine } from '../lib/reels/mine.ts';
import type { Watched } from '../lib/reels/journey.ts';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 0, 0);
const NOW = at(2026, 10, 19);
const ev = (type: DeclaredEvent['type'], date: string): DeclaredEvent => ({ id: `e-${type}`, type, date, createdAt: 0 });
const sig = (o: Parameters<typeof deriveSignals>[0]): Signals => deriveSignals(o);
const rank = (s: Signals, watched: Watched = {}, profile: ReelsProfile = EMPTY_PROFILE) => rankReelsV2(LIBRARY, { watched, signals: s, profile, now: s.now });
const ids = (r: { reel: { id: string } }[], n = r.length) => r.slice(0, n).map(x => x.reel.id);
const homeLoan = { label: { en: 'home loan', hi: 'होम लोन' }, balance: 1_000_000, rate: 9, emi: emi(1_000_000, 9, 20) };

// ── meta ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('meta: every reel in the library is described, and every description belongs to a reel', () => {
  for (const r of LIBRARY) assert.ok(META[r.id], `${r.id} has no entry in lib/reels/meta.ts`);
  for (const id of Object.keys(META)) assert.ok(libraryById(id), `meta.ts describes ${id}, which is not a reel`);
});

test('meta: levels, pillar weights and triggers are valid, and agree with the pillar lists', () => {
  for (const [id, m] of Object.entries(META)) {
    assert.ok(LEVELS.includes(m.level), id);
    for (const [p, w] of Object.entries(m.needs)) { assert.ok(PILLARS.includes(p as never), `${id}: ${p}`); assert.ok(w! > 0 && w! <= 1, `${id}: weight ${w}`); }
    for (const t of m.triggers ?? []) assert.ok(KNOWN_TRIGGERS.includes(t), `${id}: unknown trigger ${t}`);
  }
  for (const [p, list] of Object.entries(PILLAR_REELS)) for (const id of list) assert.ok((META[id]?.needs[p as never] ?? 0) >= 0.3, `${id} is listed for ${p} but meta.ts barely mentions it`);
  assert.equal(metaOf('not-a-reel').level, 'concept');
});

// ── signals ──────────────────────────────────────────────────────────────────────────────────────────────────

test('signals: pillars, weakest, events, strain and emergency-fund months are derived and bad input is dropped', () => {
  const s = sig({ now: NOW, pillars: [{ id: 'insurance', score: 10 }, { id: 'nonsense', score: 50 }, { id: 'debt', score: NaN }, { id: 'savings', score: 130 }], weakestId: 'insurance', mine: { fund: 120_000, spend: 40_000 }, income: '₹1,00,000', age: '29' });
  assert.deepEqual(s.pillars, { insurance: 10, savings: 100 });
  assert.equal(s.weakest, 'insurance'); assert.equal(s.income, 100_000); assert.equal(s.age, 29);
  assert.equal(s.fundMonths, 3); assert.equal(s.hasLoan, false); assert.equal(s.strain, false);
  assert.equal(sig({ now: NOW, weakestId: 'bogus' }).weakest, null);
  assert.equal(sig({ now: NOW, income: 'abc', age: -4 }).income, undefined);
});

test('signals: strain is a loan EMI at or above half of income, or a declared loss of income that is active', () => {
  const mine: Mine = { loan: { ...homeLoan, emi: 55_000 } };
  assert.equal(sig({ now: NOW, mine, income: 100_000 }).strain, true);
  assert.equal(sig({ now: NOW, mine: { loan: { ...homeLoan, emi: 30_000 } }, income: 100_000 }).strain, false);
  assert.equal(sig({ now: NOW, mine }).strain, false, 'no income known: no strain is assumed');
  assert.equal(STRAIN_RATIO, 0.5);
  assert.equal(sig({ now: NOW, events: [ev('job_loss', '2026-09-01')] }).strain, true);
  assert.equal(sig({ now: NOW, events: [ev('job_loss', '2024-01-01')] }).strain, false, 'a loss of income long past is not strain');
});

test('signals: only active life events count', () => {
  const s = sig({ now: NOW, events: [ev('child', '2027-01-15'), ev('home', '2031-01-01'), ev('marriage', '2020-01-01')] });
  assert.deepEqual(s.events, ['child']);          // the home is beyond its lead time, the wedding beyond its window
});

// ── triggers ─────────────────────────────────────────────────────────────────────────────────────────────────

test('triggers: the calendar seasons and the advance-tax window', () => {
  const t = (d: Date) => [...activeTriggers(sig({ now: d })).keys()];
  assert.ok(t(at(2027, 2, 10)).includes('cal:tax-season'));
  assert.ok(t(at(2026, 4, 20)).includes('cal:regime-choice'));
  assert.ok(t(at(2026, 7, 5)).includes('cal:filing-season'));
  assert.deepEqual(t(at(2026, 10, 19)).filter(k => k.startsWith('cal:')), []);
  assert.equal(nearAdvanceTax(at(2026, 6, 5)), true);  assert.equal(nearAdvanceTax(at(2026, 6, 4)), false);
  assert.equal(nearAdvanceTax(at(2026, 6, 15)), true); assert.equal(nearAdvanceTax(at(2026, 6, 16)), false);
  assert.equal(nearAdvanceTax(at(2027, 3, 8)), true);  assert.equal(nearAdvanceTax(at(2026, 5, 10)), false);
});

test('triggers: states and events, each with a sentence in both languages', () => {
  const s = sig({ now: NOW, mine: { loan: homeLoan, fund: 50_000, spend: 40_000 }, events: [ev('child', '2027-01-15')] });
  const t = activeTriggers(s);
  for (const k of ['state:has-loan', 'state:fund-low', 'event:child']) assert.ok(t.has(k), k);
  for (const note of t.values()) assert.ok(note.en.length > 10 && /[ऀ-ॿ]/.test(note.hi));
  assert.match(t.get('event:child')!.en, /a child/i);
  for (const k of Object.keys(DEFS)) assert.ok(KNOWN_TRIGGERS.includes(`event:${k}`));
});

// ── ranker v2, with made-up people ───────────────────────────────────────────────────────────────────────────

test('ranker: with no data nothing is favoured for a reason the app does not know, and every reel is kept once', () => {
  const r = rank(sig({ now: NOW }));
  assert.equal(r.length, LIBRARY.length);
  assert.equal(new Set(ids(r)).size, LIBRARY.length);
  assert.ok(r.every(x => x.reason === null || x.why !== 'pillar'), 'no pillar reason without a Money Score');
});

test('ranker: a fresh graduate with no insurance sees an insurance reel at the top, and is told why', () => {
  const s = sig({ now: NOW, pillars: [{ id: 'insurance', score: 5 }, { id: 'savings', score: 60 }, { id: 'emergency', score: 55 }, { id: 'debt', score: 80 }, { id: 'investing', score: 60 }, { id: 'wealth', score: 70 }], weakestId: 'insurance', age: 24 });
  const r = rank(s);
  assert.ok((metaOf(r[0].reel.id).needs.insurance ?? 0) >= 0.8, `top was ${r[0].reel.id}`);              // any reel that speaks strongly to insurance, whatever its rung
  assert.equal(r[0].why, 'pillar'); assert.match(r[0].reason!.en, /insurance cover/);
});

test('ranker: in February tax reels rise, with the season as the reason, and the episode still mixes topics', () => {
  const r = rank(sig({ now: at(2027, 2, 10) }));
  const top = ids(r, 12);
  assert.ok(top.includes('tax-regimes') && top.includes('section-80c'), top.join());
  assert.ok(r.slice(0, 5).every(x => x.why === 'timely'), 'the first reels are the season\'s');
  assert.equal(r.find(x => x.reel.id === 'section-80c')!.why, 'timely');
  assert.match(r.find(x => x.reel.id === 'section-80c')!.reason!.en, /tax-saving season/);
  const ep = composeEpisode(r, 3);
  assert.ok(new Set(ep.picks.map(p => p.reel.topic)).size >= 2, 'a tax-season episode is not three tax reels in a row');
});

test('ranker: a declared child lifts life cover, and a low emergency fund lifts the emergency-fund reel', () => {
  const child = rank(sig({ now: NOW, events: [ev('child', '2027-01-15')] }));
  assert.ok(ids(child, 3).includes('life-cover'), ids(child, 3).join());
  const low = rank(sig({ now: NOW, mine: { fund: 30_000, spend: 40_000 } }));
  assert.ok(ids(low, 3).includes('emergency-fund'), ids(low, 3).join());
  assert.equal(low.find(x => x.reel.id === 'emergency-fund')!.why, 'timely');
});

test('ranker: a question missed yesterday still comes first, and a right answer a week old is only a refresher', () => {
  const s = sig({ now: NOW, weakestId: 'insurance', pillars: [{ id: 'insurance', score: 5 }] });
  const watched: Watched = { 'inflation': { at: at(2026, 10, 17).toISOString(), correct: false }, 'cash-flow': { at: at(2026, 10, 10).toISOString(), correct: true } };
  const r = rank(s, watched);
  assert.equal(r[0].reel.id, 'inflation'); assert.equal(r[0].why, 'review');
  assert.equal(r.find(x => x.reel.id === 'cash-flow')!.why, 'refresh');
  const sameDay = rank(s, { inflation: { at: NOW.toISOString(), correct: false } });
  assert.notEqual(sameDay[0].why, 'review');
});

test('"I know this": the reel stops being offered fresh, and "less of this" lowers a whole topic', () => {
  const s = sig({ now: NOW, weakestId: 'investing', pillars: [{ id: 'investing', score: 10 }] });
  const base = rank(s);
  assert.ok(ids(base, 8).includes('start-early'));
  const known = rank(s, {}, addKnown(EMPTY_PROFILE, 'start-early'));
  const k = known.find(x => x.reel.id === 'start-early')!;
  assert.equal(k.why, 'done'); assert.ok(known.indexOf(k) > known.length - 6, 'a known reel sinks to the bottom');
  const pos = (r: typeof base, id: string) => r.findIndex(x => x.reel.id === id);
  let p = EMPTY_PROFILE; for (let i = 0; i < MAX_LESS; i++) p = addLess(p, 'invest');
  const less = rank(s, {}, p);
  assert.ok(pos(less, 'mf-units-nav') > pos(base, 'mf-units-nav'), 'an investing reel ranks lower after asking for less');
  assert.equal(pos(less, 'tax-dates') <= pos(base, 'tax-dates') + 1, true, 'other topics are not pushed down');
});

test('distress guard: a person under money strain never sees a reel that says "put in more", and gets gentler ones first', () => {
  const s = sig({ now: NOW, mine: { loan: { ...homeLoan, emi: 62_000 } }, income: 100_000, pillars: [{ id: 'investing', score: 5 }, { id: 'debt', score: 20 }], weakestId: 'investing' });
  assert.equal(s.strain, true);
  const r = rank(s);
  for (const x of r) assert.ok(!metaOf(x.reel.id).growth, `${x.reel.id} pushes growth but was offered`);
  assert.ok(!ids(r).includes('start-early') && !ids(r).includes('guess-sip') && !ids(r).includes('delay-cost'));
  const top = r[0];
  assert.ok((metaOf(top.reel.id).needs.debt ?? 0) >= 0.7 || (metaOf(top.reel.id).needs.emergency ?? 0) >= 0.8, `top was ${top.reel.id}`);
  assert.ok(['gentle', 'timely'].includes(top.why));
  const ep = composeEpisode(r);
  for (const p of ep.picks) assert.ok(!metaOf(p.reel.id).growth);
});

test('distress guard: 300 made-up people, and none under strain ever gets a growth reel in the ranking or the episode', () => {
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let strained = 0;
  for (let i = 0; i < 300; i++) {
    const income = 20_000 + Math.round(rnd() * 180_000), emiAmt = Math.round(income * (0.1 + rnd() * 0.8));
    const mine: Mine = rnd() > 0.2 ? { loan: { ...homeLoan, emi: emiAmt, balance: 800_000 + Math.round(rnd() * 5_000_000) } } : {};
    const events = rnd() > 0.85 ? [ev('job_loss', '2026-09-01')] : [];
    const s = sig({ now: at(2026, 1 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27)), mine, income, events, pillars: PILLARS.map(id => ({ id, score: Math.round(rnd() * 100) })), weakestId: PILLARS[Math.floor(rnd() * 6)] });
    const r = rank(s);
    if (!s.strain) continue;
    strained++;
    for (const x of composeEpisode(r).picks) assert.ok(!metaOf(x.reel.id).growth, `person ${i}: ${x.reel.id}`);
    assert.ok(r.every(x => !metaOf(x.reel.id).growth), `person ${i}`);
  }
  assert.ok(strained > 20, `only ${strained} strained people were tested`);
});

test('episode: a 30-day simulated person gets a different, finished, relevant episode each day', () => {
  const s = sig({ now: NOW, weakestId: 'insurance', pillars: [{ id: 'insurance', score: 10 }, { id: 'savings', score: 60 }], age: 27 });
  let watched: Watched = {}; const seen = new Set<string>(); let insuranceDay = -1;
  for (let day = 0; day < 30; day++) {
    const now = new Date(NOW.getTime() + day * 86_400_000);
    const ep = composeEpisode(rankReelsV2(LIBRARY, { watched, signals: { ...s, now }, profile: EMPTY_PROFILE, now }), 3);
    assert.equal(ep.picks.length, 3);
    if (insuranceDay < 0 && ep.picks.some(p => ['insurance-basics', 'life-cover'].includes(p.reel.id))) insuranceDay = day;
    for (const p of ep.picks) { seen.add(p.reel.id); watched = { ...watched, [p.reel.id]: { at: now.toISOString(), correct: true } }; }
  }
  assert.ok(insuranceDay >= 0 && insuranceDay <= 4, `an insurance reel arrived on day ${insuranceDay}`);
  assert.ok(seen.size >= 40, `only ${seen.size} different reels in 30 days`);
});

// ── the person's profile ─────────────────────────────────────────────────────────────────────────────────────

test('reels profile: parsed safely, bounded and never trusts what it reads', () => {
  assert.deepEqual(parseReelsProfile(null), { v: 1, known: [], less: {} });
  assert.deepEqual(parseReelsProfile('not json'), { v: 1, known: [], less: {} });
  const p = parseReelsProfile(JSON.stringify({ known: ['start-early', 'start-early', 'BAD ID', 7, '<script>'], less: { invest: 9, tax: 2, nonsense: 3, loans: -1, credit: 'x' } }));
  assert.deepEqual(p.known, ['start-early']); assert.deepEqual(p.less, { invest: MAX_LESS, tax: 2 });
  let q = EMPTY_PROFILE; for (let i = 0; i < MAX_KNOWN + 20; i++) q = addKnown(q, `reel-${i}`);
  assert.equal(q.known.length, MAX_KNOWN);
  assert.equal(addKnown(EMPTY_PROFILE, 'Bad Id'), EMPTY_PROFILE);
  assert.equal(addLess(addLess(EMPTY_PROFILE, 'tax'), 'tax').less.tax, 2);
});

// ── moves and receipts ───────────────────────────────────────────────────────────────────────────────────────

test('moves: only reels with a figure to check start a move, and the figure is remembered as it was', () => {
  for (const id of Object.keys(METRIC_OF)) assert.ok(libraryById(id), `${id} is not a reel`);
  const mine: Mine = { sip: 5000, fund: 80_000, loan: homeLoan };
  assert.equal(startMove(EMPTY_MOVES, 'cash-flow', mine, NOW), EMPTY_MOVES);
  const s = startMove(EMPTY_MOVES, 'start-early', mine, NOW);
  assert.deepEqual(s.open.map(m => [m.id, m.metric, m.before]), [['start-early', 'sip', 5000]]);
  assert.equal(startMove(s, 'start-early', { sip: 7000 }, NOW).open.length, 1, 'tapping again replaces the move, it does not add a second one');
  assert.equal(metricValue('loan', mine), 1_000_000); assert.equal(metricValue('sip', {}), 0);
});

test('receipts: a figure that really improved earns one, a tap or a wobble does not', () => {
  const s0 = startMove(startMove(startMove(EMPTY_MOVES, 'start-early', { sip: 5000 }, NOW), 'emergency-fund', { fund: 80_000 }, NOW), 'emi-trap', { loan: homeLoan }, NOW);
  const later = new Date(NOW.getTime() + 3 * 86_400_000);
  const none = settleMoves(s0, { sip: 5100, fund: 80_500, loan: { ...homeLoan, balance: 995_000 } }, later);
  assert.equal(unseenReceipts(none).length, 0); assert.equal(none.open.length, 3);
  const done = settleMoves(s0, { sip: 8000, fund: 160_000, loan: { ...homeLoan, balance: 900_000 }, spend: 40_000 }, later);
  assert.deepEqual(unseenReceipts(done).map(r => r.id).sort(), ['emergency-fund', 'emi-trap', 'start-early']);
  assert.equal(done.open.length, 0);
  const sip = unseenReceipts(done).find(r => r.id === 'start-early')!;
  const t = receiptText(sip, { sip: 8000 });
  assert.match(t.body.en, /From ₹5,000 to ₹8,000/); assert.match(t.body.en, /assumed 12%/); assert.match(t.body.en, /not a promise/);
  assert.ok(t.body.en.includes('₹') && /[ऀ-ॿ]/.test(t.body.hi) && /[ऀ-ॿ]/.test(t.title.hi));
  near3(sipFutureValue(3000, 12, 20), 2_994_000);
  assert.match(receiptText(unseenReceipts(done).find(r => r.id === 'emergency-fund')!, { spend: 40_000 }).body.en, /4 months of your spending/);
  const cleared = settleMoves(startMove(EMPTY_MOVES, 'emi-trap', { loan: homeLoan }, NOW), {}, later);
  assert.equal(receiptText(unseenReceipts(cleared)[0], {}).title.en, 'Your loan is cleared');
  const seen = markSeen(done, sip.id, sip.at);
  assert.equal(unseenReceipts(seen).length, 2);
});

function near3(a: number, b: number) { assert.ok(Math.abs(a - b) / b < 0.01, `${a} vs ${b}`); }

test('receipts: a SIP started from nothing is a receipt too, and old unfinished moves expire', () => {
  const s = startMove(EMPTY_MOVES, 'guess-sip', {}, NOW);
  assert.equal(s.open[0].before, 0);
  const r = settleMoves(s, { sip: 3000 }, new Date(NOW.getTime() + 86_400_000));
  assert.equal(receiptText(unseenReceipts(r)[0], {}).title.en, 'You started a SIP');
  const old = settleMoves(startMove(EMPTY_MOVES, 'start-early', { sip: 5000 }, NOW), { sip: 5000 }, new Date(NOW.getTime() + 90 * 86_400_000));
  assert.equal(old.open.length, 0); assert.equal(old.receipts.length, 0);
  assert.equal(improved({ id: 'x', metric: 'loan', at: '', before: 0 }, 0), false);
});

test('moves: stored state is parsed safely', () => {
  assert.deepEqual(parseMoves('garbage'), EMPTY_MOVES);
  const p = parseMoves(JSON.stringify({ open: [{ id: 'start-early', metric: 'sip', at: 'x', before: 5000 }, { id: 'BAD', metric: 'sip', at: 'x', before: 1 }, { id: 'a', metric: 'other', at: 'x', before: 1 }, { id: 'a', metric: 'sip', at: 'x', before: -5 }],
    receipts: [{ id: 'start-early', metric: 'sip', at: 'x', before: 1, after: 2, seen: true }, { id: 'a', metric: 'sip', at: 'x', before: 1 }] }));
  assert.equal(p.open.length, 1); assert.equal(p.receipts.length, 1); assert.equal(p.receipts[0].seen, true);
});

// ── Your Number for the playable reels ───────────────────────────────────────────────────────────────────────

test('your number: months left on a loan, from balance, rate and EMI (known answer)', () => {
  near3(monthsLeft(1_000_000, 9, emi(1_000_000, 9, 20)), 240);
  near3(monthsLeft(500_000, 0, 10_000), 50);
  assert.ok(Number.isNaN(monthsLeft(1_000_000, 12, 5000)), 'an EMI under the interest never clears the loan');
  assert.ok(loanFor(homeLoan));
  assert.equal(loanFor({ ...homeLoan, emi: 900_000 }), null, 'under a year left: keep the example');
});

test('your number: the SIP and loan reels are rebuilt from the person\'s figures and keep their id, order and rules', () => {
  const mine: Mine = { sip: 12_000, loan: { label: { en: 'car loan', hi: 'कार लोन' }, balance: 600_000, rate: 10, emi: 14_000 } };
  const out = personalisePlay(LIBRARY, mine);
  assert.deepEqual(out.map(r => r.id), LIBRARY.map(r => r.id));
  const g = out.find(r => r.id === 'guess-sip')!;
  assert.equal(g.mine, true);
  const beat = g.poke!.beat as { answer: number; min: number; max: number };
  near3(beat.answer, sipFutureValue(12_000, 12, 30)); assert.ok(beat.min < beat.answer && beat.answer < beat.max);
  assert.ok(g.scenes[0].say.en.includes('₹12,000'));
  const d = out.find(r => r.id === 'delay-cost')!; assert.equal(d.mine, true); assert.equal((d.poke!.beat as { model: { monthly: number } }).model.monthly, 12_000);
  const e = out.find(r => r.id === 'guess-emi')!; assert.equal(e.mine, true); assert.match(e.scenes[0].say.en, /car loan/);
  const n = Math.round(monthsLeft(600_000, 10, 14_000)), interest = 14_000 * n - 600_000;
  near3((e.poke!.beat as { answer: number }).answer, interest);
  assert.equal(personalisePlay(LIBRARY, {}).find(r => r.id === 'guess-sip')!.mine, undefined, 'with no figure the example stays');
  for (const r of out.filter(x => ['guess-sip', 'delay-cost', 'guess-emi'].includes(x.id))) assert.deepEqual(validateReel(r), [], r.id);
});

test('your number: rebuilt reels pass every script rule across a wide range of figures', () => {
  const bad: string[] = [];
  for (const sip of [500, 1000, 2500, 5000, 10_000, 25_000, 100_000, 499_999]) for (const r of [buildGuessSip(sip, true), buildDelayCost(sip, true)]) bad.push(...validateReel(r).map(m => `sip ${sip}: ${m}`));
  for (const balance of [50_000, 300_000, 1_000_000, 5_000_000, 40_000_000]) for (const rate of [6, 8.5, 12, 24]) {
    const e = Math.round(emi(balance, rate, 15) * 1.1), l = loanFor({ label: { en: 'personal loan', hi: 'पर्सनल लोन' }, balance, rate, emi: e });
    if (l) bad.push(...validateReel(buildGuessEmi(l)).map(m => `loan ${balance}@${rate}: ${m}`));
  }
  assert.deepEqual(bad, []);
});

test('your number: the trust note for a rebuilt reel names the person\'s own figures, not the example\'s', () => {
  assert.match(trustFor('guess-sip')!.assumes.en, /₹5,000/);
  const mine = trustFor('guess-sip', true)!.assumes;
  assert.ok(!/₹5,000/.test(mine.en) && /own monthly SIP/.test(mine.en) && /[ऀ-ॿ]/.test(mine.hi));
  assert.match(trustFor('emi-trap', true)!.assumes.en, /own loan/);
  assert.match(trustFor('rbi-and-emi', true)!.assumes.en, /own figures/);
  assert.equal(trustFor('nope', true), null);
});

// ── the privacy inventory ────────────────────────────────────────────────────────────────────────────────────

test('the new storage keys are listed in the privacy inventory as never synced', () => {
  for (const key of ['finos_session_reels_profile', 'finos_session_reels_moves']) {
    const d = privacy.DATA_ITEMS.find(x => x.key === key);
    assert.ok(d, `${key} is not listed`); assert.match(d!.label, /never synced/);
  }
});
