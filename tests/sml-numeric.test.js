// Run: node --test tests/sml-numeric.test.js
// SmlNormalizer (Indian numbers / language / months) + SmlNumericCheck (answer figures must come from evidence).
const test = require('node:test');
const assert = require('node:assert');
const N = require('../js/sml/normalizer.js');
const C = require('../js/sml/numeric-check.js');

const amounts = (t) => N.parseAmount(t).map((a) => a.value_inr);
const one = (t) => { const a = N.parseAmount(t); assert.strictEqual(a.length, 1, `expected exactly one amount in ${JSON.stringify(t)}, got ${JSON.stringify(a)}`); return a[0]; };
const NOW = new Date(2026, 9, 16); // 16 Oct 2026 (local)

// ───────────────────────────── parseAmount: every spelling in the brief ─────────────────────────────
test('parseAmount: currency symbols, Indian and Western grouping, "/-"', () => {
  assert.strictEqual(one('₹1,40,000').value_inr, 140000);
  assert.strictEqual(one('Rs. 50,000').value_inr, 50000);
  assert.strictEqual(one('Rs.50000').value_inr, 50000);
  assert.strictEqual(one('INR 25,000').value_inr, 25000);
  assert.strictEqual(one('1,25,000/-').value_inr, 125000);
  assert.strictEqual(one('1,400,000').value_inr, 1400000);
  assert.strictEqual(one('12,34,567.89').value_inr, 1234567.89);
  assert.strictEqual(one('₹ 5000').value_inr, 5000);
  assert.strictEqual(one('50 rupees').value_inr, 50);
});

test('parseAmount: unit words (cr, crore, lakh, lac, k, L)', () => {
  assert.strictEqual(one('1.5 cr').value_inr, 15000000);
  assert.strictEqual(one('2 crore').value_inr, 20000000);
  assert.strictEqual(one('2 lakh').value_inr, 200000);
  assert.strictEqual(one('1 lac').value_inr, 100000);
  assert.strictEqual(one('50k').value_inr, 50000);
  assert.strictEqual(one('50 K').value_inr, 50000);
  assert.strictEqual(one('₹ 3.2L').value_inr, 320000);
  assert.strictEqual(one('12 LPA').value_inr, 1200000);
  assert.strictEqual(one('2 lakh 50 thousand').value_inr, 250000);
  assert.strictEqual(one('Rs.1.5 cr').value_inr, 15000000);
});

test('parseAmount: Hinglish number words and fractions', () => {
  assert.strictEqual(one('do lakh').value_inr, 200000);
  assert.strictEqual(one('dedh lakh').value_inr, 150000);
  assert.strictEqual(one('dhai lakh').value_inr, 250000);
  assert.strictEqual(one('sawa lakh').value_inr, 125000);
  assert.strictEqual(one('paune do lakh').value_inr, 175000);
  assert.strictEqual(one('sadhe teen lakh').value_inr, 350000);
  assert.strictEqual(one('das hazaar').value_inr, 10000);
  assert.strictEqual(one('paanch sau').value_inr, 500);
  assert.strictEqual(one('dedh sau').value_inr, 150);
  assert.strictEqual(one('two lakh').value_inr, 200000);
});

test('parseAmount: Devanagari words and digits', () => {
  assert.strictEqual(one('दो लाख रुपये').value_inr, 200000);
  assert.strictEqual(one('डेढ़ लाख').value_inr, 150000);
  assert.strictEqual(one('₹१,४०,०००').value_inr, 140000);
});

test('parseAmount: plain bare numbers and offsets', () => {
  assert.strictEqual(one('plain 5000').value_inr, 5000);
  const text = 'Rent ₹1,40,000 and dedh lakh bonus';
  const a = N.parseAmount(text);
  assert.deepStrictEqual(a.map((x) => x.value_inr), [140000, 150000]);
  assert.strictEqual(text.slice(a[0].start, a[0].end), '₹1,40,000');
  assert.strictEqual(a[0].raw, '₹1,40,000');
  assert.strictEqual(text.slice(a[1].start, a[1].end), 'dedh lakh');
  assert.deepStrictEqual(amounts('5-6 lakh'), [500000, 600000]);
});

