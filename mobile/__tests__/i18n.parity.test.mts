// The app's language lookup must behave exactly like the website's js/finos-i18n.js for the same table and text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { lookup, translateWith, templateKey } from '../lib/i18nCore.ts';
import { HI } from '../lib/i18nHi.ts';

const web = createRequire(import.meta.url)('../../js/finos-i18n.js');
web.register('hi', HI);

const fills = ['₹5,000', '12', '₹1.41 L', '₹2.40Cr', '20y', '3.5%', '₹80K', '9y 8m', '15 Days', '10-13%'];
function samples(): string[] {
  const out = new Set<string>();
  Object.keys(HI).forEach((k, i) => {
    out.add(k);
    if (k.includes('{n}')) {
      let j = i;
      out.add(k.replace(/\{n\}/g, () => fills[j++ % fills.length]));
    }
    if (k.endsWith(': {v}')) out.add(k.replace('{v}', '₹1.41 L'));
  });
  ['Unknown sentence', '₹2.40 Cr', '20 Years', '42', 'Maturity: ₹1.41 L', '  Add  ', '▸ How this is worked out', '＋ Add', '🍽️ Food & Dining', 'Fri, 9 Oct'].forEach(s => out.add(s));
  return [...out];
}

test('the app and the website look every string up the same way (over 1,000 strings, filled and unfilled)', async () => {
  await web.setLang('hi', { persist: false });
  const all = samples();
  assert.ok(all.length > 1000, String(all.length));
  const bad: string[] = [];
  for (const s of all) {
    const a = lookup(s, HI, 'hi'), w = web._lookup(s);
    if ((a ?? null) !== (w ?? null)) bad.push(`${JSON.stringify(s)} app=${JSON.stringify(a)} web=${JSON.stringify(w)}`);
  }
  assert.deepEqual(bad.slice(0, 8), []);
});

test('English is never touched', () => {
  assert.equal(lookup('Add', HI, 'en'), null);
  assert.equal(translateWith('Add', HI, 'en'), 'Add');
});

test('surrounding whitespace is kept and unknown text is returned unchanged', () => {
  assert.equal(translateWith('  Add  ', HI, 'hi'), '  जोड़ें  ');
  assert.equal(translateWith('Some new sentence', HI, 'hi'), 'Some new sentence');
});

test('templateKey is the key a missing string needs', () => {
  assert.equal(templateKey('5 coins · avg ₹30,00,000'), '{n} coins · avg {n}');
  assert.equal(templateKey('Invested at 12% a year,  ₹24,049 a month'), 'Invested at {n} a year, {n} a month');
});

test('every Hindi entry keeps its placeholders in the same number as its English key, and is not empty', () => {
  const holes = (s: string) => (s.match(/\{(n|v)\}/g) || []).length;
  const bad = Object.entries(HI).filter(([k, v]) => !v.trim() || holes(k) !== holes(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
});
