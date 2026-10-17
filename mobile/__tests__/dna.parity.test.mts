// The phone's Financial DNA questions and scoring must equal the website's js/finos-dna-steps.js, and the Health Score must use them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../lib/dna.ts';
import { computeHealth, EMPTY_TRACKER_DATA } from '../lib/trackers.ts';

const require = createRequire(import.meta.url);
const web = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../js/finos-dna-steps.js'));

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(20261013);

test('the questions, options and weights are identical to the website', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(app.STEPS)), JSON.parse(JSON.stringify(web.STEPS)));
  assert.deepEqual(app.START, web.START);
});

test('scores equal the website on 1,000 random answer sets (including partial and junk answers)', () => {
  for (let n = 0; n < 1000; n++) {
    const resp: Record<string, string> = {};
    web.STEPS.forEach((st: any) => {
      const r = R();
      if (r < 0.15) return;
      resp[st.lvl] = r < 0.2 ? 'not an option' : st.options[Math.floor(R() * st.options.length)].text;
    });
    assert.deepEqual(app.scoresFor(resp), web.scoresFor(resp));
  }
});

test('saved objects from the website are read; junk is rejected; scores are recomputed from answers', () => {
  assert.equal(app.normalise(null), null);
  assert.equal(app.normalise({}), null);
  const resp = { LEVEL_00: '25-35 (Early Career)' };
  const n = app.normalise({ responses: resp, scores: [1, 2, 3, 4, 5] })!;
  assert.deepEqual(n.scores, web.scoresFor(resp));              // not the stale stored numbers
  const only = app.normalise({ scores: [10, 20, 30, 40, 150] })!;
  assert.deepEqual(only.scores, [10, 20, 30, 40, 100]);        // clamped
  assert.equal(app.normalise({ scores: [1, 2] }), null);
});

test('quiz progress: next unanswered question and completion', () => {
  assert.equal(app.nextIndex({}), 0);
  assert.equal(app.nextIndex({ LEVEL_00: 'x', LEVEL_01: 'y' }), 2);
  const all = Object.fromEntries(web.STEPS.map((s: any) => [s.lvl, s.options[0].text]));
  assert.equal(app.nextIndex(all), -1);
  assert.ok(app.isComplete(all));
});

test('Health Score behaviour points follow the Discipline score, and, without the quiz, are not recorded (the neutral 8 of the website is not used)', () => {
  const without = computeHealth({ ...EMPTY_TRACKER_DATA, dna: null });
  const neutral = without.pillars.find(p => p.name === 'Behaviour')!;
  assert.equal(neutral.score, 0);
  assert.equal(neutral.hasData, false);
  assert.equal(neutral.untracked, true);
  for (const disc of [0, 20, 50, 73, 100]) {
    const h = computeHealth({ ...EMPTY_TRACKER_DATA, dna: [50, 50, 50, disc, 50] });
    const p = h.pillars.find(x => x.name === 'Behaviour')!;
    assert.equal(p.score, Math.round(disc * 0.15));          // the website: round(discipline * 0.15)
    assert.equal(p.untracked, false);
    assert.equal(p.hasData, true);
  }
  assert.equal(app.behaviourPoints(100), 15);
  assert.equal(app.behaviourPoints(-5), 0);
});