test('parseAmount: a sentence with several forms', () => {
  assert.deepStrictEqual(amounts('mera kharch 2 lakh hai aur 1,25,000/- bacha'), [200000, 125000]);
  assert.deepStrictEqual(amounts('Salary ₹85,000, SIP 10k, bonus dhai lakh'), [85000, 10000, 250000]);
});

// ───────────────────────────── false positives ─────────────────────────────
test('parseAmount: percentages are never money', () => {
  assert.deepStrictEqual(amounts('rate is 12% and 7.1 percent and 8 per cent'), []);
  assert.deepStrictEqual(amounts('returns of 150% over the period'), []);   // >=100 but a percentage
  assert.deepStrictEqual(amounts('8-10% returns'), []);
});

test('parseAmount: years 1900-2100 without a cue are not money, with a cue they are', () => {
  assert.deepStrictEqual(amounts('Budget 2026 and in 2024 and 1999'), []);
  assert.deepStrictEqual(amounts('Rs. 2024'), [2024]);
  assert.deepStrictEqual(amounts('2,024'), [2024]);          // grouped → not shaped like a year
  assert.deepStrictEqual(amounts('2000 rupees'), [2000]);
  assert.deepStrictEqual(amounts('2 lakh in 2024'), [200000]);
});

test('parseAmount: bare numbers below 100, counts and ids are not money', () => {
  assert.deepStrictEqual(amounts('3 cards, 12 months, 5th place, top 10'), []);
  assert.deepStrictEqual(amounts('250 transactions in 365 days at 150 bps'), []);
  assert.deepStrictEqual(amounts('call 9876543210'), []);
  assert.deepStrictEqual(amounts('5 l of milk'), []);        // lower-case detached "l" is not lakh
  assert.deepStrictEqual(amounts('Version 1.5 released'), []);
});

test('parseAmount: sections, FY, dates, citations, list numbers are masked', () => {
  assert.deepStrictEqual(amounts('Section 80C limit is ₹1.5 lakh [SOURCE_1] for FY 2025-26'), [150000]);
  assert.deepStrictEqual(amounts('80CCD(1B) gives ₹50,000 and Section 24(b) gives ₹2 lakh'), [50000, 200000]);
  assert.deepStrictEqual(amounts('87A rebate, Section 115BAC, Form 16, Form 26AS'), []);
  assert.deepStrictEqual(amounts('On 15 March 2026 and 5th April and March 2026'), []);
  assert.deepStrictEqual(amounts('Paid on 15/03/2026 at 10:30 am'), []);
  assert.deepStrictEqual(amounts('1. Save ₹5,000\n2. Invest ₹10,000'), [5000, 10000]);
  assert.deepStrictEqual(amounts('Step 2: pay 3000 [2]'), [3000]);
});

test('parseAmount: masking never hides a real amount that looks like a section or date', () => {
  assert.deepStrictEqual(amounts('bonus 80K'), [80000]);          // 80K is not a tax section
  assert.deepStrictEqual(amounts('₹50 March'), [50]);              // currency cue beats the date shape
  assert.deepStrictEqual(amounts('Option 5k'), [5000]);
  assert.deepStrictEqual(amounts('₹500(min)'), [500]);
});

// ───────────────────────────── formatting ─────────────────────────────
test('formatInr: lakh/crore grouping', () => {
  assert.strictEqual(N.formatInr(140000), '₹1,40,000');
  assert.strictEqual(N.formatInr(100), '₹100');
  assert.strictEqual(N.formatInr(0), '₹0');
  assert.strictEqual(N.formatInr(1234), '₹1,234');
  assert.strictEqual(N.formatInr(12345678), '₹1,23,45,678');
  assert.strictEqual(N.formatInr(1234.5), '₹1,234.50');
  assert.strictEqual(N.formatInr(-5500), '-₹5,500');
  assert.strictEqual(N.formatInr(NaN), '');
});

