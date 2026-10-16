// The phone's redaction is a port of the website's (js/finos-feedback.js). redactBase must equal it on every input; redact
// (what the phone really uses) must additionally remove the identifiers the website's rule lets through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { redact, redactBase, redactShort, MAX_COMMENT } from '../lib/redact.ts';

const web = createRequire(import.meta.url)('../../js/finos-feedback.js');

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Adversarial strings: every kind of identifier the person might type, in the shapes people actually type them. */
const CORPUS: string[] = [
  '', ' ', 'Great app', 'I earn ₹1,50,000 a month', 'Rs. 5,00,000 FD', 'rs 5 lakh', 'INR 12,00,000', 'inr12000', '12 lakh', '5k', '2.5 crore', '1.5cr', '₹500',
  'PAN ABCDE1234F here', 'pan abcde1234f', 'ABCDE1234F', 'my aadhaar 1234 5678 9012', 'aadhaar 1234-5678-9012', 'aadhaar 123456789012',
  'call 9876543210', 'call +91 98765 43210', 'call 98765-43210', 'call 98 76 54 32 10', 'phone: (022) 2345 6789', 'wa.me/919876543210',
  'mail me at asha.rao@gmail.com', 'ASHA@EXAMPLE.CO.IN', 'x+tag@sub.domain.org',
  'pay rahul@okhdfcbank', 'upi: 9876543210@ybl', 'asha.rao@paytm', 'name@oksbi and other@axl', '@mention',
  'account 123456789012', 'a/c no 0012 3456 7890 12', 'acct 50100123456789', 'card 4111 1111 1111 1111', 'IFSC HDFC0001234', 'ifsc sbin0004567',
  'ref1234', 'order #00091823', 'txn id UTR123456789012', 'OTP 482913', '8.75% rate', 'rated 3 of 5', 'about 10 15 years', 'age 34',
  'visit https://example.com/x?y=1', 'www.finos.app/page', 'http://192.168.1.4:8081/index.bundle',
  'five lakh rupees', 'twenty five thousand', 'fifty-five thousand', 'two crore', 'half a lakh', 'ten lakhs',
  '500 rupees', '50 rs', '$25', '$ 2500', '€1,200', '£99', '12 thousand', '3 million', '4.5 mn',
  'salary 85000 per month', 'EMI of Rs 23,456 for 20 years', 'SIP 5000 + 2500', '1,2,3,4,5', '1.2.3.4.5.6', '12-10-2026', '12/10/26', '01-02-03-04',
  'Unicode ₹ ٣٤٥٦ ４５６７', 'tab\tnew\nline', 'a'.repeat(900), '9'.repeat(30), '₹'.repeat(10),
];

const FRAGMENTS = ['₹', 'Rs', 'rs.', 'INR', '1', '22', '333', '4444', '55555', '9876543210', '98', '76', ',', '.', '-', ' ', '/', '@', 'a', 'Z', 'ABCDE', '1234', 'F', 'lakh', 'crore', 'k', 'cr', 'l',
  'okaxis', 'ybl', 'gmail', '.com', 'http://', 'www.', 'x', 'five', 'twenty', 'thousand', 'rupees', '$', '+91', '(', ')', '#', 'IFSC', 'HDFC0', 'pan'];

function randomInputs(n: number, seed: number): string[] {
  const R = rng(seed);
  return Array.from({ length: n }, () => Array.from({ length: 1 + Math.floor(R() * 14) }, () => FRAGMENTS[Math.floor(R() * FRAGMENTS.length)]).join(R() < 0.5 ? ' ' : ''));
}
const ALL = [...CORPUS, ...randomInputs(4000, 20261014)];

test('redactBase equals the website\'s FinosFeedback.redact on the corpus and 4,000 random strings', () => {
  assert.equal(typeof web.redact, 'function');
  for (const s of ALL) assert.equal(redactBase(s), web.redact(s), JSON.stringify(s.slice(0, 80)));
  assert.equal(MAX_COMMENT, web.MAX_COMMENT);
});

test('null, undefined and non-strings behave like the website', () => {
  for (const v of [null, undefined, 0, 12345, true, {}, [], ['a@b.com']]) assert.equal(redactBase(v), web.redact(v));
});

const LEAKS: [string, RegExp][] = [
  ['10-digit phone', /\d{4}/],
  ['spaced phone', /\d{2}\s\d{2}\s\d{2}/],
  ['e-mail', /@[a-z0-9-]+\.[a-z]/i],
  ['upi handle', /@(?:okhdfcbank|ybl|paytm|oksbi|axl|okaxis)\b/i],
  ['PAN', /[a-z]{5}\d{4}[a-z]/i],
  ['IFSC', /[a-z]{4}0[a-z0-9]{6}/i],
  ['link', /https?:\/\/|www\./i],
];

