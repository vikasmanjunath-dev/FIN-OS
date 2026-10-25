// Challenges v2: eight seven-day challenges tied to reels, to the tools and to My moves, and the one that fits the person.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodePath from 'node:path';
import { CHALLENGES, EMPTY_CHALLENGES, WEAK_PILLAR, challengeById, completeToday, isFinished, parseChallenges, pledgeToStart, runOf, startChallenge, suggestChallenge } from '../lib/reels/challenges.ts';
import { ACT_ALL, LIBRARY, libraryById } from '../lib/reels/library.ts';
import { METRIC_OF } from '../lib/reels/moves.ts';
import { EMPTY_PROFILE, addPledge } from '../lib/reels/reelsProfile.ts';
import type { Signals } from '../lib/reels/signals.ts';

const root = nodePath.join(import.meta.dirname, '..');
const NOW = new Date(2026, 9, 24, 12);
const noon = (d: number, m = 10) => new Date(2026, m - 1, d, 12);

/** The same banned wording as the first challenge test (reels-more.test.mts), plus no purchase or investing instruction in a task. */
const BANNED = /you should (buy|invest|sell)|guaranteed|risk-free/i;
const INSTRUCTION = /\b(buy|purchase|sell|invest|subscribe to)\b/i;

/** A route exists when app/ has its file, its folder's index, or a dynamic file such as app/tools/calc/[id].tsx. */
function routeExists(href: string): boolean {
  const parts = href.replace(/^\//, '').split('/');
  let dir = nodePath.join(root, 'app');
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const next = nodePath.join(dir, parts[i]);
    if (last) {
      if (fs.existsSync(next + '.tsx') || fs.existsSync(nodePath.join(next, 'index.tsx'))) return true;
      return fs.existsSync(dir) && fs.readdirSync(dir).some(f => /^\[[^\]]+\]\.tsx$/.test(f));
    }
    if (fs.existsSync(next) && fs.statSync(next).isDirectory()) { dir = next; continue; }
    const dyn = fs.existsSync(dir) ? fs.readdirSync(dir).find(f => /^\[[^\]]+\]$/.test(f) && fs.statSync(nodePath.join(dir, f)).isDirectory()) : undefined;
    if (!dyn) return false;
    dir = nodePath.join(dir, dyn);
  }
  return false;
}

test('challenges v2: there are eight, with unique ids, and the first two are unchanged', () => {
  assert.equal(CHALLENGES.length, 8);
  assert.deepEqual(CHALLENGES.map(c => c.id), ['leak-week', 'scam-proof-week', 'know-your-numbers', 'first-fund-step', 'tax-ready-week', 'loan-checkup-week', 'insurance-basics-week', 'subscription-sweep']);
  assert.equal(new Set(CHALLENGES.map(c => c.id)).size, 8);
  assert.equal(new Set(CHALLENGES.map(c => c.title.en)).size, 8);
});

test('challenges v2: every challenge has seven tasks in both languages, safe wording, real routes and real reels', () => {
  for (const c of CHALLENGES) {
    assert.equal(c.days.length, 7, c.id);
    assert.equal(new Set(c.days.map(d => d.title.en)).size, 7, `${c.id}: unique task titles`);
    for (const l of [c.title, c.blurb, c.end, ...c.days.flatMap(d => [d.title, d.body, ...(d.hrefLabel ? [d.hrefLabel] : [])])]) {
      assert.ok(l.en.length > 5 && /[ऀ-ॿ]/.test(l.hi), `${c.id}: ${l.en}`);
      assert.ok(!BANNED.test(l.en), `${c.id}: ${l.en}`);
      assert.ok(!BANNED.test(l.hi));
    }
    for (const d of c.days) {
      assert.ok(d.title.en.length <= 40 && d.body.en.length <= 170, `${c.id}: ${d.title.en}`);
      assert.ok(!INSTRUCTION.test(d.title.en + ' ' + d.body.en), `${c.id}: ${d.title.en} reads as an instruction to buy or invest`);
      if (d.href) { assert.ok(routeExists(d.href), `${c.id}: no screen for ${d.href}`); assert.ok(d.hrefLabel, `${c.id}: a link needs a label`); }
      else assert.ok(!d.hrefLabel, `${c.id}: a label without a link`);
      if (d.reel) assert.ok(libraryById(d.reel), `${c.id}: no reel ${d.reel}`);
    }
    assert.ok(c.days.filter(d => d.reel).length >= 3, `${c.id}: at least three tasks link a reel`);
    if (c.id !== 'scam-proof-week') assert.ok(c.days.filter(d => d.href).length >= 2, `${c.id}: at least two tasks open a screen`);   // the scam week is all phone settings
    for (const p of c.pillars) assert.ok(['savings', 'emergency', 'insurance', 'debt', 'investing', 'wealth'].includes(p));
  }
  assert.ok(LIBRARY.length > 100);
});