test('formatShort: ₹1.4 L / ₹2.5 Cr / ₹11.2K', () => {
  assert.strictEqual(N.formatShort(140000), '₹1.4 L');
  assert.strictEqual(N.formatShort(25000000), '₹2.5 Cr');
  assert.strictEqual(N.formatShort(11200), '₹11.2K');
  assert.strictEqual(N.formatShort(950), '₹950');
  assert.strictEqual(N.formatShort(200000), '₹2 L');
  assert.strictEqual(N.formatShort(99950), '₹1 L');         // rounding promotes to the next unit
  assert.strictEqual(N.formatShort(-140000), '-₹1.4 L');
});

test('format → parse round-trips', () => {
  for (const v of [100, 5900, 140000, 1234567, 12345678, 1234567.5]) {
    assert.strictEqual(one(N.formatInr(v)).value_inr, v, `formatInr round-trip ${v}`);
  }
  for (const v of [140000, 25000000, 11200, 200000, 4500000]) {
    assert.strictEqual(one(N.formatShort(v)).value_inr, v, `formatShort round-trip ${v}`);
  }
});

// ───────────────────────────── language ─────────────────────────────
test('detectLanguage: en / hi / hi-en', () => {
  assert.strictEqual(N.detectLanguage('How much did I spend on food last month?').lang, 'en');
  assert.strictEqual(N.detectLanguage('मेरा खर्च कितना हुआ').lang, 'hi');
  const h = N.detectLanguage('mera kharch kitna hua pichhle mahine');
  assert.strictEqual(h.lang, 'hi-en');
  assert.ok(h.confidence > 0.6 && h.confidence <= 1);
  assert.strictEqual(N.detectLanguage('kya mera SIP chalu hai').lang, 'hi-en');
  assert.strictEqual(N.detectLanguage('kitna paisa bacha').lang, 'hi-en');
  assert.strictEqual(N.detectLanguage('Set up a SIP for my retirement corpus').lang, 'en');
  assert.strictEqual(N.detectLanguage('').confidence, 0);
});

// ───────────────────────────── months ─────────────────────────────
test('monthRef: names, relative phrases, explicit years (uses the passed now)', () => {
  assert.strictEqual(N.monthRef('september', NOW), '2026-09');
  assert.strictEqual(N.monthRef('pichhle mahine ka kharch', NOW), '2026-09');
  assert.strictEqual(N.monthRef('pichle mahine', NOW), '2026-09');
  assert.strictEqual(N.monthRef('last month', NOW), '2026-09');
  assert.strictEqual(N.monthRef('is mahine kitna hua', NOW), '2026-10');
  assert.strictEqual(N.monthRef('this month', NOW), '2026-10');
  assert.strictEqual(N.monthRef('august 2026', NOW), '2026-08');
  assert.strictEqual(N.monthRef('august 2025', NOW), '2025-08');
});

test('monthRef: bare month resolves to the most recent non-future occurrence', () => {
  assert.strictEqual(N.monthRef('october', NOW), '2026-10');
  assert.strictEqual(N.monthRef('november', NOW), '2025-11');
  assert.strictEqual(N.monthRef('janwari', NOW), '2026-01');
  assert.strictEqual(N.monthRef('sitambar ka kharch', NOW), '2026-09');
  assert.strictEqual(N.monthRef('agast', NOW), '2026-08');
  assert.strictEqual(N.monthRef('disambar', NOW), '2025-12');
  assert.strictEqual(N.monthRef('navambar', NOW), '2025-11');
  assert.strictEqual(N.monthRef('farwari', NOW), '2026-02');
  assert.strictEqual(N.monthRef('spent in mai', NOW), '2026-05');
  assert.strictEqual(N.monthRef('सितंबर', NOW), '2026-09');
});

