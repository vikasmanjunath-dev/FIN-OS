// The voice of the reels: speakable text, phrases and pauses, mood, fitting into the scene, choosing a voice, caption and clock sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../lib/reels/library.ts';
import { DRAFT_REELS } from '../lib/reels/drafts.ts';
import { LEAD_MS, MAX_HOLD_MS, MOOD_VOICE, TAIL_MS, captionMotion, chunks, holdAtSceneEnd, pickVoice, plan, speechText, withVoiceTiming, wordAt } from '../lib/reels/voice.ts';
import { learnSpeed, speedFor } from '../lib/reels/speech.ts';
import { DEFAULT_VOICE_PREFS, PAUSE_SCALE, SPEEDS, VOICE_PREFS_KEY, parseVoicePrefs } from '../lib/reels/voicePrefs.ts';
import { rankVoices } from '../lib/reels/voice.ts';
import * as privacy from '../lib/privacy.ts';

test('speechText: rupees, percent, Indian grouping, ranges and symbols are made speakable (English)', () => {
  assert.equal(speechText('Put in ₹5,000 a month.', 'en'), 'Put in 5000 rupees a month.');
  assert.equal(speechText('You end near ₹3.49 crore.', 'en'), 'You end near 3.49 crore rupees.');
  assert.equal(speechText('A loan of ₹1,20,000 at 8.5%.', 'en'), 'A loan of 120000 rupees at 8.5 percent.');
  assert.equal(speechText('A common guide is 3 to 6 months, or 3-6 months.', 'en'), 'A common guide is 3 to 6 months, or 3 to 6 months.');
  assert.equal(speechText('72 ÷ 8 = about 9 years', 'en'), '72 divided by 8 equals about 9 years');
  assert.equal(speechText('A 50/30/20 split.', 'en'), 'A 50 30 20 split.');
  assert.equal(speechText('Report on 1930 now.', 'en'), 'Report on 1 9 3 0 now.');
  assert.equal(speechText('For FY 2025-26 only.', 'en'), 'For F Y 2025 to 26 only.');
  assert.equal(speechText('60+ years', 'en'), '60 plus years');
  assert.equal(speechText('✨ Your own numbers 🦉', 'en'), 'Your own numbers');
});

test('speechText: acronyms are spelled out, words stay words, and Hindi gets Devanagari letter names', () => {
  assert.equal(speechText('Your EMI and SIP.', 'en'), 'Your E M I and S I P.');
  assert.equal(speechText('Check SEBI and the NAV.', 'en'), 'Check Sebi and the nav.');
  assert.equal(speechText('Aarav pays the Rent.', 'en'), 'Aarav pays the Rent.');
  assert.equal(speechText('आपकी EMI और SIP', 'hi'), 'आपकी ई एम आई और एस आई पी');
  assert.equal(speechText('₹5 लाख की SIP, 12% पर', 'hi'), '5 लाख रुपये की एस आई पी, 12 प्रतिशत पर');
  assert.equal(speechText('हेल्पलाइन 1930', 'hi'), 'हेल्पलाइन 1 9 3 0');
});

test('chunks: cut at sentence ends with pauses that fit the punctuation; questions rise, payoffs slow down', () => {
  const c = chunks('You owe it. Does it grow? Yes, about 5000 rupees more!');
  assert.deepEqual(c.map(x => x.text), ['You owe it.', 'Does it grow?', 'Yes, about 5000 rupees more!']);
  assert.deepEqual(c.map(x => x.pauseAfterMs), [340, 400, 0]);                      // no pause after the last
  assert.ok(c[1].pitchAdj > 0 && c[2].rateAdj !== 0);
  assert.equal(chunks('One sentence only').length, 1);
  assert.equal(chunks('First: one. Second.').length, 3);
});

test('mood changes the voice: worried is slower and lower, cheering is quicker and higher', () => {
  assert.ok(MOOD_VOICE.worry.rate < MOOD_VOICE.happy.rate && MOOD_VOICE.worry.pitch < MOOD_VOICE.happy.pitch);
  assert.ok(MOOD_VOICE.cheer.rate > MOOD_VOICE.think.rate && MOOD_VOICE.surprised.pitch > MOOD_VOICE.happy.pitch);
  const w = plan({ text: 'Prices rise every year.', mood: 'worry', lang: 'en', budgetMs: 4500 }), c = plan({ text: 'Prices rise every year.', mood: 'cheer', lang: 'en', budgetMs: 4500 });
  assert.ok(w.chunks[0].pitch < c.chunks[0].pitch);
});

