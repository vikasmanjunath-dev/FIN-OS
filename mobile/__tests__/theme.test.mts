// Light-theme mapping: tokens, overlays, alpha accents, shadows, and that the palette reads well on the light page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightColor, lightStyle, contrast, LIGHT_BG, LIGHT_SURFACE } from '../lib/themeCore.ts';
import { Colors } from '../constants/theme.ts';

test('the palette tokens map to their light values', () => {
  assert.equal(lightColor(Colors.bg), '#F4F6FA');
  assert.equal(lightColor(Colors.surface), '#FFFFFF');
  assert.equal(lightColor(Colors.textPrimary), '#0F172A');
  assert.equal(lightColor(Colors.cyan), '#075985');
  assert.equal(lightColor(Colors.border), 'rgba(15,23,42,0.10)');
  assert.equal(lightColor(Colors.overlay), 'rgba(15,23,42,0.04)');
});

test('every text colour in the palette is readable on the light page and on a white card (WCAG AA, 4.5:1)', () => {
  const text = [Colors.textPrimary, Colors.textMuted, Colors.cyan, Colors.teal, Colors.purple, Colors.purpleInk, Colors.gold, Colors.red, Colors.orange];
  for (const t of text) {
    const light = lightColor(t);
    assert.ok(contrast(light, LIGHT_BG) >= 4.5, `${t} -> ${light} on page: ${contrast(light, LIGHT_BG).toFixed(2)}`);
    assert.ok(contrast(light, LIGHT_SURFACE) >= 4.5, `${t} -> ${light} on card: ${contrast(light, LIGHT_SURFACE).toFixed(2)}`);
  }
  const dim = lightColor(Colors.textDim);
  assert.ok(contrast(dim, LIGHT_BG) >= 4.5, `textDim ${dim}: ${contrast(dim, LIGHT_BG).toFixed(2)}`);
});

test('white overlays become dark overlays and keep their alpha; accents with alpha keep alpha and take the darker accent', () => {
  assert.equal(lightColor('rgba(255,255,255,0.08)'), 'rgba(15,23,42,0.08)');
  assert.equal(lightColor('rgba(0,212,255,0.25)'), 'rgba(7,89,133,0.25)');
  assert.equal(lightColor('rgba(240, 165, 0, 0.12)'), 'rgba(146,64,14,0.12)');
  assert.equal(lightColor('#22D3A630'), 'rgba(6,95,70,0.188)');                 // colour + '30' (an eight-digit hex)
});

test('solid white stays (knobs, text on a fill); solid black text becomes white; scrims and shadows and transparent are untouched', () => {
  assert.equal(lightColor('#fff'), '#fff');
  assert.equal(lightColor('#000'), '#FFFFFF');
  assert.equal(lightColor('rgba(0,0,0,0.5)'), 'rgba(0,0,0,0.5)');
  assert.equal(lightColor('transparent'), 'transparent');
  assert.equal(lightColor('#000', 'shadowColor'), '#000');
  assert.equal(lightColor('red'), 'red');                                          // a named colour is left alone
});

test('unknown bright colours are darkened, unknown dark ones are left', () => {
  const dark = lightColor('#FF9F1C');
  assert.notEqual(dark, '#FF9F1C');
  assert.ok(contrast(dark, '#FFFFFF') >= 3);
  assert.equal(lightColor('#334155'), '#334155');
});

test('lightStyle maps only colour keys and returns the same object when nothing changes', () => {
  const s = { backgroundColor: Colors.surface, color: Colors.textPrimary, padding: 8, borderColor: Colors.border };
  const m = lightStyle(s);
  assert.deepEqual(m, { backgroundColor: '#FFFFFF', color: '#0F172A', padding: 8, borderColor: 'rgba(15,23,42,0.10)' });
  assert.equal(s.backgroundColor, '#0D1117');                                      // input not mutated
  const plain = { padding: 4, color: '#334155' };
  assert.equal(lightStyle(plain), plain);
});

test('mapping twice equals mapping once, for every palette token and every literal colour the app uses', () => {
  const samples = [...Object.values(Colors).filter((v): v is string => typeof v === 'string'), '#FFB347', '#FF6B6B', '#4F7CFF', '#000', '#fff', '#C7F000', '#A78BFA', '#FF9F1C',
    'rgba(255,255,255,0.08)', 'rgba(0,212,255,0.25)', 'rgba(240,165,0,0.12)', 'rgba(148,163,184,0.6)', 'rgba(0,0,0,0.5)', '#22D3A630', '#0D1117', '#111827', '#F4F6FA', '#0F172A', '#075985'];
  for (const c of samples) {
    const once = lightColor(c);
    assert.equal(lightColor(once), once, `${c} -> ${once} -> ${lightColor(once)}`);
  }
});

test('accent text stays readable on its own 15% tint (the badges, chips and cards that tint an accent)', () => {
  const mix = (h: string, a: number, bg: string) => {
    const n = parseInt(h.slice(1), 16), m = parseInt(bg.slice(1), 16);
    const ch = (v: number, s: number) => (v >> s) & 255;
    return '#' + [16, 8, 0].map(s => Math.round(ch(n, s) * a + ch(m, s) * (1 - a)).toString(16).padStart(2, '0')).join('');
  };
  for (const a of [Colors.cyan, Colors.teal, Colors.purple, Colors.gold, Colors.red, Colors.orange]) {
    const light = lightColor(a);
    for (const bg of [LIGHT_BG, LIGHT_SURFACE]) {
      const tint = mix(light, 0.15, bg);
      assert.ok(contrast(light, tint) >= 4.5, `${a} -> ${light} on its tint over ${bg}: ${contrast(light, tint).toFixed(2)}`);
    }
  }
});