test('monthRef: year boundaries, ambiguity, no clock', () => {
  assert.strictEqual(N.monthRef('last month', new Date(2026, 0, 5)), '2025-12');
  assert.strictEqual(N.monthRef('next month', new Date(2026, 11, 5)), '2027-01');
  assert.strictEqual(N.monthRef('mai kya karu', NOW), null);      // "mai" = "I", not May
  assert.strictEqual(N.monthRef('I may go', NOW), null);          // modal verb
  assert.strictEqual(N.monthRef('Jan Dhan account', NOW), null);
  assert.strictEqual(N.monthRef('no month here', NOW), null);
  assert.strictEqual(N.monthRef('last month', undefined), null);  // relative needs `now`
  assert.strictEqual(N.monthRef('august 2026', undefined), '2026-08'); // explicit year does not
  assert.deepStrictEqual(N.monthRefs('compare august and september 2026', NOW), ['2026-08', '2026-09']);
});

// ───────────────────────────── extractNumbers ─────────────────────────────
test('extractNumbers: only real figures, with kinds', () => {
  const r = C.extractNumbers('Section 80C limit is ₹1.5 lakh [SOURCE_1] for FY 2025-26');
  assert.deepStrictEqual(r.map((x) => [x.raw, x.value, x.kind]), [['₹1.5 lakh', 150000, 'money']]);
  const k = C.extractNumbers('Spent ₹5,900 (12.5%) on the 3rd, in 2024, across 4 items');
  assert.deepStrictEqual(k.map((x) => [x.raw, x.kind]), [['₹5,900', 'money'], ['12.5%', 'percent'], ['3rd', 'ordinal'], ['2024', 'year'], ['4', 'count']]);
  assert.deepStrictEqual(C.extractNumbers('1. Rent\n2) Food [SOURCE_2]\nSee 80CCD(1B), Section 24(b), 15 March, Form 16'), []);
  assert.deepStrictEqual(C.extractNumbers(''), []);
});

test('extractNumbers: an uncued 2000 is money, a cued year is a year', () => {
  assert.strictEqual(C.extractNumbers('You spent 2000 on rent.')[0].kind, 'money');
  assert.strictEqual(C.extractNumbers('Since 2019 the plan has grown.')[0].kind, 'year');
  assert.strictEqual(C.extractNumbers('The 2025 Budget raised it.')[0].kind, 'year');
});

// ───────────────────────────── check: matching ─────────────────────────────
const tool = (value, extra) => Object.assign({ ok: true, value, unit: 'INR' }, extra || {});

test('check: exact money matches; a different number is unmatched', () => {
  const ok = C.check('You spent ₹5,900 on food.', [tool(5900)]);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.numbers[0].matched, true);
  assert.strictEqual(ok.numbers[0].matched_to, 'evidence[0].value');
  assert.deepStrictEqual(ok.unmatched, []);
  const bad = C.check('You spent ₹6,000 on food.', [tool(5900)]);
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.numbers[0].matched, false);
  assert.strictEqual(bad.numbers[0].matched_to, null);
  assert.strictEqual(bad.unmatched.length, 1);
});

test('check: rounded short forms match only at the displayed precision', () => {
  assert.strictEqual(C.check('Saved ₹11.2K', [tool(11200)]).ok, true);
  assert.strictEqual(C.check('Saved ₹11.3K', [tool(11200)]).ok, false);
  assert.strictEqual(C.check('Saved ₹11.2K', [tool(11249)]).ok, true);   // 11.249K rounds to 11.2K
  assert.strictEqual(C.check('Saved ₹11.2K', [tool(11251)]).ok, false);  // 11.251K rounds to 11.3K
  assert.strictEqual(C.check('Corpus ₹1.4 L', [tool(140000)]).ok, true);
  assert.strictEqual(C.check('Corpus ₹1.4 L', [tool(143500)]).ok, true);
  assert.strictEqual(C.check('Corpus ₹1.4 L', [tool(150000)]).ok, false);
  assert.strictEqual(C.check('Target ₹2.5 Cr', [tool(25000000)]).ok, true);
  assert.strictEqual(C.check('Target ₹2.5 Cr', [tool(26000000)]).ok, false);
});