test('plan: a caption fits its scene with a breath at each end, the pace is only nudged, and a scene that cannot fit says by how much', () => {
  const ok = plan({ text: 'At an assumed 12% a year, Asha ends near ₹1.75 crore. Ravi, near ₹49 lakh.', mood: 'surprised', lang: 'en', budgetMs: 6800 });
  assert.ok(ok.leadMs === LEAD_MS && ok.fitted && ok.overrunMs === 0, JSON.stringify({ est: ok.estMs, over: ok.overrunMs }));
  assert.ok(LEAD_MS + ok.estMs + TAIL_MS <= 6800 + 1);
  const short = plan({ text: 'At an assumed 12% a year, Asha ends near ₹1.75 crore. Ravi, near ₹49 lakh.', mood: 'surprised', lang: 'en', budgetMs: 5600 });
  assert.ok(short.overrunMs > 0 && short.overrunMs < 1200);                        // written for silent reading, so with a voice this scene is a little short
  for (const c of ok.chunks) assert.ok(c.rate >= 0.6 && c.rate <= 1.6, `rate ${c.rate}`);
  const slow = plan({ text: 'x '.repeat(40).trim(), mood: 'happy', lang: 'en', budgetMs: 9000 });
  assert.ok(slow.chunks[0].rate <= 0.98 * 1.12 * 1.0 + 0.001, 'the pace never goes above 1.12x of the mood');
  const tight = plan({ text: 'A very long caption that goes on and on and on, about prices, rates, loans, fees and many other things that need saying.', mood: 'happy', lang: 'en', budgetMs: 3000 });
  assert.ok(!tight.fitted && tight.overrunMs > 0);
  const roomy = plan({ text: 'Short one.', mood: 'happy', lang: 'en', budgetMs: 6000 });
  assert.ok(roomy.chunks[0].rate >= 0.8 * 0.98 * 1.0 - 0.01);                       // a short line in a long scene is not stretched slow
  const big = plan({ text: 'Two ways to work out your income tax.', big: 'Two regimes', mood: 'think', lang: 'en', budgetMs: 5600 });
  assert.equal(big.chunks[0].text, 'Two regimes.');                                 // a few big words are said first, as a hook
});

test('every reel in the library: speech is clean, and with the voice on every scene is long enough for it, in both languages', () => {
  let scenes = 0, grew = 0, worstReel = 0, worstGrowth = 0;
  for (const r of [...LIBRARY, ...DRAFT_REELS]) for (const lang of ['en', 'hi'] as const) {
    const timed = withVoiceTiming(r, lang);
    let total = 0;
    timed.scenes.forEach((sc, i) => {
      const p = plan({ text: sc.say[lang], big: sc.big?.[lang], mood: sc.mood, lang, budgetMs: sc.ms });
      assert.equal(p.overrunMs, 0, `${r.id} scene ${i + 1} (${lang}) still overruns by ${p.overrunMs} ms`);
      assert.ok(sc.ms >= r.scenes[i].ms && sc.ms % 100 === 0);
      const spoken = p.chunks.map(c => c.text).join(' ');
      assert.ok(!/[₹%÷×→&✓✨🦉]/u.test(spoken), `${r.id}: "${spoken}"`);
      assert.ok(!/\{\w+\}|undefined|NaN/.test(spoken), `${r.id}: "${spoken}"`);
      if (lang === 'hi') assert.ok(!/\b[A-Z]{2,}\b/.test(spoken.replace(/\b(OK|AM|PM)\b/g, '')), `${r.id}: a Latin acronym is left in the Hindi voice: "${spoken}"`);
      for (const c of p.chunks) { assert.ok(c.rate > 0.5 && c.rate < 2 && c.pitch > 0.7 && c.pitch < 1.5); assert.ok(c.text.length > 0); }
      scenes++; if (sc.ms > r.scenes[i].ms) grew++; total += sc.ms; assert.ok(sc.ms <= r.scenes[i].ms + 7000, `${r.id} scene ${i + 1} grows by ${sc.ms - r.scenes[i].ms} ms`);
    });
    worstReel = Math.max(worstReel, total); worstGrowth = Math.max(worstGrowth, total - r.scenes.reduce((n, s) => n + s.ms, 0));
  }
  assert.ok(scenes > 2000);
  assert.ok(worstReel <= 75_000, `the longest reel with the voice on is ${worstReel} ms`);
});

