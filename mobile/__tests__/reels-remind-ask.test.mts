// Phase 3 pieces that are not content: local reel reminders ("when will you do it?" and the daily nudge) and Ask Mitra on the phone tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT_ALL, LIBRARY } from '../lib/reels/library.ts';
import {
  DEFAULT_NUDGE, EARLIEST_HOUR, ID_PREFIX, LATEST_HOUR, MAX_MOVE_REMINDERS, NUDGE_DAYS, NUDGE_HOURS, addMove, fromLocalIso, normaliseMoves, normaliseNudge, pendingMoves, planAll, planMoves, planNudges, toLocalIso, whenOptions,
  type MoveReminder,
} from '../lib/reels/reminders.ts';
import { ALLOWED, askMitra, contextBase, overrides, suggestionsFor } from '../lib/reels/ask.ts';
import { makeFacts } from '../lib/aryaFacts.ts';
import { sipFutureValue } from '../lib/reels/figures.ts';
import { personalisePlay } from '../lib/reels/personal-play.ts';
import { loadSignals } from '../lib/reels/signals.ts';
import * as privacy from '../lib/privacy.ts';

const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min);
const T = { en: 'Compounding', hi: 'चक्रवृद्धि' };
const move = (reelId: string, when: string, label = { en: 'Try the SIP calculator', hi: 'SIP कैलकुलेटर आज़माएँ' }): MoveReminder => ({ reelId, at: when, href: '/tools/calc/sip', label });

// ── when will you do it? ─────────────────────────────────────────────────────────────────────────────────────

test('when options: tonight only while 8 pm is still ahead, then tomorrow, the coming Saturday, the start of next month', () => {
  const morning = whenOptions(at(2026, 10, 19, 9));                  // a Monday
  assert.deepEqual(morning.map(o => o.id), ['tonight', 'tomorrow', 'weekend', 'month']);
  assert.equal(toLocalIso(morning[0].at), '2026-10-19T20:00');
  assert.equal(toLocalIso(morning[1].at), '2026-10-20T09:00');
  assert.equal(toLocalIso(morning[2].at), '2026-10-24T10:00');       // Saturday
  assert.equal(toLocalIso(morning[3].at), '2026-11-01T09:00');
  const late = whenOptions(at(2026, 10, 19, 19, 45));                // 20:00 is under half an hour away: not offered
  assert.deepEqual(late.map(o => o.id), ['tomorrow', 'weekend', 'month']);
  const saturday = whenOptions(at(2026, 10, 24, 11));
  assert.equal(toLocalIso(saturday.find(o => o.id === 'weekend')!.at), '2026-10-31T10:00', 'on a Saturday the weekend means the next one');
  assert.equal(toLocalIso(whenOptions(at(2026, 12, 15, 9)).find(o => o.id === 'month')!.at), '2027-01-01T09:00', 'December rolls into January');
  for (const o of morning) { assert.ok(o.at.getTime() > at(2026, 10, 19, 9).getTime()); assert.ok(o.label.en.length > 5 && /[ऀ-ॿ]/.test(o.label.hi)); assert.ok(o.at.getHours() >= EARLIEST_HOUR && o.at.getHours() <= LATEST_HOUR); }
});

test('local date-times: written and read back, and nonsense is refused', () => {
  const d = at(2026, 2, 3, 7, 5);
  assert.equal(toLocalIso(d), '2026-02-03T07:05'); assert.equal(fromLocalIso('2026-02-03T07:05')!.getTime(), d.getTime());
  for (const bad of ['', 'tomorrow', '2026-13-01T09:00', '2026-02-30T09:00', '2026-02-03 09:00', '2026-02-03T25:00x']) assert.equal(fromLocalIso(bad), null, bad);
});

