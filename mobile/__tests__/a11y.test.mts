// Static accessibility guard for the React screens (the website has axe checks; the phone had none).
// 1. Every touchable and text input carries an accessibilityRole or accessibilityLabel.
// 2. Text colours used on the dark surfaces meet WCAG AA (4.5:1) for small text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d: string): string[] => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => {
  const rel = path.join(d, e.name);
  return e.isDirectory() ? walk(rel) : /\.tsx$/.test(e.name) ? [rel] : [];
});

function tagAt(s: string, start: number, nameLen: number) {
  const seg = s.slice(start, start + 1500);
  let i = nameLen + 1, depth = 0;
  for (; i < seg.length; i++) {
    const c = seg[i];
    if (c === '{') depth++; else if (c === '}') depth--; else if (c === '>' && depth === 0 && seg[i - 1] !== '=') break;
  }
  return seg.slice(0, i);
}

test('every touchable and text input has an accessibility role or label', () => {
  const missing: string[] = [];
  for (const f of [...walk('app'), ...walk('components')]) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(/<(TouchableOpacity|Pressable|TextInput)\b/g)) {
      const tag = tagAt(s, m.index!, m[1].length);
      if (!/accessibilityLabel|accessibilityRole/.test(tag)) missing.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('icon-only buttons have a spoken label', () => {
  const bad: string[] = [];
  for (const f of [...walk('app'), ...walk('components')]) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(/<(TouchableOpacity|Pressable)\b/g)) {
      const tag = tagAt(s, m.index!, m[1].length);
      const rest = s.slice(m.index! + tag.length + 1);
      const close = rest.indexOf('</' + m[1] + '>');
      const inner = rest.slice(0, close);
      const text = inner.replace(/<[^>]+>|\{[^}]*\}/g, '').trim();
      // children built from an expression ({m.cta}, {p}%) carry real words at run time; only fixed one-glyph content is a risk
      if (close > 0 && text.length > 0 && text.length <= 2 && !/\{/.test(inner.replace(/style=\{[^}]*\}/g, '')) && !/accessibilityLabel/.test(tag)) bad.push(`${f}:${s.slice(0, m.index).split('\n').length} "${text}"`);
    }
  }
  assert.deepEqual(bad, []);
});

function lum(hex: string) {
  const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (fg: string, alpha: number, bg: string) => '#' + [0, 2, 4].map(i => Math.round(alpha * parseInt(fg.slice(1 + i, 3 + i), 16) + (1 - alpha) * parseInt(bg.slice(1 + i, 3 + i), 16)).toString(16).padStart(2, '0')).join('');

test('text colours on the dark surfaces reach 4.5:1', () => {
  const theme = fs.readFileSync(path.join(ROOT, 'constants/theme.ts'), 'utf8');
  const hex = (k: string) => (theme.match(new RegExp(`\\b${k}:\\s*'(#[0-9A-Fa-f]{6})'`)) || [])[1];
  const bg = hex('bg'), surface = hex('surface');
  for (const k of ['textPrimary', 'textMuted', 'cyan', 'teal', 'gold', 'red', 'orange', 'purpleInk']) {
    const c = hex(k);
    assert.ok(c, k + ' is defined');
    assert.ok(ratio(c, bg) >= 4.5 && ratio(c, surface) >= 4.5, `${k} ${c}: ${ratio(c, bg).toFixed(2)} on bg, ${ratio(c, surface).toFixed(2)} on surface`);
  }
  const dim = theme.match(/textDim:\s*'rgba\(255,255,255,([0-9.]+)\)'/);
  assert.ok(dim, 'textDim is white with alpha');
  assert.ok(ratio(mix('#FFFFFF', parseFloat(dim![1]), bg), bg) >= 4.5, 'textDim ' + dim![1]);
});

test('no text uses the dark purple fill colour as its colour', () => {
  const offenders: string[] = [];
  for (const f of [...walk('app'), ...walk('components')]) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    s.split('\n').forEach((line, i) => { if (/(?<![A-Za-z])color: Colors\.purple\b/.test(line)) offenders.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(offenders, []);
});
