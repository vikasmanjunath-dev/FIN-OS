// Home greeting and status strip: only recorded facts, never a stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '@/lib/persona';
import { isSyncKey } from '@/lib/trackerSync';
import { isBackupKey } from '@/lib/backup';
import { DEVICE_ONLY_KEYS } from '@/lib/storageKeys';

test('day part uses the website cut-offs (night before 5 and from 21)', () => {
  const cases: [number, P.DayPart][] = [[0, 'night'], [4, 'night'], [5, 'morning'], [11, 'morning'], [12, 'afternoon'], [16, 'afternoon'], [17, 'evening'], [20, 'evening'], [21, 'night'], [23, 'night']];
  for (const [h, want] of cases) assert.equal(P.dayPart(h), want, `hour ${h}`);
  assert.equal(P.GREETING.morning, 'Good morning');
  assert.equal(P.dayPart(NaN), 'morning');
});

test('the name is the first word that was recorded, and nothing is invented when none was', () => {
  assert.equal(P.firstName('Asha Rao'), 'Asha');
  assert.equal(P.firstName('  Vikas  '), 'Vikas');
  for (const bad of ['', '   ', null, undefined, 42, {}, [], '👋', '--']) assert.equal(P.firstName(bad), null, JSON.stringify(bad));
  assert.equal(P.firstName('x'.repeat(100))!.length, 24);
});

test('streak line appears only from a two-day streak', () => {
  assert.equal(P.streakLine(1), null);
  assert.equal(P.streakLine(0), null);
  assert.equal(P.streakLine(NaN), null);
  assert.equal(P.streakLine('x'), null);
  assert.equal(P.streakLine(2), '🔥 2-day streak');
  assert.equal(P.streakLine(31.9), '🔥 31-day streak');
});

test('the strip leaves out every unknown fact, shows 0 only when 0 is recorded', () => {
  assert.deepEqual(P.buildStrip({ savingsRate: null, netWorth: null, moneyScore: null }), []);
  const all = P.buildStrip({ savingsRate: 0, netWorth: 0, moneyScore: { score: 0 } });
  assert.deepEqual(all.map(i => i.value), ['0%', '₹0', '0/100']);
  assert.deepEqual(P.buildStrip({ savingsRate: NaN, netWorth: Infinity, moneyScore: { score: NaN } }), []);
  const one = P.buildStrip({ savingsRate: 24.6, netWorth: null, moneyScore: null });
  assert.equal(one.length, 1);
  assert.equal(one[0].value, '25%');
  assert.equal(one[0].tone, 'good');
});

test('strip chips open the screen the figure comes from, with a label that says what they are', () => {
  const s = P.buildStrip({ savingsRate: 10, netWorth: -250000, moneyScore: { score: 72.4, at: '2026-10-12T08:00:00.000Z' } }, new Date('2026-10-15T00:00:00Z'));
  assert.deepEqual(s.map(i => i.route), ['/tracker/budget', '/tracker/networth', '/tools/score']);
  assert.equal(s[0].tone, 'warn');
  assert.equal(s[1].value, '−₹2.5 L');
  assert.equal(s[1].tone, 'warn');
  assert.equal(s[2].value, '72/100');
  assert.match(s[2].a11y, /worked out on 12 Oct/);
  assert.ok(s.every(i => /^[A-Z]/.test(i.a11y) && i.a11y.length > 20));
  // a score "from the future" (a wrong clock) carries no date claim
  const f = P.buildStrip({ savingsRate: null, netWorth: null, moneyScore: { score: 50, at: '2030-01-01T00:00:00Z' } }, new Date('2026-10-15T00:00:00Z'));
  assert.doesNotMatch(f[0].a11y, /worked out on/);
});

// Changed with the calm Home redesign: the strip is off by default (it repeated the hero card) and only an explicit choice in Settings shows it.
test('preferences: only an explicit false shows the strip; wrong shapes read as the default (hidden)', () => {
  assert.deepEqual(P.normalisePrefs({ stripHidden: false }), { stripHidden: false });
  assert.deepEqual(P.normalisePrefs({ stripHidden: true }), { stripHidden: true });
  for (const bad of [null, undefined, 'false', 0, [], {}, { stripHidden: 'no' }, { stripHidden: 0 }]) assert.deepEqual(P.normalisePrefs(bad), { stripHidden: true }, JSON.stringify(bad));
});

test('the preference key stays on the phone: not synced, not backed up, listed as device-only', () => {
  assert.equal(isSyncKey(P.PERSONA_KEY), false);
  assert.equal(isBackupKey(P.PERSONA_KEY), false);
  assert.ok((DEVICE_ONLY_KEYS as readonly string[]).includes(P.PERSONA_KEY));
});

test('Home never falls back to a stand-in name, an assumed age or a made-up fact', () => {
  const src = readFileSync(new URL('../app/(tabs)/dashboard.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Friend|Investor/, 'a stand-in name is shown');
  assert.match(src, /firstName\(td\.name\)/);
  assert.match(src, /buildStrip\(/);
  const lib = readFileSync(new URL('../lib/persona.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(lib.replace(/\/\/.*$/gm, ''), /'Investor'|'Friend'|\|\| *[1-9]/);
});
