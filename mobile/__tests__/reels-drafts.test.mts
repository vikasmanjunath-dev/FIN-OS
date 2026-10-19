// The draft gate (wave 4): drafts pass every machine rule, stay out of the app until signed off, and join it cleanly when they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DRAFT_REELS, DRAFT_IDS, liveDrafts } from '../lib/reels/drafts.ts';
import { DRAFT_META } from '../lib/reels/drafts-meta.ts';
import { DRAFT_ACT } from '../lib/reels/drafts-act.ts';
import { INCLUDE_DRAFTS, REVIEWED, isLive } from '../lib/reels/review.ts';
import { REELS } from '../lib/reels/content.ts';
import { LEVELS } from '../lib/reels/meta.ts';
import { SERIES, DRAFT_SERIES } from '../lib/reels/series.ts';
import { validateReel } from '../lib/reels/validate.ts';
import { byId } from '../lib/calcs/index.ts';
import { emi, grownCost, lumpsumValue, money } from '../lib/reels/figures.ts';
import fs from 'node:fs';

const root = path.join(import.meta.dirname, '..');

test('drafts: 50 of them, unique, and every one passes the script rules in both languages', () => {
  assert.equal(DRAFT_REELS.length, 50); assert.equal(DRAFT_IDS.size, 50);
  assert.deepEqual(DRAFT_REELS.flatMap(validateReel), []);
  for (const r of DRAFT_REELS) assert.ok(!REELS.slice(0, REELS.length).some(x => x.id === r.id) || isLive(r.id), `${r.id} is live without a sign-off`);
});

test('drafts: held back by default, and only a sign-off (or a review build) lets one in', () => {
  assert.equal(INCLUDE_DRAFTS, process.env.EXPO_PUBLIC_REELS_DRAFTS === '1');
  if (!INCLUDE_DRAFTS) {
    assert.deepEqual(Object.keys(REVIEWED), []);                       // nobody has signed anything off yet
    assert.equal(liveDrafts().length, 0);
    for (const r of DRAFT_REELS) assert.ok(!REELS.some(x => x.id === r.id), `${r.id} leaked into the library`);
    assert.deepEqual(SERIES.filter(s => DRAFT_SERIES.some(d => d.id === s.id)), []);   // a draft series stays hidden
  }
});

test('drafts: each has a ladder entry and (unless a scam reel) a tool link that exists, and none has a stray entry', () => {
  for (const r of DRAFT_REELS) {
    const m = DRAFT_META[r.id]; assert.ok(m, `${r.id} has no ladder entry`); assert.ok(LEVELS.includes(m.level));
    for (const w of Object.values(m.needs)) assert.ok(w! > 0 && w! <= 1);
    const a = DRAFT_ACT[r.id];
    if (r.topic === 'safety') { assert.equal(a, undefined, `${r.id} is a scam reel and points at no tool`); continue; }
    assert.ok(a, `${r.id} has no tool link`);
    const calc = a.href.match(/^\/tools\/calc\/([a-z0-9]+)$/);
    if (calc) assert.ok(byId(calc[1]), `${r.id}: no calculator ${calc[1]}`);
    else { const base = path.join(root, 'app', a.href.replace(/^\//, '')); assert.ok(fs.existsSync(base + '.tsx') || fs.existsSync(path.join(base, 'index.tsx')), `${r.id}: no screen for ${a.href}`); }
  }
  for (const id of [...Object.keys(DRAFT_META), ...Object.keys(DRAFT_ACT)]) assert.ok(DRAFT_IDS.has(id), `${id} is not a draft reel`);
});

test('drafts: the figures in the captions match plain calculations', () => {
  const by = (id: string) => DRAFT_REELS.find(r => r.id === id)!;
  const say = (id: string) => by(id).scenes.map(x => x.say.en).join(' | ');
  const beat = (id: string) => JSON.stringify(by(id).poke!.beat);
  assert.ok(beat('path-loan-tenure').includes(money(Math.round(emi(4_000_000, 8.5, 15))).en) && beat('path-loan-tenure').includes(money(Math.round(emi(4_000_000, 8.5, 25) * 300)).en));
  assert.ok(beat('path-festival-bonus').includes('about ₹1,050 of interest every month'));      // 30,000 x 3.5%
  assert.ok(beat('path-health-top-up').includes('pays ₹5 lakh and he pays ₹3 lakh') && beat('path-health-top-up').includes('he pays ₹0'));
  assert.ok(beat('path-limit-increase').includes('from about 40% to about 20%'));                // 40,000 / 1,00,000 and / 2,00,000
  assert.ok(say('guess-edu-cost-15y').includes(money(Math.round(grownCost(2_000_000, 8, 15))).en));
  assert.ok(say('guess-lump-10y').includes(money(Math.round(lumpsumValue(100_000, 12, 10))).en));
  let bal = 3_000_000, firstYear = 0; const r = 0.09 / 12, e = (3_000_000 * r) / (1 - Math.pow(1 + r, -240));
  for (let m = 0; m < 12; m++) { const c = bal * r; firstYear += c; bal = bal + c - e; }
  assert.ok(say('guess-first-year-interest').includes(money(Math.round(firstYear)).en));
  assert.ok(say('guess-rate-two-points').includes(money(Math.round(emi(4_000_000, 8.5, 20))).en) && say('guess-rate-two-points').includes(money(Math.round(emi(4_000_000, 10.5, 20))).en));
  assert.match(say('new-baby-costs'), /₹8,000 more a month\. That is ₹96,000 more in a year/);
  for (const id of DRAFT_REELS.filter(x => x.topic === 'safety').map(x => x.id)) { const all = say(id); for (const n of all.match(/\b\d{4,}\b/g) ?? []) assert.equal(n, '1930', `${id} names ${n}`); }
});

test('drafts: with every draft switched on, the whole library keeps every rule, and series and links resolve', () => {
  const out = execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './__tests__/register-aliases.mjs', '__tests__/drafts-on.fixture.mts'],
    { cwd: root, env: { ...process.env, EXPO_PUBLIC_REELS_DRAFTS: '1' }, encoding: 'utf8' });
  const r = JSON.parse(out.trim().split('\n').pop()!) as { library: number; series: string[]; problems: string[] };
  assert.deepEqual(r.problems, []);
  assert.ok(r.library >= 220, `library was ${r.library}`);
  assert.ok(r.series.includes('married-money') && r.series.includes('new-parent'));
});
