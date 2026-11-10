// Records the reels' voice: one short clip per scene per language, with exact lengths and phrase timings, so the voice and the text change scene
// together by construction (see lib/reels/clips.ts). Uses the Mac's own voices (`say`), ffmpeg and nothing online; the engine is one function
// (`speakToWav`), so a studio voice service can replace it without touching the rest.
//   npm run reels:voiceover -- guess-sip delay-cost          (some reels)
//   npm run reels:voiceover -- --all                         (every live reel: about 2,000 clips, 40 MB; takes several minutes)
//   options: --lang en|hi   --voice-en Tara   --voice-hi Lekha   --wpm-en 170   --wpm-hi 150
//   engines: --engine say (default, the Mac's voices, offline) | piper (free neural voices, offline) | google | elevenlabs
//     piper:      pip install piper-tts, put <voice>.onnx and <voice>.onnx.json in ~/.cache/finos-piper/, then --engine piper --voice-en en_GB-alba-medium --voice-hi hi_IN-priyamvada-medium
//     google:     GOOGLE_TTS_API_KEY=... --engine google --voice-en en-IN-Chirp3-HD-Aoede --voice-hi hi-IN-Chirp3-HD-Aoede   (Cloud Text-to-Speech, REST)
//     elevenlabs: ELEVENLABS_API_KEY=... --engine elevenlabs --voice-en <voice id> --voice-hi <voice id>                    (eleven_multilingual_v2)
//     --dry prints how many characters would be sent (about 142,000 for the whole library) and writes nothing. Keys are read from the environment only.
// Writes assets/voice/*.m4a, assets/voice/manifest.json (the source of truth) and the two generated files lib/reels/voiceManifest.ts and voiceAssets.ts.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LIBRARY } from '../lib/reels/library.ts';
import { plan } from '../lib/reels/voice.ts';

