const test = require('node:test');
const assert = require('node:assert');
const I = require('../js/finos-i18n.js');
const F = require('../js/finos-format.js');

test('before any language is set, t() is the identity', () => {
  assert.strictEqual(I.lang(), 'en');
  assert.strictEqual(I.t('Save'), 'Save');
});

test('Hindi table registers via the locale file and translates exact strings', async () => {
  global.FinosI18n = I;
  require('../js/i18n/hi.js');
  await I.setLang('hi', { persist: false });
  assert.strictEqual(I.lang(), 'hi');
  assert.strictEqual(I.t('Save'), 'सहेजें');
  assert.strictEqual(I.t('Net Worth'), 'नेट वर्थ');
  assert.strictEqual(I.t('Something not in the table'), 'Something not in the table');
  assert.strictEqual(I.t('Nope', 'fallback'), 'fallback');
});

test('decorative glyphs and whitespace around a label are preserved', () => {
  assert.strictEqual(I._lookup('← Back to Track Finances'), '← ट्रैक फ़ाइनेंस पर वापस');
  assert.strictEqual(I._lookup('  Save  '), 'सहेजें');
  assert.strictEqual(I._lookup('Import holdings…'), 'होल्डिंग्स इम्पोर्ट करें…');
  assert.strictEqual(I._lookup('Saved 3 items'), null);                 // prose is never partially translated
});

test('unknown language falls back to English', async () => {
  await I.setLang('xx', { persist: false });
  assert.strictEqual(I.lang(), 'en');
  assert.strictEqual(I.t('Save'), 'Save');
});

test('Hindi money units: लाख / करोड़ (and English when not Hindi)', () => {
  assert.strictEqual(F.compact(500000, { lang: 'hi' }), '₹5 लाख');
  assert.strictEqual(F.compact(12500000, { lang: 'hi' }), '₹1.25 करोड़');
  assert.strictEqual(F.compact(12500, { lang: 'hi' }), '₹12.5 हज़ार');
  assert.strictEqual(F.compact(500000, { lang: 'en' }), '₹5 L');
  assert.strictEqual(F.compact(99999, { lang: 'hi' }), '₹1 लाख');
});

test('every Hindi entry has a non-empty value and no accidental English-only duplicates', () => {
  const table = {}; global.FinosI18n = { register: (c, t) => Object.assign(table, t) };
  delete require.cache[require.resolve('../js/i18n/hi.js')];
  require('../js/i18n/hi.js');
  const bad = Object.entries(table).filter(([k, v]) => !v || !String(v).trim());
  assert.deepStrictEqual(bad, []);
  assert.ok(Object.keys(table).length >= 100);
  global.FinosI18n = I;
});
