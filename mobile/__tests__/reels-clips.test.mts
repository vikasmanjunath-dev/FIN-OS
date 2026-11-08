// Recorded voice: the clip is the clock. Progress, scene length and the manifest are pure and checked with known answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodePath from 'node:path';
import { LEAD_CLIP_MS, TAIL_CLIP_MS, clipDurations, clipInfo, clipKey, clipProgress, sceneMsForClip } from '../lib/reels/clips.ts';
import { VOICE_MANIFEST } from '../lib/reels/voiceManifest.ts';
import { withVoiceTiming } from '../lib/reels/voice.ts';
import { LIBRARY } from '../lib/reels/library.ts';

const clip = { ms: 5000, cues: [[20, 0, 1600], [60, 1900, 4800]] as [number, number, number][] };

test('clipProgress: exact at phrase ends, linear inside a phrase, waits in the breath, 1 at the end', () => {
  assert.equal(clipProgress(clip, 0), 0);
  assert.equal(clipProgress(clip, 800), 0.5 * (20 / 60));                    // half way through the first phrase (20 of 60 characters)
  assert.equal(clipProgress(clip, 1600), 20 / 60);
  assert.equal(clipProgress(clip, 1750), 20 / 60);                           // the breath between phrases: the lit word does not move
  assert.equal(clipProgress(clip, 1900), 20 / 60);
  assert.ok(Math.abs(clipProgress(clip, 3350) - (20 + 20) / 60) < 1e-9);     // half way through the second phrase
  assert.equal(clipProgress(clip, 4800), 1);
  assert.equal(clipProgress(clip, 9999), 1);
  assert.equal(clipProgress({ ms: 0, cues: [] }, 500), 0);
  let last = 0; for (let t = 0; t <= 5000; t += 50) { const p = clipProgress(clip, t); assert.ok(p >= last && p <= 1); last = p; }   // never goes backwards
});

test('a scene is built around its clip: lead, recording, breath, never shorter than written', () => {
  assert.equal(sceneMsForClip(5000, 4000), Math.ceil((LEAD_CLIP_MS + 5000 + TAIL_CLIP_MS) / 100) * 100);
  assert.equal(sceneMsForClip(1000, 6000), 6000);
  const reel = { scenes: [{ ms: 3000, say: { en: 'Hello there.', hi: 'नमस्ते।' }, mood: 'happy' as const }, { ms: 3000, say: { en: 'Second.', hi: 'दूसरा।' }, mood: 'happy' as const }] };
  const t = withVoiceTiming(reel, 'en', undefined, [7000, null]);
  assert.equal(t.scenes[0].ms, sceneMsForClip(7000, 3000));
  assert.ok(t.scenes[1].ms >= 3000);                                          // the scene with no clip is estimated for the phone's voice
});

test('the manifest is sound: every clip has phrases that fit inside it, in order, and every asset file exists', () => {
  const keys = Object.keys(VOICE_MANIFEST);
  for (const k of keys) {
    const c = VOICE_MANIFEST[k];
    assert.ok(c.ms > 500 && c.ms < 30_000, k);
    let prevChars = 0, prevEnd = -1;
    for (const [chars, t0, t1] of c.cues) { assert.ok(chars > prevChars && t0 >= prevEnd && t1 > t0 && t1 <= c.ms, `${k} cue order`); prevChars = chars; prevEnd = t1; }
    const m = /^([a-z0-9-]+)\.(en|hi)\.(\d+)$/.exec(k)!;
    assert.ok(m, k);
    const reel = LIBRARY.find(r => r.id === m[1]);
    assert.ok(reel && Number(m[3]) < reel.scenes.length, `${k}: a scene that exists`);
    assert.ok(fs.existsSync(nodePath.join(process.cwd(), 'assets', 'voice', `${k}.m4a`)), `${k}.m4a exists`);
  }
  assert.equal(clipKey('a', 'hi', 2), 'a.hi.2');
  assert.equal(clipInfo('no-such-reel', 'en', 0), null);
  assert.deepEqual(clipDurations('no-such-reel', 'en', 2), [null, null]);
  const assets = fs.readFileSync(nodePath.join(process.cwd(), 'lib', 'reels', 'voiceAssets.ts'), 'utf8');
  for (const k of keys) assert.ok(assets.includes(`'${k}': require(`), `${k} is bundled`);
});

test('the player plays a clip when there is one and falls back to the phone voice otherwise', () => {
  const hook = fs.readFileSync(nodePath.join(process.cwd(), 'hooks', 'useVoice.ts'), 'utf8');
  assert.match(hook, /hasClip\(o\.clip\.reelId/); assert.match(hook, /playClip\(/); assert.match(hook, /speakScene\(/);
  const player = fs.readFileSync(nodePath.join(process.cwd(), 'components', 'reels', 'ReelPlayer.tsx'), 'utf8');
  assert.match(player, /clipDurations\(reel\.id/); assert.match(player, /clip: \{ reelId: reel\.id, scene: idx \}/);
});