const argv = process.argv.slice(2);
const opt = (name: string, d: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : d; };
const ENGINE = opt('engine', 'say');
const DEFAULT_VOICES: Record<string, { en: string; hi: string }> = { say: { en: 'Tara', hi: 'Lekha' }, piper: { en: 'en_GB-alba-medium', hi: 'hi_IN-priyamvada-medium' }, google: { en: 'en-IN-Chirp3-HD-Aoede', hi: 'hi-IN-Chirp3-HD-Aoede' }, elevenlabs: { en: '', hi: '' } };
if (!DEFAULT_VOICES[ENGINE]) { console.error(`Unknown engine "${ENGINE}": use say, piper, google or elevenlabs.`); process.exit(2); }
const VOICE = { en: opt('voice-en', DEFAULT_VOICES[ENGINE].en), hi: opt('voice-hi', DEFAULT_VOICES[ENGINE].hi) } as const;
const DRY = argv.includes('--dry');
const WPM = { en: Number(opt('wpm-en', '170')), hi: Number(opt('wpm-hi', '150')) } as const;
const langs = (opt('lang', '') ? [opt('lang', '')] : ['en', 'hi']) as ('en' | 'hi')[];
const flagValues = new Set(['--lang', '--voice-en', '--voice-hi', '--wpm-en', '--wpm-hi', '--engine']);
const ids = argv.filter((a, i) => !a.startsWith('--') && !flagValues.has(argv[i - 1] ?? ''));
const reels = argv.includes('--all') ? LIBRARY : LIBRARY.filter(r => ids.includes(r.id));
if (!reels.length) { console.error('Name at least one reel id, or pass --all.'); process.exit(2); }

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'assets', 'voice');
fs.mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(outDir, 'manifest.json');
type Entry = { ms: number; cues: [number, number, number][] };
const manifest: Record<string, Entry> = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
const SR = 22050;
/** The engine-specific step: speech for `text` as a mono 22.05 kHz 16-bit wav; returns its length in milliseconds. `ratio` is the pace relative to normal. */
async function speakToWav(text: string, lang: 'en' | 'hi', ratio: number, wav: string, tmp: string): Promise<number> {
  const raw = path.join(tmp, 'raw.audio');
  if (ENGINE === 'say') {
    run('say', ['-v', VOICE[lang], '-r', String(Math.round(WPM[lang] * ratio)), '-o', `${raw}.aiff`, '--', text]);
    run('ffmpeg', ['-y', '-i', `${raw}.aiff`, '-ar', String(SR), '-ac', '1', '-c:a', 'pcm_s16le', wav]);
  } else if (ENGINE === 'piper') {
    const model = path.join(process.env.PIPER_DIR ?? path.join(os.homedir(), '.cache', 'finos-piper'), `${VOICE[lang]}.onnx`);
    if (!fs.existsSync(model)) { console.error(`Missing voice model ${model}. See the engine notes at the top of this script.`); process.exit(2); }
    execFileSync('piper', ['--model', model, '--output_file', wav, '--length_scale', String(Math.round((1 / Math.min(1.3, Math.max(0.8, ratio))) * 100) / 100)], { input: text, stdio: ['pipe', 'ignore', 'pipe'] });
  } else {
    const bytes = await withRetry(() => (ENGINE === 'google' ? googleTts(text, lang, ratio) : elevenTts(text, lang)));
    fs.writeFileSync(`${raw}.mp3`, bytes);
    run('ffmpeg', ['-y', '-i', `${raw}.mp3`, '-ar', String(SR), '-ac', '1', '-c:a', 'pcm_s16le', wav]);
  }
  return Math.round(((fs.statSync(wav).size - 44) / (SR * 2)) * 1000);
}
const key = (name: string): string => { const v = process.env[name]; if (!v) { console.error(`Set ${name} in the environment (never on the command line or in a file in the repo).`); process.exit(2); } return v; };
async function googleTts(text: string, lang: 'en' | 'hi', ratio: number): Promise<Buffer> {
  const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key('GOOGLE_TTS_API_KEY'))}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice: { languageCode: lang === 'hi' ? 'hi-IN' : 'en-IN', name: VOICE[lang] }, audioConfig: { audioEncoding: 'MP3', speakingRate: Math.min(1.3, Math.max(0.8, ratio)) } }),
  });
  if (!r.ok) throw Object.assign(new Error(`google ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: r.status });
  return Buffer.from(((await r.json()) as { audioContent: string }).audioContent, 'base64');
}
async function elevenTts(text: string, lang: 'en' | 'hi'): Promise<Buffer> {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE[lang])}?output_format=mp3_44100_64`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'xi-api-key': key('ELEVENLABS_API_KEY') },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', language_code: lang, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!r.ok) throw Object.assign(new Error(`elevenlabs ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: r.status });
  return Buffer.from(await r.arrayBuffer());
}
/** A busy service (429 or 5xx) is asked again after a growing wait; anything else stops the run with the service's own message. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { const st = (e as { status?: number }).status ?? 0; if (i >= 5 || !(st === 429 || st >= 500)) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}
function silenceWav(ms: number, wav: string): void { run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `anullsrc=r=${SR}:cl=mono`, '-t', String(ms / 1000), '-c:a', 'pcm_s16le', wav]); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reels-vo-'));
let made = 0, totalBytes = 0, sentChars = 0;
for (const r of reels) for (const lang of langs) for (const [i, sc] of r.scenes.entries()) {
  const key = `${r.id}.${lang}.${i}`, file = path.join(outDir, `${key}.m4a`);
  const p = plan({ text: sc.say[lang], big: sc.big?.[lang], mood: sc.mood, lang, budgetMs: sc.ms });
  if (DRY) { sentChars += p.chunks.reduce((n, c) => n + c.text.length, 0); continue; }
  const parts: string[] = [], cues: [number, number, number][] = [];
  let t = 0, chars = 0;
  for (const [k, c] of p.chunks.entries()) {
    const w = path.join(tmp, `c${k}.wav`), ms = await speakToWav(c.text, lang, Math.min(1.12, Math.max(0.9, c.rate)), w, tmp);
    chars += c.text.length; cues.push([chars, t, t + ms]); parts.push(w); t += ms;
    if (c.pauseAfterMs > 0 && k < p.chunks.length - 1) { const s = path.join(tmp, `s${k}.wav`); silenceWav(c.pauseAfterMs, s); parts.push(s); t += c.pauseAfterMs; }
  }
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, parts.map(x => `file '${x}'`).join('\n'));
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'aac', '-b:a', '32k', '-movflags', '+faststart', file]);
  manifest[key] = { ms: t + 40, cues };                                              // 40 ms: the encoder's padding at the end
  totalBytes += fs.statSync(file).size; made++;
}
fs.rmSync(tmp, { recursive: true, force: true });
if (DRY) { console.log(`Dry run (${ENGINE}): ${sentChars} characters in ${reels.length} reel(s), ${langs.join(' + ')}. Nothing was sent or written.`); process.exit(0); }

fs.writeFileSync(manifestPath, JSON.stringify(manifest));
const keys = Object.keys(manifest).sort();
fs.writeFileSync(path.join(root, 'lib', 'reels', 'voiceManifest.ts'),
  `// GENERATED by \`npm run reels:voiceover\` (scripts/reels-voiceover.mts). Do not edit. Empty until clips have been recorded.\nexport const VOICE_MANIFEST: Record<string, { ms: number; cues: [number, number, number][] }> = ${JSON.stringify(Object.fromEntries(keys.map(k => [k, manifest[k]])))};\n`);
fs.writeFileSync(path.join(root, 'lib', 'reels', 'voiceAssets.ts'),
  `// GENERATED by \`npm run reels:voiceover\` (scripts/reels-voiceover.mts). Do not edit. Static requires so Metro bundles the clips. Only the player code\n// imports this file (never the tests: node cannot load audio files).\nexport const VOICE_ASSETS: Record<string, number> = {\n${keys.map(k => `  '${k}': require('../../assets/voice/${k}.m4a'),`).join('\n')}\n};\n`);
console.log(`Recorded ${made} clips (${(totalBytes / 1024).toFixed(0)} KB) for ${reels.length} reel(s); the library now holds ${keys.length} clips.`);