test('check: whole-number unit figures are exact claims', () => {
  assert.strictEqual(C.check('Limit ₹2 lakh', [tool(200000)]).ok, true);
  assert.strictEqual(C.check('Limit ₹2 lakh', [tool(152000)]).ok, false);   // would be a 31% rounding
  assert.strictEqual(C.check('Limit ₹11K', [tool(11200)]).ok, false);
  assert.strictEqual(C.check('Limit dedh lakh', [tool(150000)]).ok, true);
});

test('check: plain rupees tolerate whole-rupee rounding, nothing more', () => {
  assert.strictEqual(C.check('Paid ₹5,900', [tool(5899.6)]).ok, true);
  assert.strictEqual(C.check('Paid ₹5,900', [tool(5901)]).ok, false);
  assert.strictEqual(C.check('Paid ₹5,900.50', [tool(5900.5)]).ok, true);
  assert.strictEqual(C.check('Paid ₹5,900.50', [tool(5900)]).ok, false);
  assert.strictEqual(C.check('Paid ₹5,900', [tool(5899.6)], { allowRounded: false }).ok, false);
});

test('check: spellings are normalised before comparing (lakh / lac / 1,50,000 / 150000)', () => {
  assert.strictEqual(C.check('Limit is ₹1.5 lakh.', [tool(150000)]).ok, true);
  assert.strictEqual(C.check('Limit is 150000.', [tool(150000)]).ok, true);
  assert.strictEqual(C.check('Limit is ₹1,50,000.', ['The limit is 1.5 lac per year']).ok, true);
  assert.strictEqual(C.check('Limit is ₹1,50,000.', ['The limit is 1,500,000 per year']).ok, false);
  assert.strictEqual(C.check('Limit is dedh lakh.', [tool(1.5, { unit: 'lakh' })]).ok, true);
});

test('check: percent figures', () => {
  assert.strictEqual(C.check('Savings rate is 18.5%.', [{ ok: true, value: 18.5, unit: '%' }]).ok, true);
  assert.strictEqual(C.check('Savings rate is 19%.', [{ ok: true, value: 18.5, unit: '%' }]).ok, true);    // 18.5 → 19 at 0 dp
  assert.strictEqual(C.check('Savings rate is 20%.', [{ ok: true, value: 18.5, unit: '%' }]).ok, false);
  assert.strictEqual(C.check('Savings rate is 18.5%.', [{ ok: true, value: 0.185, unit: 'ratio' }]).ok, true);
  assert.strictEqual(C.check('Rate is 12%.', ['The scheme pays 12 percent a year']).ok, true);
});

test('check: kind and unit must be compatible', () => {
  assert.strictEqual(C.check('You spent ₹12.', [{ ok: true, value: 12, unit: '%' }]).ok, false);          // percent evidence ≠ money
  assert.strictEqual(C.check('Rate is 12%.', [{ ok: true, value: 12, unit: 'INR' }]).ok, false);          // money evidence ≠ percent
  assert.strictEqual(C.check('You spent ₹18.', [{ ok: true, value: 18, unit: 'months' }]).ok, false);      // other unit
  assert.strictEqual(C.check('Rate is 12%.', [{ ok: true, rate: 12 }]).ok, true);                         // unit-less matches
});

test('check: derived numbers are reported unmatched (fail closed)', () => {
  const ev = [tool(5900), tool(2100)];
  const r = C.check('Food ₹5,900 plus rent ₹2,100 comes to ₹8,000 in total.', ev);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.unmatched.map((u) => u.raw), ['₹8,000']);
  assert.strictEqual(r.numbers.filter((n) => n.matched).length, 2);
  assert.strictEqual(C.check('Total is ₹8,000.', []).ok, false);          // no evidence at all
});