test('pickVoice: the right country first, then enhanced quality, never a compact voice over a better one', () => {
  const v = (identifier: string, language: string, name = identifier, quality = 'Default') => ({ identifier, language, name, quality });
  const voices = [v('a', 'en-US', 'Alex'), v('b', 'en-IN', 'Rishi compact', 'Default'), v('c', 'en-IN', 'Rishi', 'Enhanced'), v('d', 'hi-IN', 'Lekha'), v('e', 'hi_IN', 'Lekha Premium', 'Enhanced'), v('f', 'fr-FR', 'Thomas')];
  assert.equal(pickVoice(voices, 'en')!.identifier, 'c');
  assert.equal(pickVoice(voices, 'hi')!.identifier, 'e');
  assert.equal(pickVoice([v('a', 'en-US'), v('b', 'en-GB')], 'en')!.identifier, 'b');         // British before American when there is no Indian voice
  assert.equal(pickVoice([v('f', 'fr-FR')], 'en'), null);
  assert.equal(pickVoice([], 'hi'), null);
});

test('wordAt: the lit word follows the voice through the caption, weighted by word length', () => {
  const words = 'Prices keep rising every single year'.split(' ');
  assert.equal(wordAt(words, 0), 0); assert.equal(wordAt(words, 1), words.length - 1);
  const seq = [0, 0.2, 0.4, 0.6, 0.8, 0.99].map(p => wordAt(words, p));
  assert.deepEqual([...seq].sort((a, b) => a - b), seq);                                       // never goes backwards
  assert.equal(wordAt([], 0.5), -1); assert.equal(wordAt(words, -3), 0); assert.equal(wordAt(words, 9), words.length - 1);
});

test('captionMotion: rises and fades in at the start of a scene, holds, and fades out at the end', () => {
  const a = captionMotion(0, 4000), b = captionMotion(170, 4000), c = captionMotion(340, 4000), d = captionMotion(2000, 4000), e = captionMotion(3900, 4000), f = captionMotion(4000, 4000);
  assert.ok(a.opacity === 0 && a.translateY === 14);
  assert.ok(b.opacity > 0 && b.opacity < 1 && b.translateY > 0 && b.translateY < 14);
  assert.ok(c.opacity === 1 && c.translateY === 0 && d.opacity === 1);
  assert.ok(e.opacity < 1 && e.opacity > 0 && f.opacity === 0);
});

test('holdAtSceneEnd: the clock waits at the end of a scene until the voice is done, but never longer than the cap', () => {
  assert.deepEqual(holdAtSceneEnd(1000, 40, 4000, true, 0), { t: 1040, heldMs: 0 });             // mid-scene: nothing special
  const h = holdAtSceneEnd(3980, 40, 4000, true, 0); assert.equal(h.t, 3999); assert.equal(h.heldMs, 40);   // at the end, voice busy: hold
  assert.deepEqual(holdAtSceneEnd(3980, 40, 4000, false, 0), { t: 4020, heldMs: 0 });             // voice finished: carry on
  assert.equal(holdAtSceneEnd(3999, 40, 4000, true, MAX_HOLD_MS).t, 4039);                      // the cap is reached: carry on regardless
  let t = 3960, held = 0, steps = 0; while (steps++ < 400) { const r = holdAtSceneEnd(t, 40, 4000, true, held); t = r.t; if (t >= 4000) break; held = r.heldMs; }
  assert.ok(steps < 200 && held <= MAX_HOLD_MS + 40);                                            // a voice that never says it is done holds the clock for the cap, then the reel goes on
});

