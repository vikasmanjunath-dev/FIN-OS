// Voice and text kept together: the voice is the clock (a scene waits for its sentence, and follows it after a breath), a scene is one utterance, and the
// best installed voice is chosen. Pure functions with known answers; the speech module is checked by reading its source (it needs a phone to run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodePath from 'node:path';
import { BREATH_MS, MAX_HOLD_MS, advanceEarly, holdAtSceneEnd, plan, rankVoices, utterance } from '../lib/reels/voice.ts';

const read = (p: string) => fs.readFileSync(nodePath.join(process.cwd(), p), 'utf8');

test('a scene waits for its sentence: the clock is held at the scene end while the voice speaks, for as long as a real sentence needs', () => {
  assert.ok(MAX_HOLD_MS >= 6000);
  let t = 4990, held = 0;
  for (let i = 0; i < 100; i++) { const r = holdAtSceneEnd(t, 40, 5000, true, held); t = r.t; held = r.heldMs; }
  assert.ok(t < 5000, 'still inside the scene after 4 s of a voice still speaking');
  const free = holdAtSceneEnd(t, 40, 5000, false, held);
  assert.ok(free.t >= 5000 || free.t + 40 >= 5000, 'the scene moves on the moment the voice is done');
  let h = 0, tt = 4990, ticks = 0;
  while (ticks++ < 1000) { const r = holdAtSceneEnd(tt, 40, 5000, true, h); tt = r.t; if (tt >= 5000) break; h = r.heldMs; }
  assert.ok(tt >= 5000 && ticks <= MAX_HOLD_MS / 40 + 3, 'a voice that never reports back cannot hold the reel for ever');
});

test('when the voice finishes first, the next scene follows after a breath, never before the text has had its reading time', () => {
  const base = { now: 10_000, doneAt: 9_500, t: 3000, readEnd: 4000, sceneEnd: 6000, voiceBusy: false };
  assert.equal(advanceEarly(base), false, 'the text has not had its reading time yet');
  assert.equal(advanceEarly({ ...base, t: 4000 }), true);
  assert.equal(advanceEarly({ ...base, t: 4000, now: 9_500 + BREATH_MS - 1 }), false, 'a breath first');
  assert.equal(advanceEarly({ ...base, t: 4000, now: 9_500 + BREATH_MS }), true);
  assert.equal(advanceEarly({ ...base, t: 4000, doneAt: 0 }), false, 'a voice that has not finished by itself never skips ahead');
  assert.equal(advanceEarly({ ...base, t: 4000, voiceBusy: true }), false);
  assert.equal(advanceEarly({ ...base, t: 6000 }), false, 'already at the end');
});

test('a scene is spoken as one utterance: phrases joined, one pace and pitch weighted by length', () => {
  const p = plan({ text: 'You put in ₹18 lakh. It grows to about ₹1.75 crore. That is growth.', big: 'Look', mood: 'happy', lang: 'en', budgetMs: 8000 });
  const u = utterance(p);
  assert.equal(u.text, p.chunks.map(c => c.text).join(' '));
  assert.ok(u.text.includes('rupees') && !u.text.includes('₹'));
  const lo = Math.min(...p.chunks.map(c => c.rate)), hi = Math.max(...p.chunks.map(c => c.rate));
  assert.ok(u.rate >= lo && u.rate <= hi);
  const one = utterance({ chunks: [{ text: 'abcd', rate: 1, pitch: 1 }, { text: 'ab', rate: 0.7, pitch: 1.3 }] });
  assert.equal(one.rate, 0.9);                                              // (1 x 4 + 0.7 x 2) / 6
  assert.equal(one.pitch, 1.1);
});

test('the best installed voice wins: neural and network voices beat local ones, in both languages and in the browser', () => {
  const android = [
    { identifier: 'en-in-x-ene-local', name: 'en-in-x-ene-local', language: 'en-IN' },
    { identifier: 'en-in-x-ene-network', name: 'en-in-x-ene-network', language: 'en-IN' },
    { identifier: 'en-us-x-iom-local', name: 'en-us-x-iom-local', language: 'en-US' },
  ];
  assert.equal(rankVoices(android, 'en')[0].identifier, 'en-in-x-ene-network');
  const hindi = [
    { identifier: 'hi-in-x-hia-local', name: 'hi-in-x-hia-local', language: 'hi-IN' },
    { identifier: 'hi-in-x-hia-network', name: 'hi-in-x-hia-network', language: 'hi-IN' },
    { identifier: 'en-in-x-ene-network', name: 'en', language: 'en-IN' },
  ];
  assert.equal(rankVoices(hindi, 'hi')[0].identifier, 'hi-in-x-hia-network');
  assert.equal(rankVoices(hindi, 'hi').length, 2, 'an English voice is never offered for Hindi');
  const web = [
    { identifier: 'a', name: 'Microsoft Heera - English (India)', language: 'en-IN' },
    { identifier: 'b', name: 'Microsoft Neerja Online (Natural) - English (India)', language: 'en-IN' },
    { identifier: 'c', name: 'Google हिन्दी', language: 'hi-IN' },
  ];
  assert.equal(rankVoices(web, 'en')[0].identifier, 'b');
  assert.equal(rankVoices(web, 'hi')[0].identifier, 'c');
  const ios = [{ identifier: 'com.apple.voice.compact.en-IN.Rishi', name: 'Rishi', language: 'en-IN', quality: 'Default' }, { identifier: 'com.apple.voice.enhanced.en-IN.Rishi', name: 'Rishi', language: 'en-IN', quality: 'Enhanced' }];
  assert.equal(rankVoices(ios, 'en')[0].identifier, 'com.apple.voice.enhanced.en-IN.Rishi');
});

test('the speech module speaks a scene in one call, falls back to the next voice, and never lets a silent voice hold the reel', () => {
  const s = read('lib/reels/speech.ts');
  assert.equal((s.match(/s\.speak\(/g) ?? []).length, 1, 'one call to the phone voice per scene');
  assert.match(s, /utterance\(p\)/);
  assert.match(s, /attempt < 2/);                                           // next best voice, then the phone default
  assert.match(s, /p\.leadMs \+ 3500/);                                    // a voice that never starts
  assert.match(s, /p\.estMs \* 2 \+ 4000/);                                // a voice that never says it is done
  assert.match(s, /if \(!s\) \{/);                                          // no voice module at all: nothing to wait for
  const player = read('components/reels/ReelPlayer.tsx');
  assert.match(player, /advanceEarly\(/); assert.match(player, /holdAtSceneEnd\(/);
});
