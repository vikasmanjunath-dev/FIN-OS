// Writes the brief for recording the reels with a voice artist: every line, in order, with what to say, the feeling, and how long it should take,
// so the recorded clips drop in with the same timing the phone's voice is fitted to.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs scripts/voice-brief.mts en > ../docs/voice/recording-brief-en.md
import { LIBRARY } from '../lib/reels/library.ts';
import { LEAD_MS, TAIL_MS, plan, speechText, withVoiceTiming } from '../lib/reels/voice.ts';
import type { Mood } from '../lib/reels/types.ts';

const lang = (process.argv[2] === 'hi' ? 'hi' : 'en') as 'en' | 'hi';
const FEEL: Record<Mood, string> = {
  happy: 'warm, smiling, friendly', think: 'curious, a little slower, as if working it out with the listener', worry: 'concerned but calm, lower, never scary',
  surprised: 'a light lift of surprise on the key figure, then settle', cheer: 'bright, encouraging, ends on a smile',
};
console.log(`# Recording brief: reel voice (${lang === 'en' ? 'English, Indian accent' : 'Hindi'})\n`);
console.log('How to read this. One row per line the viewer hears. Record each line as its own clip, named by the Clip column. Keep to the Length window: the picture and the caption are timed to it.\n');
console.log('- **Voice**: a warm, clear narrator, like a friendly older sibling who knows money. Never a salesperson. Never urgent unless the Feeling says so.');
console.log('- **Numbers**: say them as written in the Say column (rupees, percent). Say "1930" digit by digit. Say acronyms letter by letter (E M I, S I P) unless the Say column spells a word.');
console.log('- **No advice voice**: every figure is an example or an assumption. Do not sound certain about a return.');
console.log(`- **Timing**: each clip starts about ${LEAD_MS} ms after its caption appears and ends about ${TAIL_MS} ms before the next scene. Leave no long silence at the start or end of a clip.`);
console.log('- **Delivery**: 48 kHz, mono, WAV, peaking about -3 dB; one file per clip. Do not add music.\n');
let n = 0;
for (const r of LIBRARY) {
  const timed = withVoiceTiming(r, lang);
  console.log(`## ${r.id}: ${r.title[lang]}\n`);
  console.log('| Clip | Feeling | Say | Length window |\n|---|---|---|---|');
  r.scenes.forEach((sc, i) => {
    const p = plan({ text: sc.say[lang], big: sc.big?.[lang], mood: sc.mood, lang, budgetMs: timed.scenes[i].ms });
    const say = p.chunks.map(c => c.text).join(' ');
    const natural = Math.round((p.estMs / 1000) * 10) / 10, room = Math.round(((timed.scenes[i].ms - LEAD_MS - TAIL_MS) / 1000) * 10) / 10;
    console.log(`| ${r.id}-${i + 1}-${lang} | ${FEEL[sc.mood]} | ${say.replace(/\|/g, '/')} | about ${natural} s (up to ${Math.round((room + 1) * 10) / 10} s is fine; longer is re-timed) |`);
    n++;
  });
  console.log('');
}
console.error(`${n} clips for ${LIBRARY.length} reels (${lang})`);
