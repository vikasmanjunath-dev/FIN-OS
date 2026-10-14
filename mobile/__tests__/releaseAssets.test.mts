// The brand images the stores and the phone need: sizes, colour model, alpha, and the Android safe zones.
// Regenerate them with `python3 scripts/release-assets.py` (Pillow). These tests read the committed PNGs directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asset = (p: string) => path.join(root, 'assets', p);

interface Png { w: number; h: number; colorType: number; bitDepth: number; px: Uint8Array; channels: number; hasAlpha: boolean; chunks: string[] }

/** Minimal PNG reader: 8-bit RGB / RGBA, non-interlaced (what Pillow writes). Returns raw interleaved pixels. */
function readPng(file: string): Png {
  const b = readFileSync(file);
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} is not a PNG`);
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat: Buffer[] = [];
  const chunks: string[] = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off), type = b.toString('ascii', off + 4, off + 8), data = b.subarray(off + 8, off + 8 + len);
    chunks.push(type);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  assert.equal(bitDepth, 8, `${file}: 8-bit only`);
  assert.equal(interlace, 0, `${file}: interlaced PNG`);
  assert.ok(colorType === 2 || colorType === 6, `${file}: colour type ${colorType} (want RGB or RGBA)`);
  const ch = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch, px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0;
      const up = y > 0 ? px[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= ch ? px[(y - 1) * stride + x - ch] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - ul, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul; }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, colorType, bitDepth, px, channels: ch, hasAlpha: colorType === 6, chunks };
}
const at = (p: Png, x: number, y: number) => { const i = (y * p.w + x) * p.channels; return { r: p.px[i], g: p.px[i + 1], b: p.px[i + 2], a: p.hasAlpha ? p.px[i + 3] : 255 }; };

/** Largest distance from the canvas centre of any pixel that is visible (alpha above `min`), as a fraction of the width. */
function reach(p: Png, min = 8) {
  let max = 0, count = 0;
  const cx = (p.w - 1) / 2, cy = (p.h - 1) / 2;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (at(p, x, y).a > min) { count++; max = Math.max(max, Math.hypot(x - cx, y - cy)); }
  }
  return { fraction: max / p.w, count };
}

const theme = readFileSync(path.join(root, 'constants/theme.ts'), 'utf8');
const BG = /bg:\s*'(#[0-9A-Fa-f]{6})'/.exec(theme)![1].toUpperCase();
const CYAN = /cyan:\s*'(#[0-9A-Fa-f]{6})'/.exec(theme)![1].toUpperCase();
const hex = (s: string) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));

test('icon.png: 1024 x 1024, RGB with NO alpha channel (the App Store rejects an alpha channel), full bleed in the app background', () => {
  const p = readPng(asset('icon.png'));
  assert.deepEqual([p.w, p.h], [1024, 1024]);
  assert.equal(p.colorType, 2, 'icon must be RGB, not RGBA');
  const [r, g, b] = hex(BG);
  for (const [x, y] of [[0, 0], [1023, 0], [0, 1023], [1023, 1023]] as const) {
    const c = at(p, x, y);
    assert.ok(Math.abs(c.r - r) < 6 && Math.abs(c.g - g) < 6 && Math.abs(c.b - b) < 6, `corner ${x},${y} is not the background colour`);
  }
  const mid = at(p, 512, 512);                          // the purple core
  assert.ok(mid.b > 200 && mid.r > 80 && mid.g < 80, 'centre should be the purple core');
  assert.ok(reach(p).count > 1024 * 1024 * 0.9, 'every pixel is opaque');
});

test('adaptive icon: foreground and monochrome stay inside Android\'s 66dp-of-108dp safe circle; background is plain', () => {
  const SAFE = 66 / 108 / 2;                            // radius as a fraction of the canvas width
  for (const f of ['adaptive-icon.png', 'adaptive-icon-monochrome.png']) {
    const p = readPng(asset(f));
    assert.deepEqual([p.w, p.h], [1024, 1024], f);
    assert.ok(p.hasAlpha, `${f} needs an alpha channel`);
    const r = reach(p, 0);
    assert.ok(r.count > 20000, `${f} has a visible mark`);
    assert.ok(r.fraction <= SAFE, `${f}: mark reaches ${r.fraction.toFixed(3)} of the width, the safe zone ends at ${SAFE.toFixed(3)}`);
    const c = at(p, 0, 0);
    assert.equal(c.a, 0, `${f}: corner must be transparent`);
  }
  const mono = readPng(asset('adaptive-icon-monochrome.png'));
  const colours = new Set<string>();
  for (let i = 0; i < mono.px.length; i += 4) if (mono.px[i + 3] > 0) colours.add(`${mono.px[i]},${mono.px[i + 1]},${mono.px[i + 2]}`);
  assert.equal(colours.size, 1, 'monochrome layer must be a single colour (the launcher recolours it)');
  const bgp = readPng(asset('adaptive-icon-background.png'));
  assert.deepEqual([bgp.w, bgp.h], [1024, 1024]);
  assert.equal(bgp.colorType, 2);
  const [r, g, b] = hex(BG);
  const corner = at(bgp, 0, 0);
  assert.ok(Math.abs(corner.r - r) < 6 && Math.abs(corner.g - g) < 6 && Math.abs(corner.b - b) < 6, 'background corner is the app background');
});

test('splash-icon.png: transparent, and the mark fits the circle Android 12 keeps (2/3 of the width)', () => {
  const p = readPng(asset('splash-icon.png'));
  assert.deepEqual([p.w, p.h], [1024, 1024]);
  assert.ok(p.hasAlpha);
  assert.equal(at(p, 0, 0).a, 0);
  const r = reach(p, 0);
  assert.ok(r.count > 20000);
  assert.ok(r.fraction <= 1 / 3, `splash mark reaches ${r.fraction.toFixed(3)}, limit 0.333`);
});

test('notification-icon.png: 96 x 96, white on transparent only (Android tints it; any colour would show as a white blob)', () => {
  const p = readPng(asset('notification-icon.png'));
  assert.deepEqual([p.w, p.h], [96, 96]);
  assert.ok(p.hasAlpha);
  let visible = 0;
  for (let i = 0; i < p.px.length; i += 4) {
    if (p.px[i + 3] > 0) { visible++; assert.deepEqual([p.px[i], p.px[i + 1], p.px[i + 2]], [255, 255, 255], 'every visible pixel is white'); }
  }
  assert.ok(visible > 96 * 96 * 0.04 && visible < 96 * 96 * 0.5, `a thin mark, not a solid square (${visible} px)`);
  assert.equal(at(p, 0, 0).a, 0);
});

test('favicon and Play Store art have the sizes the stores ask for', () => {
  const fav = readPng(asset('favicon.png'));
  assert.deepEqual([fav.w, fav.h], [48, 48]);
  const play = readPng(asset('store/play-icon-512.png'));
  assert.deepEqual([play.w, play.h], [512, 512]);
  const feat = readPng(asset('store/play-feature-graphic.png'));
  assert.deepEqual([feat.w, feat.h], [1024, 500]);
  assert.equal(feat.colorType, 2, 'Play feature graphic must not have an alpha channel');
});

test('no PNG carries text or colour-profile chunks that could leak the machine it was made on', () => {
  const files = ['icon.png', 'adaptive-icon.png', 'adaptive-icon-background.png', 'adaptive-icon-monochrome.png', 'splash-icon.png', 'notification-icon.png', 'favicon.png', 'store/play-icon-512.png', 'store/play-feature-graphic.png'];
  const store = existsSync(asset('store')) ? readdirSync(asset('store')).filter(f => f.endsWith('.png')).map(f => `store/${f}`) : [];
  for (const f of new Set([...files, ...store])) {
    const bad = readPng(asset(f)).chunks.filter(c => ['tEXt', 'zTXt', 'iTXt', 'eXIf', 'iCCP'].includes(c));
    assert.deepEqual(bad, [], `${f} has metadata chunks`);
  }
});

test('brand colours in the generator match constants/theme.ts', () => {
  const py = readFileSync(path.join(root, 'scripts/release-assets.py'), 'utf8');
  const pyColor = (name: string) => { const m = new RegExp(`${name}\\s*=\\s*\\(0x([0-9A-Fa-f]{2}),\\s*0x([0-9A-Fa-f]{2}),\\s*0x([0-9A-Fa-f]{2})\\)`).exec(py)!; return `#${m[1]}${m[2]}${m[3]}`.toUpperCase(); };
  assert.equal(pyColor('BG'), BG);
  assert.equal(pyColor('CYAN'), CYAN);
  const purple = /purple:\s*'(#[0-9A-Fa-f]{6})'/.exec(theme)![1].toUpperCase();
  assert.equal(pyColor('PURPLE'), purple);
});