test('learnSpeed: measured speech speed is folded in, and a stalled or silly reading is ignored', () => {
  const before = speedFor('en');
  learnSpeed('en', 100, 5000, 1);                                                               // 20 characters a second at rate 1
  assert.ok(speedFor('en') > before);
  const mid = speedFor('en');
  learnSpeed('en', 100, 90_000, 1); learnSpeed('en', 5, 2000, 1); learnSpeed('en', 100, 5000, 0);
  assert.equal(speedFor('en'), mid);
});

test('voice settings: speed changes the time a scene needs, style changes how much the mood moves the voice, breaths change the pauses', () => {
  const base = { text: 'At an assumed 12% a year, Asha ends near ₹1.75 crore. Ravi, near ₹49 lakh.', mood: 'surprised' as const, lang: 'en' as const, budgetMs: 8000 };
  const normal = plan(base), slow = plan({ ...base, speed: 0.85 }), fast = plan({ ...base, speed: 1.15 });
  assert.ok(slow.estMs > normal.estMs && fast.estMs < normal.estMs, `${slow.estMs} ${normal.estMs} ${fast.estMs}`);
  assert.ok(slow.overrunMs >= normal.overrunMs);                                           // slower speech needs at least as much time
  const steady = plan({ ...base, style: 'steady' }), expressive = plan({ ...base, style: 'expressive' });
  assert.ok(Math.abs(steady.chunks[0].pitch - 1) < Math.abs(expressive.chunks[0].pitch - 1), 'steady moves the pitch less');
  const short = plan({ ...base, pauseScale: PAUSE_SCALE.short }), long = plan({ ...base, pauseScale: PAUSE_SCALE.long });
  assert.ok(short.chunks[0].pauseAfterMs < normal.chunks[0].pauseAfterMs && normal.chunks[0].pauseAfterMs < long.chunks[0].pauseAfterMs);
  const slowReel = withVoiceTiming({ scenes: [{ ms: 3000, say: { en: base.text, hi: 'x' }, mood: 'happy' as const }] }, 'en', 14.5);
  assert.ok(slowReel.scenes[0].ms >= 3000);
});

test('voice settings: a saved choice is parsed safely, kept in range, and never trusted for a voice id with odd characters', () => {
  assert.deepEqual(parseVoicePrefs(null), DEFAULT_VOICE_PREFS);
  assert.deepEqual(parseVoicePrefs('{broken'), DEFAULT_VOICE_PREFS);
  const ok = parseVoicePrefs(JSON.stringify({ speed: 1.15, style: 'steady', pauses: 'long', voice: { en: 'com.apple.voice.enhanced.en-IN.Rishi', hi: 'hi-in-x-hia-local' } }));
  assert.deepEqual(ok, { speed: 1.15, style: 'steady', pauses: 'long', voice: { en: 'com.apple.voice.enhanced.en-IN.Rishi', hi: 'hi-in-x-hia-local' } });
  assert.equal(parseVoicePrefs(JSON.stringify({ speed: 9 })).speed, 1.3); assert.equal(parseVoicePrefs(JSON.stringify({ speed: -1 })).speed, 0.7); assert.equal(parseVoicePrefs(JSON.stringify({ speed: 'fast' })).speed, 1);
  assert.deepEqual(parseVoicePrefs(JSON.stringify({ style: 'shouting', pauses: 'forever', voice: { en: '<script>', hi: 5 } })), DEFAULT_VOICE_PREFS);
  assert.deepEqual(SPEEDS.map(s => s.value), [0.85, 1, 1.15]);
  assert.ok(VOICE_PREFS_KEY.startsWith('finos_session_'));                                         // such keys are never synced
  assert.ok(privacy.DATA_ITEMS.some(d => d.key === VOICE_PREFS_KEY), 'the voice settings key is listed in the privacy registry');
});

test('rankVoices: best first, with the enhanced flag, and only voices of the language', () => {
  const v = (identifier: string, language: string, name = identifier, quality = 'Default') => ({ identifier, language, name, quality });
  const r = rankVoices([v('a', 'en-IN', 'Rishi'), v('b', 'en-IN', 'Rishi Enhanced', 'Enhanced'), v('c', 'hi-IN', 'Lekha'), v('d', 'en-GB', 'Daniel')], 'en');
  assert.deepEqual(r.map(x => x.identifier), ['b', 'a', 'd']);
  assert.deepEqual(r.map(x => x.enhanced), [true, false, false]);
});