test('check: nested objects, numeric strings and source chunk strings count as evidence', () => {
  const ev = [{ ok: true, value: { total: 5900, by_cat: [{ cat: 'food', amt: 3200 }] }, unit: 'INR' }, { ok: true, summary: 'Rent was ₹20,000 this month' }, 'Your 80C limit is ₹1,50,000.', { ok: true, n: '7500' }];
  const q = (t) => C.check(t, ev);
  assert.strictEqual(q('Total ₹5,900').ok, true);
  assert.strictEqual(q('Food ₹3,200').numbers[0].matched_to, 'evidence[0].value.by_cat[0].amt');
  assert.strictEqual(q('Rent ₹20,000').ok, true);
  assert.strictEqual(q('Limit ₹1.5 lakh').numbers[0].matched_to, 'evidence[2]');
  assert.strictEqual(q('Pending ₹7,500').ok, true);
  assert.strictEqual(q('Pending ₹7,501').ok, false);
});

test('check: failed tool results, ids and years are not evidence', () => {
  assert.strictEqual(C.check('Spent ₹5,900', [{ ok: false, value: 5900, unit: 'INR' }]).ok, false);
  assert.strictEqual(C.check('Spent ₹5,900', [{ ok: true, id: 5900, value: 1 }]).ok, false);
  assert.strictEqual(C.check('Spent ₹2,026', [{ ok: true, year: 2026 }]).ok, false);
});

test('check: citation markers, years, sections, FY and dates are ignored; counts only when strict', () => {
  const text = 'Section 80C allows ₹1.5 lakh [SOURCE_1] in FY 2025-26, since 2019, via 80CCD(1B), on 15 March, across 3 options.';
  const r = C.check(text, ['The 80C limit is ₹1,50,000']);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.numbers.length, 1);
  assert.deepStrictEqual(r.skipped.map((s) => s.kind).sort(), ['count', 'year']);
  assert.strictEqual(C.check(text, ['The 80C limit is ₹1,50,000'], { strictCounts: true }).ok, false);
  assert.strictEqual(C.check('You have 3 subscriptions.', [{ ok: true, value: 3 }], { strictCounts: true }).ok, true);
  assert.strictEqual(C.check('You have 4 subscriptions.', [{ ok: true, value: 3 }], { strictCounts: true }).ok, false);
});

test('check: an answer with no figures is ok; Hinglish answers are checked too', () => {
  assert.strictEqual(C.check('Great, keep tracking your spending.', []).ok, true);
  assert.strictEqual(C.check('Aapka kharch dedh lakh raha.', [tool(150000)]).ok, true);
  assert.strictEqual(C.check('Aapka kharch dedh lakh raha.', [tool(125000)]).ok, false);
  assert.strictEqual(C.check('Aapka bacha hua paisa 50k hai.', [tool(50000)]).ok, true);
});

// ───────────────────────────── sanitize ─────────────────────────────
test('sanitize: leaves a fully supported answer untouched', () => {
  const t = 'You spent ₹5,900 on food. That is 12% of income.';
  const s = C.sanitize(t, [tool(5900), { ok: true, value: 12, unit: '%' }]);
  assert.strictEqual(s.text, t);
  assert.deepStrictEqual(s.removed, []);
  assert.strictEqual(s.changed, false);
});

test('sanitize: removes only the sentences with unmatched figures and never edits numbers', () => {
  const t = 'You spent ₹5,900 on food. Together that is ₹8,000. Keep it up.';
  const s = C.sanitize(t, [tool(5900)]);
  assert.strictEqual(s.text, 'You spent ₹5,900 on food. Keep it up.');
  assert.deepStrictEqual(s.removed, ['Together that is ₹8,000.']);
  assert.strictEqual(s.blocked, false);
  assert.ok(!s.text.includes('8,000'));
  assert.ok(s.text.includes('₹5,900'));
});

