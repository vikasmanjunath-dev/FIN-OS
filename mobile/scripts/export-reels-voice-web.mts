// Copies the recorded reel voice to the website: assets/reels-voice/<reel>.<lang>.<scene>.m4a and js/reels-voice.json ({ v, clips: { key: ms } }).
// The web feed (js/reels.js) plays a clip only when the person turns Voice on, and uses its length as the scene's clock. Run it after
// `npm run reels:voiceover` so the website's voice is the app's voice:   node --import ./__tests__/register-aliases.mjs scripts/export-reels-voice-web.mts
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY } from '../lib/reels/library.ts';

const root = path.resolve(import.meta.dirname, '..');
const site = path.resolve(root, '..');
const src = path.join(root, 'assets', 'voice');
const out = path.join(site, 'assets', 'reels-voice');
const manifest: Record<string, { ms: number }> = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const live = new Set(LIBRARY.map(r => r.id));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const clips: Record<string, number> = {};
let bytes = 0;
for (const key of Object.keys(manifest).sort()) {
  if (!live.has(key.split('.')[0])) continue;
  fs.copyFileSync(path.join(src, `${key}.m4a`), path.join(out, `${key}.m4a`));
  bytes += fs.statSync(path.join(out, `${key}.m4a`)).size;
  clips[key] = manifest[key].ms;
}
fs.writeFileSync(path.join(site, 'js', 'reels-voice.json'), JSON.stringify({ v: 1, clips }));
console.log(`Copied ${Object.keys(clips).length} clips (${(bytes / 1048576).toFixed(1)} MB) to assets/reels-voice and wrote js/reels-voice.json`);
