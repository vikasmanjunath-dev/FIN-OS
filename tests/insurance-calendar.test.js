const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'html', 'insurance-hub.html'), 'utf8');
const helperStart = source.indexOf('function policyAmount');
const helperEnd = source.indexOf('function loadPolicies', helperStart);
const calendarStart = source.indexOf('function renderPremiumCalendar');
const calendarEnd = source.indexOf('/* ── Add / Save / Delete ─── */', calendarStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart && calendarStart >= 0 && calendarEnd > calendarStart);

const helpers = new Function(`${source.slice(helperStart, helperEnd)}; return { policyAmount, sumPolicyAmount, policyRenewalParts, policyRenewalDays };`)();
const renderCalendar = new Function('document', 'INR', 'TYPE_META', 'policyAmount', 'policyRenewalParts',
  `${source.slice(calendarStart, calendarEnd)}; return renderPremiumCalendar;`);

test('web renewal countdown uses local calendar-day boundaries and rejects impossible dates', () => {
  const now = new Date(2026, 10, 1, 23, 55);
  assert.equal(helpers.policyRenewalDays('2026-11-02', now), 1);
  assert.equal(helpers.policyRenewalDays('2026-11-01', now), 0);
  assert.equal(helpers.policyRenewalDays('2026-10-31', now), -1);
  assert.equal(helpers.policyRenewalDays('2026-02-30', now), null);
  assert.equal(helpers.policyRenewalDays('2026-11-1', now), null);
  assert.equal(helpers.policyRenewalDays('', now), null);
});

test('web policy amount totals ignore malformed, negative and unsafe stored values', () => {
  assert.equal(helpers.policyAmount('12000oops'), 0);
  assert.equal(helpers.policyAmount(-12000), 0);
  assert.equal(helpers.policyAmount(Number.MAX_SAFE_INTEGER), 0);
  assert.equal(helpers.sumPolicyAmount([
    { type: 'health', sum_assured: '500000' },
    { type: 'health', sum_assured: 'bad' },
    { type: 'life_term', sum_assured: 900000 },
  ], 'sum_assured', 'health'), 500000);
});

test('premium calendar includes undated premiums in total but only valid dated policies in month bars', () => {
  const node = { innerHTML: '' };
  const document = { getElementById: () => node };
  const INR = n => `₹${n}`;
  const TYPE_META = { health: { label: 'Health' } };
  const render = renderCalendar(document, INR, TYPE_META, helpers.policyAmount, helpers.policyRenewalParts);
  render([
    { type: 'health', annual_premium: 12000, renewal_date: '2026-11-14' },
    { type: 'health', annual_premium: 3000, renewal_date: '' },
    { type: 'health', annual_premium: 5000, renewal_date: '2026-02-30' },
  ]);
  assert.match(node.innerHTML, /Annual premiums for all recorded policies: <strong[^>]*>₹20000<\/strong>/);
  assert.match(node.innerHTML, /The monthly chart groups dated policies by renewal month/);
  assert.match(node.innerHTML, /Nov[\s\S]*?₹12000/);
  assert.doesNotMatch(node.innerHTML, /Feb[\s\S]*?₹5000/);
});