test('sanitize: keeps line structure for bullet lists and does not split on Rs. or decimals', () => {
  const t = 'Summary:\n- Food Rs. 5,900\n- Misc Rs. 1,111\n- Rent ₹20,000\nSavings rate is 12.5%.';
  const s = C.sanitize(t, [tool(5900), tool(20000), { ok: true, value: 12.5, unit: '%' }]);
  assert.strictEqual(s.text, 'Summary:\n- Food Rs. 5,900\n- Rent ₹20,000\nSavings rate is 12.5%.');
  assert.deepStrictEqual(s.removed, ['- Misc Rs. 1,111']);
});

test('sanitize: a citation after the full stop stays with its sentence', () => {
  const t = 'Limit is ₹1.5 lakh. [SOURCE_1] Extra ₹9,999 is allowed. [SOURCE_2] Done.';
  const s = C.sanitize(t, ['limit ₹1,50,000']);
  assert.strictEqual(s.text, 'Limit is ₹1.5 lakh. [SOURCE_1] Done.');
  assert.strictEqual(s.removed.length, 1);
  assert.ok(s.removed[0].includes('9,999'));
});

test('sanitize: if every sentence is removed, return the fixed refusal string', () => {
  const s = C.sanitize('Total is ₹8,000.', []);
  assert.strictEqual(s.text, "I can't verify the figures in that answer, so I'm not showing it.");
  assert.strictEqual(s.text, C.UNVERIFIED_MESSAGE);
  assert.strictEqual(s.blocked, true);
  assert.deepStrictEqual(s.removed, ['Total is ₹8,000.']);
  const two = C.sanitize('You paid ₹1,111. Then ₹2,222 more.', [tool(5)]);
  assert.strictEqual(two.text, C.UNVERIFIED_MESSAGE);
  assert.strictEqual(two.removed.length, 2);
});

test('sanitize: output always re-checks clean', () => {
  const ev = [tool(5900), tool(2100)];
  const s = C.sanitize('Food ₹5,900. Rent ₹2,100. Total ₹8,000, which is 40% of pay. Done.', ev);
  assert.strictEqual(s.text, 'Food ₹5,900. Rent ₹2,100. Done.');
  assert.strictEqual(C.check(s.text, ev).ok, true);
});

test('check: word numbers, signs and odd inputs', () => {
  assert.deepStrictEqual(amounts('one hundred percent sure'), []);
  assert.deepStrictEqual(amounts('ten thousand rupees'), [10000]);
  assert.strictEqual(C.check('Refund of ₹500', [tool(-500)]).ok, true);       // magnitude only
  assert.strictEqual(C.check('Spent ₹5,900', tool(5900)).ok, true);           // single (non-array) evidence item
  assert.strictEqual(C.check('Spent ₹5,900', '₹5,900 on food').ok, true);     // single string evidence
  assert.strictEqual(C.check(undefined, []).ok, true);
  assert.deepStrictEqual(C.extractNumbers(null), []);
  assert.strictEqual(C.sanitize(undefined, []).text, '');
});

test('modules are pure and dual-mode: no network / storage / system clock, and load as browser globals', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const dir = path.join(__dirname, '..', 'js', 'sml');
  const srcs = ['normalizer.js', 'numeric-check.js'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const src of srcs) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|Date\.now|new Date\s*\(|performance\.now|Math\.random/);
  }
  // Browser-style load: no `module`, a `window` global, normalizer first.
  const win = {};
  const ctx = vm.createContext({ window: win });
  srcs.forEach((src) => vm.runInContext(src, ctx));
  assert.strictEqual(typeof win.SmlNormalizer.parseAmount, 'function');
  assert.strictEqual(typeof win.SmlNumericCheck.check, 'function');
  assert.strictEqual(win.SmlNumericCheck.check('Spent ₹5,900', [{ ok: true, value: 5900 }]).ok, true);
  assert.strictEqual(win.SmlNormalizer.parseAmount('dedh lakh')[0].value_inr, 150000);
});