test('redact removes what the website rule lets through: UPI handles, spaced digits, lower-case PAN, IFSC, amounts in words', () => {
  const must: [string, RegExp[]][] = [
    ['pay rahul@okhdfcbank', [/okhdfcbank/]],
    ['upi: 9876543210@ybl', [/9876543210/, /ybl/]],
    ['asha.rao@paytm', [/asha/, /paytm/]],
    ['call 98 76 54 32 10', [/98 76/, /32 10/]],
    ['call +91 98765 43210', [/98765/, /43210/]],
    ['pan abcde1234f', [/abcde/i, /1234/]],
    ['IFSC HDFC0001234', [/HDFC0001234/]],
    ['ifsc sbin0004567', [/sbin0004567/i]],
    ['a/c no 0012 3456 7890 12', [/3456/, /7890/]],
    ['five lakh rupees', [/five/, /lakh/]],
    ['twenty five thousand', [/twenty/, /thousand/]],
    ['fifty-five thousand', [/fifty/]],
    ['500 rupees', [/500/]],
    ['$25', [/\$25/]],
    ['12-10-2026 to 01-02-03-04', [/01-02-03-04/]],
  ];
  for (const [input, gone] of must) {
    const out = redact(input);
    for (const re of gone) assert.ok(!re.test(out), `"${input}" -> "${out}" still matches ${re}`);
  }
  // and the website's rule alone does leak these (this is the reason redact exists; keep it honest)
  assert.match(web.redact('pay rahul@okhdfcbank'), /okhdfcbank/);
  assert.match(web.redact('call 98 76 54 32 10'), /98 76 54/);
});

test('digits of other scripts are redacted too (a Hindi-language user types a phone number in Devanagari)', () => {
  for (const s of ['९८७६५४३२१०', '٠٩٨٧٦٥٤٣٢١٠', '９８７６５４３２１０', '৯৮৭৬৫৪৩২১০', 'call ९८ ७६ ५४ ३२ १०', '₹१,५०,०००', 'अकाउंट १२३४५६७८९०']) {
    const out = redact(s);
    assert.ok(!/\p{Nd}{2}/u.test(out), `${s} -> ${out}`);
  }
  assert.equal(redact('४ में से ३'), '4 में से 3');
});

test('redact keeps ordinary feedback readable', () => {
  assert.equal(redact('The score felt right, thanks'), 'The score felt right, thanks');
  assert.equal(redact('rate 8.75% for 3 years, rated 4 of 5'), 'rate 8.75% for 3 years, rated 4 of 5');
  assert.equal(redact('  lots   of\n space '), 'lots of space');
  assert.equal(redact('Tax tab is slow'), 'Tax tab is slow');
});

test('redact: no 4-digit run, e-mail, link or handle survives 6,000 random strings; output is capped; running twice changes nothing', () => {
  for (const s of [...ALL, ...randomInputs(2000, 77)]) {
    const out = redact(s);
    assert.ok(!/\d{4}/.test(out), `4 digits survived: ${JSON.stringify(out)}`);
    assert.ok(!/[\w.+-]+@\w/.test(out), `handle survived: ${JSON.stringify(out)}`);
    assert.ok(!/(?:https?:\/\/|www\.)\S/i.test(out), `link survived: ${JSON.stringify(out)}`);
    assert.ok(out.length <= MAX_COMMENT);
    assert.equal(redact(out), out, `not idempotent: ${JSON.stringify(s.slice(0, 60))}`);
  }
});

test('redact on identifier classes: nothing in the LEAKS list survives', () => {
  const samples = ['9876543210', '+91 98765 43210', '98 76 54 32 10', 'a.b@gmail.com', 'rahul@okhdfcbank', '9876543210@ybl', 'ABCDE1234F', 'abcde1234f', 'HDFC0001234', 'http://x.y/z', 'www.x.in'];
  for (const s of samples) {
    const out = redact(`see ${s} please`);
    for (const [name, re] of LEAKS) assert.ok(!re.test(out), `${name} survived in "${out}" (from "${s}")`);
  }
});

test('redactShort caps length and still redacts', () => {
  const out = redactShort('x'.repeat(500) + ' 9876543210', 40);
  assert.ok(out.length <= 40);
  assert.ok(!/9876543210/.test(redactShort('call 9876543210', 100)));
});