test('challenges v2: the route checker really refuses a missing screen', () => {
  assert.ok(routeExists('/tracker/emergency') && routeExists('/insurance') && routeExists('/tools/calc/sip'));
  assert.ok(!routeExists('/tracker/nope') && !routeExists('/nope/x'));
});

test('challenges v2: the new ones run like the old: one task a day, finish in seven, ids survive storage', () => {
  for (const c of CHALLENGES) {
    let s = startChallenge(EMPTY_CHALLENGES, c.id, noon(1));
    assert.ok(runOf(s, c.id), c.id);
    for (let d = 1; d <= 7; d++) { s = completeToday(s, c.id, noon(d)); assert.equal(completeToday(s, c.id, noon(d)), s, 'second tick the same day changes nothing'); }
    assert.ok(isFinished(runOf(s, c.id)!), c.id);
    assert.deepEqual(parseChallenges(JSON.stringify(s)), s, `${c.id} survives a save and load`);
  }
  assert.equal(challengeById('tax-ready-week')!.growth, true);
  assert.ok(CHALLENGES.filter(c => c.growth).every(c => c.days.length === 7));
});

test('challenges v2: pledgeToStart offers a pledged reel only when its tool is this task’s screen and it can be tracked', () => {
  const href = (id: string) => ACT_ALL[id]?.href;
  const emergencyTask = challengeById('first-fund-step')!.days[1];                       // opens /tracker/emergency
  assert.equal(emergencyTask.href, '/tracker/emergency');
  assert.equal(pledgeToStart(emergencyTask, ['emergency-fund'], href), null, 'emergency-fund opens the score, not this screen');
  assert.equal(pledgeToStart(emergencyTask, ['emergency-target'], href), null, 'emergency-target has no tracked figure, so there is nothing to start');
  const debtTask = challengeById('loan-checkup-week')!.days[0];                          // opens /tools/debt
  assert.equal(METRIC_OF['good-bad-debt'], 'loan'); assert.equal(href('good-bad-debt'), '/tools/debt');
  assert.equal(pledgeToStart(debtTask, ['stock-basics', 'good-bad-debt'], href), 'good-bad-debt');
  assert.equal(pledgeToStart(debtTask, ['good-bad-debt'], href, ['good-bad-debt']), null, 'already started: no second offer');
  assert.equal(pledgeToStart(debtTask, [], href), null);
  assert.equal(pledgeToStart({ title: debtTask.title, body: debtTask.body }, ['good-bad-debt'], href), null, 'a task with no screen offers nothing');
  const prepayTask = challengeById('loan-checkup-week')!.days[4];                        // opens /tools/prepay
  assert.equal(pledgeToStart(prepayTask, ['emi-trap', 'guess-emi'], href), 'emi-trap');
});

const sig = (o: Partial<Signals> = {}): Pick<Signals, 'pillars' | 'weakest' | 'strain' | 'now'> => ({ now: NOW, pillars: {}, weakest: null, strain: false, ...o });

test('suggestChallenge: the weakest pillar picks its challenge', () => {
  const run = (pillars: Signals['pillars'], weakest: Signals['weakest'], state = EMPTY_CHALLENGES) => suggestChallenge(EMPTY_PROFILE, sig({ pillars, weakest }), state)?.id ?? null;
  assert.equal(run({ emergency: 10, debt: 60, insurance: 80 }, 'emergency'), 'first-fund-step');
  assert.equal(run({ insurance: 20, emergency: 50 }, 'insurance'), 'insurance-basics-week');
  assert.equal(run({ debt: 15, savings: 90 }, 'debt'), 'loan-checkup-week');
  assert.equal(run({ savings: 30, debt: 90 }, 'savings'), 'leak-week', 'the first challenge that speaks to savings');
  assert.equal(run({ wealth: 25 }, 'wealth'), 'know-your-numbers');
  assert.equal(run({ savings: 90, emergency: 90, insurance: 90, debt: 90, investing: 90, wealth: 90 }, 'wealth'), null, `nothing is weak (below ${WEAK_PILLAR})`);
  assert.equal(run({ savings: WEAK_PILLAR }, 'savings'), null, 'the line itself is not weak');
  assert.equal(run({}, 'debt'), 'loan-checkup-week', 'only the weakest id is known');
});

test('suggestChallenge: no Money Score means the gentle first one', () => {
  const s = suggestChallenge(EMPTY_PROFILE, sig(), EMPTY_CHALLENGES);
  assert.equal(s?.id, 'know-your-numbers');
  assert.ok(s!.label.en.includes('Know your numbers') && /[ऀ-ॿ]/.test(s!.label.hi));
  assert.ok(!BANNED.test(s!.label.en));
});