test('move reminders: stored lists are cleaned, one per reel, bounded, and only future ones are kept', () => {
  const raw = [move('guess-sip', '2026-10-20T09:00'), move('guess-sip', '2026-10-21T09:00'), { reelId: 'BAD ID', at: '2026-10-20T09:00', href: '/x', label: T }, { reelId: 'a', at: 'soon', href: '/x', label: T },
    { reelId: 'b', at: '2026-10-20T09:00', href: 'javascript:alert(1)', label: T }, { reelId: 'c', at: '2026-10-20T09:00', href: '/ok', label: 'text' }, null, 7];
  const clean = normaliseMoves(raw);
  assert.equal(clean.length, 1); assert.equal(clean[0].at, '2026-10-21T09:00', 'asking again replaces the earlier reminder');
  assert.deepEqual(normaliseMoves('nope'), []);
  let many: MoveReminder[] = []; for (let i = 0; i < MAX_MOVE_REMINDERS + 5; i++) many = addMove(many, move(`reel-${i}`, '2026-10-20T09:00'));
  assert.equal(many.length, MAX_MOVE_REMINDERS);
  const now = at(2026, 10, 19, 12);
  const pend = pendingMoves([move('a', '2026-10-19T08:00'), move('b', '2026-10-25T09:00'), move('c', '2026-10-20T09:00')], now);
  assert.deepEqual(pend.map(m => m.reelId), ['c', 'b']);
});

test('move notices: generic title, the tool as the body, in the app\'s language, nothing about amounts', () => {
  const list = [move('guess-sip', '2026-10-20T09:00')];
  const en = planMoves(list, at(2026, 10, 19, 12), 'en')[0], hi = planMoves(list, at(2026, 10, 19, 12), 'hi')[0];
  assert.equal(en.id, `${ID_PREFIX}move-guess-sip`); assert.equal(en.title, 'Your money move'); assert.equal(en.body, 'Try the SIP calculator'); assert.equal(en.route, '/tools/calc/sip');
  assert.ok(/[ऀ-ॿ]/.test(hi.title) && /[ऀ-ॿ]/.test(hi.body));
  assert.ok(!/₹|\d{3}/.test(en.title + en.body));
  assert.deepEqual(planMoves(list, at(2026, 10, 21, 12)), [], 'a moment that has passed is not scheduled');
});

// ── the daily nudge ──────────────────────────────────────────────────────────────────────────────────────────

test('nudge preferences: off by default, a sane hour, nonsense ignored', () => {
  assert.deepEqual(normaliseNudge(null), DEFAULT_NUDGE); assert.equal(DEFAULT_NUDGE.enabled, false);
  assert.deepEqual(normaliseNudge({ enabled: true, hour: 20 }), { enabled: true, hour: 20 });
  assert.equal(normaliseNudge({ enabled: true, hour: 3 }).hour, DEFAULT_NUDGE.hour, 'never in the small hours');
  assert.equal(normaliseNudge({ enabled: true, hour: 23 }).hour, DEFAULT_NUDGE.hour, 'never late at night');
  assert.equal(normaliseNudge({ enabled: 'yes' }).enabled, false);
  assert.ok(NUDGE_HOURS.every(h => h >= EARLIEST_HOUR && h <= LATEST_HOUR));
});

