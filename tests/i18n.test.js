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

test('"Label: value" results keep the value and translate the label, with lakh and crore in Hindi', () => {
  const I = require('../js/finos-i18n.js');
  I.register('hi', { 'Maturity: {v}': 'परिपक्वता: {v}', 'Quarterly Payout: {v}': 'तिमाही भुगतान: {v}' });
  global.document = undefined;
  return I.setLang('hi', { persist: false }).then(() => {
    assert.strictEqual(I._lookup('Maturity: ₹1.41 L'), 'परिपक्वता: ₹1.41 लाख');
    assert.strictEqual(I._lookup('Maturity: ₹2.40Cr'), 'परिपक्वता: ₹2.40 करोड़');
    assert.strictEqual(I._lookup('Quarterly Payout: ₹30,750'), 'तिमाही भुगतान: ₹30,750');
    assert.strictEqual(I._lookup('Unknown label: ₹5'), null);                 // no entry: left alone
    assert.strictEqual(I._lookup('Maturity: '), null);
  });
});

test('sentences with numbers are looked up by template and the figures are put back in order, in Hindi units', async () => {
  const I = require('../js/finos-i18n.js');
  I.register('hi', {
    'Investing wins by {n}': 'निवेश {n} से जीतता है',
    'Loan-free in {n} {n} (vs {n}) · interest paid {n}': 'लोन-मुक्त होगा {n} {n} में ({n} के मुक़ाबले) · चुकाया ब्याज {n}',
    'Invest {n} more': '{n} और निवेश करें',
  });
  await I.setLang('hi', { persist: false });
  assert.strictEqual(I._lookup('Investing wins by ₹33.28 L'), 'निवेश ₹33.28 लाख से जीतता है');
  assert.strictEqual(I._lookup('Loan-free in 9y 8m (vs 20y) · interest paid ₹23.21 L'), 'लोन-मुक्त होगा 9 साल 8 महीने में (20 साल के मुक़ाबले) · चुकाया ब्याज ₹23.21 लाख');
  assert.strictEqual(I._lookup('Invest ₹80,000 more'), '₹80,000 और निवेश करें');             // "m" in "more" is not a unit
  assert.strictEqual(I._lookup('A sentence with 12 numbers 5'), null);                       // no template: left alone
});

test('a bare figure only has its units localised, and a plain number is left alone', async () => {
  const I = require('../js/finos-i18n.js');
  await I.setLang('hi', { persist: false });
  assert.strictEqual(I._lookup('₹2.40 Cr'), '₹2.40 करोड़');
  assert.strictEqual(I._lookup('20 Years'), '20 साल');
  assert.strictEqual(I._lookup('61 Months'), '61 महीने');
  assert.strictEqual(I._lookup('15 Days'), '15 दिन');
  assert.strictEqual(I._lookup('₹5,000'), null);
  assert.strictEqual(I._lookup('42'), null);
  await I.setLang('en', { persist: false });
  assert.strictEqual(I._lookup('₹2.40 Cr'), null);
});