test('suggestChallenge: never a challenge the person already has, and a stale run does not count', () => {
  const base = { emergency: 5 };
  let st = startChallenge(EMPTY_CHALLENGES, 'first-fund-step', noon(20));
  assert.notEqual(suggestChallenge(EMPTY_PROFILE, sig({ pillars: base, weakest: 'emergency' }), st)?.id, 'first-fund-step', 'in progress');
  assert.equal(suggestChallenge(EMPTY_PROFILE, sig({ pillars: base, weakest: 'emergency' }), st), null, 'no other challenge speaks to emergency');
  for (let d = 20; d <= 26; d++) st = completeToday(st, 'first-fund-step', noon(d));
  assert.equal(suggestChallenge(EMPTY_PROFILE, sig({ pillars: base, weakest: 'emergency' }), st), null, 'finished');
  const old = startChallenge(EMPTY_CHALLENGES, 'first-fund-step', noon(1, 8));
  assert.equal(suggestChallenge(EMPTY_PROFILE, sig({ pillars: base, weakest: 'emergency' }), old)?.id, 'first-fund-step', 'a run nobody touched for a month is not in the way');
  assert.equal(suggestChallenge(EMPTY_PROFILE, sig(), (() => { let x = EMPTY_CHALLENGES; x = startChallenge(x, 'know-your-numbers', noon(22)); return x; })()), null);
});

test('suggestChallenge: a person under strain never gets a challenge that reads as putting in more', () => {
  const strained = (pillars: Signals['pillars'], weakest: Signals['weakest']) => suggestChallenge(EMPTY_PROFILE, sig({ strain: true, pillars, weakest }), EMPTY_CHALLENGES);
  const growth = CHALLENGES.filter(c => c.growth).map(c => c.id);
  assert.ok(growth.includes('tax-ready-week'));
  assert.equal(suggestChallenge(EMPTY_PROFILE, sig({ pillars: { investing: 10, wealth: 90 }, weakest: 'investing' }), startChallenge(EMPTY_CHALLENGES, 'know-your-numbers', noon(22)))?.id, 'tax-ready-week', 'without strain the tax one fits investing');
  assert.equal(strained({ investing: 10, wealth: 20 }, 'investing')?.id, 'know-your-numbers', 'strained: the figures first, not the tax one');
  const noKnown = suggestChallenge(EMPTY_PROFILE, sig({ strain: true, pillars: { investing: 10, wealth: 20 }, weakest: 'investing' }), startChallenge(EMPTY_CHALLENGES, 'know-your-numbers', noon(22)));
  assert.equal(noKnown, null, 'with the safe one taken, a strained person gets nothing rather than a growth challenge');
  for (const p of ['savings', 'emergency', 'insurance', 'debt', 'investing', 'wealth'] as const) {
    for (const strain of [true, false]) {
      const r = suggestChallenge(EMPTY_PROFILE, sig({ strain, pillars: { [p]: 1 }, weakest: p }), EMPTY_CHALLENGES);
      if (strain && r) assert.ok(!growth.includes(r.id), `${p}: ${r.id}`);
    }
  }
  assert.equal(strained({ debt: 10 }, 'debt')?.id, 'loan-checkup-week', 'a strained person with weak debt gets the calm look at loans');
});

test('suggestChallenge: among several that fit, one that links a reel the person pledged is preferred', () => {
  // two challenges speak to savings: leak-week (first) and subscription-sweep. Pledging a reel linked only from the second moves it first.
  const s = sig({ pillars: { savings: 20 }, weakest: 'savings' });
  assert.equal(suggestChallenge(EMPTY_PROFILE, s, EMPTY_CHALLENGES)?.id, 'leak-week');
  const onlySweep = challengeById('subscription-sweep')!.days.map(d => d.reel).find(r => r && !challengeById('leak-week')!.days.some(d => d.reel === r));
  assert.ok(onlySweep, 'sweep links a reel that leak-week does not');
  const p = addPledge(EMPTY_PROFILE, onlySweep!, NOW);
  assert.equal(suggestChallenge(p, s, EMPTY_CHALLENGES)?.id, 'subscription-sweep');
});

test('suggestChallenge: at most one, and it is pure', () => {
  const profile = addPledge(EMPTY_PROFILE, 'emergency-fund', NOW);
  const s = sig({ pillars: { emergency: 10, debt: 20, insurance: 30 }, weakest: 'emergency' });
  const a = suggestChallenge(profile, s, EMPTY_CHALLENGES), b = suggestChallenge(profile, s, EMPTY_CHALLENGES);
  assert.deepEqual(a, b); assert.ok(a && typeof a.id === 'string');
  assert.equal(EMPTY_CHALLENGES.runs.length, 0); assert.equal(profile.pledges!.length, 1);
});

test('challenges v2: the screen and docs mention what they must', () => {
  const screen = fs.readFileSync(nodePath.join(root, 'app/learn/challenges.tsx'), 'utf8');
  assert.match(screen, /pledgeToStart/); assert.match(screen, /beginMove/); assert.match(screen, /Watch first/);
  const docs = fs.readFileSync(nodePath.join(root, '..', 'docs', 'REELS.md'), 'utf8');
  assert.match(docs, /Challenges v2/); assert.match(docs, /suggestChallenge/);
});