test('nudge plan: one a day at the chosen hour, curious not guilty, silent when today is done or the hour has passed', () => {
  const prefs = { enabled: true, hour: 18 };
  const titles = [{ en: 'The EMI trap', hi: 'EMI का जाल' }, { en: 'Inflation', hi: 'महँगाई' }, { en: 'Rule of 72', hi: '72 का नियम' }];
  const morning = planNudges(prefs, at(2026, 10, 19, 9), false, titles);
  assert.equal(morning.length, NUDGE_DAYS);
  assert.deepEqual(morning.map(n => n.body), ['The EMI trap', 'Inflation', 'Rule of 72']);
  assert.deepEqual(morning.map(n => n.at.getHours()), [18, 18, 18]);
  assert.equal(new Set(morning.map(n => n.id)).size, NUDGE_DAYS);
  for (const n of morning) assert.ok(!/streak|miss|lost|don't|don’t|behind|hurry|last chance/i.test(n.title + n.body), n.body);
  assert.equal(planNudges(prefs, at(2026, 10, 19, 9), true, titles).length, NUDGE_DAYS - 1, 'a day with a finished reel gets no nudge');
  assert.equal(planNudges(prefs, at(2026, 10, 19, 19), false, titles).length, NUDGE_DAYS - 1, 'today\'s hour has passed');
  assert.deepEqual(planNudges({ ...prefs, enabled: false }, at(2026, 10, 19, 9), false, titles), []);
  assert.deepEqual(planNudges(prefs, at(2026, 10, 19, 9), false, []), []);
  assert.equal(planNudges(prefs, at(2026, 10, 19, 9), false, titles.slice(0, 1)).length, NUDGE_DAYS, 'fewer titles than days reuse the last');
  assert.match(planNudges(prefs, at(2026, 10, 19, 9), false, titles, 'hi')[0].title, /[ऀ-ॿ]/);
});

test('the whole plan is sorted, never in quiet hours, and never touches the calendar reminders\' ids', () => {
  const plan = planAll({ enabled: true, hour: 20 }, [move('guess-sip', '2026-10-19T21:00'), move('x', '2026-10-20T03:00'), move('y', '2026-10-22T09:00')], at(2026, 10, 19, 9), false, [T]);
  assert.ok(plan.every(n => n.at.getHours() >= EARLIEST_HOUR && n.at.getHours() <= LATEST_HOUR), 'the 3 am reminder is dropped');
  assert.deepEqual([...plan].sort((a, b) => a.at.getTime() - b.at.getTime()).map(n => n.id), plan.map(n => n.id));
  for (const n of plan) { assert.ok(n.id.startsWith('finosreel-')); assert.ok(!n.id.startsWith('finos-'), 'must not be cancelled by the calendar reminders'); }
});

test('the reminder keys are in the privacy inventory as never synced', () => {
  for (const key of ['finos_session_reels_nudge', 'finos_session_reels_reminders']) {
    const d = privacy.DATA_ITEMS.find(x => x.key === key); assert.ok(d, key); assert.match(d!.label, /never synced/);
  }
  assert.equal(typeof loadSignals, 'function');
});

test('every reel with a tool can be reminded: its tool link is a safe route the reminder will accept', () => {
  let n = 0;
  for (const r of LIBRARY) {
    const a = ACT_ALL[r.id]; if (!a) continue;
    n++;
    assert.equal(normaliseMoves([{ reelId: r.id, at: '2026-10-20T09:00', href: a.href, label: a.label }]).length, 1, `${r.id}: ${a.href}`);
  }
  assert.ok(n > 40);
});

// ── Ask Mitra ────────────────────────────────────────────────────────────────────────────────────────────────

const ctx = { facts: makeFacts({ now: new Date(2026, 9, 19) }) };
const reel = (id: string) => LIBRARY.find(r => r.id === id)!;

test('Ask Mitra: the numbers a question changes (a percentage is the rate, years or months the time, money the amount, a bare number nothing)', () => {
  assert.deepEqual(overrides('what if the rate is 10%?'), { rate: 10 });
  assert.deepEqual(overrides('and for 20 years?'), { years: 20 });
  assert.deepEqual(overrides('what about 18 months'), { years: 1.5 });
  assert.deepEqual(overrides('what if I put in 1 lakh at 9% for 15 yrs'), { amount: 100_000, rate: 9, years: 15 });
  assert.deepEqual(overrides('what if 7'), {});
  assert.deepEqual(overrides('hello'), {});
  assert.deepEqual(overrides('what if the rate is 400%'), {}, 'an absurd rate is ignored');
});

test('Ask Mitra: a what-if keeps the reel\'s own numbers and changes only what was named, using the same calculator as the screens', () => {
  const base = contextBase(reel('guess-sip'))!;
  assert.deepEqual(base, { tool: 'sip_calc', amount: 5000, rate: 12, years: 30 });
  const a = askMitra('what if the rate is 10%?', ctx, base);
  assert.equal(a.kind, 'whatif'); assert.match(a.note!.en, /rate 10%/); assert.ok(/[ऀ-ॿ]/.test(a.note!.hi));
  assert.match(a.text!, /₹5,000 a month at 10% a year for 30 years/);
  assert.match(a.text!, /Total: ₹1\.14 Cr/);                                   // ≈ sipFutureValue(5000, 10, 30)
  assert.ok(Math.abs(sipFutureValue(5000, 10, 30) - 11_379_000) / 11_379_000 < 0.01);
  assert.match(askMitra('and for 20 years?', ctx, base).text!, /₹5,000 a month at 12% a year for 20 years/);
  assert.match(askMitra('what if I put in 1 lakh', ctx, base).text!, /₹1,00,000 a month at 12% a year for 30 years/);
  assert.ok(a.source && a.asOf);
});

test('Ask Mitra: a fully stated calculator sentence is answered as itself, even inside a reel', () => {
  const a = askMitra('SIP of 10000 at 12% for 15 years', ctx, contextBase(reel('guess-sip')));
  assert.equal(a.kind, 'tool'); assert.match(a.text!, /₹10,000 a month at 12% a year for 15 years/);
});

test('Ask Mitra: it never says what to buy, never goes online, never changes anything', () => {
  const base = contextBase(reel('guess-sip'));
  assert.equal(askMitra('should I buy HDFC Bank shares', ctx, base).kind, 'advice');
  assert.match(askMitra('which mutual fund should I invest in', ctx, base).note!.en, /cannot say what to buy/);
  assert.equal(askMitra('bitcoin price', ctx, base).kind, 'blocked');
  assert.equal(askMitra('remember that I like index funds', ctx, base).kind, 'blocked');
  assert.equal(askMitra('open the tax planner', ctx, base).kind, 'blocked');
  for (const q of ['hello', '', '   ', 'x'.repeat(500)]) assert.ok(['none', 'tool', 'advice', 'blocked'].includes(askMitra(q, ctx, base).kind));
  for (const t of ['quote', 'market', 'crypto', 'fx', 'news', 'memory_add', 'open_screen'] as const) assert.ok(!ALLOWED.includes(t), t);
  for (const m of [askMitra('hello', ctx, base), askMitra('bitcoin price', ctx, base)]) assert.ok(/[ऀ-ॿ]/.test(m.note!.hi));
});

test('Ask Mitra: questions about the person\'s own records are answered from the phone, and a missing figure is named, not made up', () => {
  const a = askMitra('what is my savings rate?', ctx, null);
  assert.equal(a.kind, 'tool'); assert.match(a.text!, /not recorded/);
  const f = askMitra('how many months does my emergency fund cover?', { facts: makeFacts({ now: new Date(2026, 9, 19) }) }, null);
  assert.equal(f.kind, 'tool'); assert.ok(f.source);
});

test('Ask Mitra: the calculator behind each reel, including a reel built from the person\'s own figures', () => {
  assert.equal(contextBase(reel('emi-trap'))!.tool, 'emi_calc');
  assert.equal(contextBase(reel('inflation'))!.tool, 'inflation_calc');
  assert.equal(contextBase(reel('delay-cost'))!.tool, 'sip_calc');
  assert.equal(contextBase(reel('inflation-slide'))!.tool, 'inflation_calc');
  assert.equal(contextBase(reel('myths-scams')), null);
  const mine = { sip: 12_000 };
  const own = personalisePlay(LIBRARY, mine).find(r => r.id === 'guess-sip')!;
  assert.equal(contextBase(own, mine)!.amount, 12_000);
  assert.equal(contextBase(reel('guess-sip'), mine)!.amount, 5000, 'the example reel keeps its own numbers');
});

test('Ask Mitra: suggested questions fit the calculator and all parse as what-ifs', () => {
  for (const id of ['guess-sip', 'emi-trap', 'inflation', 'delay-cost']) {
    const base = contextBase(reel(id))!;
    const chips = suggestionsFor(base);
    assert.ok(chips.length >= 2);
    for (const c of chips) { assert.ok(/[ऀ-ॿ]/.test(c.hi)); const a = askMitra(c.en, ctx, base); assert.equal(a.kind, 'whatif', `${id}: ${c.en}`); assert.ok(a.text && !/To work out|NaN/.test(a.text), `${id}: ${c.en}: ${a.text}`); }
  }
  assert.ok(suggestionsFor(null).length >= 2);
});
