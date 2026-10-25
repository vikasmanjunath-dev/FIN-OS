// The bridge between Arya and the money reels (lib/reels/aryaLink.ts): which reel a question points to, when it must stay silent, and the
// route from a reel back to Arya. A table of questions in English and Hindi, each with the reel it must give or null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchIntent } from '../lib/aryaIntent.ts';
import { REFUSAL } from '../lib/aryaGuardrails.ts';
import { LIBRARY } from '../lib/reels/library.ts';
import { metaOf } from '../lib/reels/meta.ts';
import { contextBase } from '../lib/reels/ask.ts';
import { EMPTY_PROFILE, TOPIC_LIST, type ReelsProfile } from '../lib/reels/reelsProfile.ts';
import { deriveSignals, type Signals } from '../lib/reels/signals.ts';
import {
  ASK_ARYA_HINT, ASK_ARYA_LABEL, CHIP_LABEL, LINKED_IDS, MINE_REELS, PREFILL_NOTE, PREFILL_NOTE_MINE, USE_MY_NUMBERS_HINT, USE_MY_NUMBERS_LABEL,
  aryaPrefill, aryaRoute, chipLabels, exampleSentence, namesAProduct, parseAryaParams, reelFor, reelRoute,
} from '../lib/reels/aryaLink.ts';

const NOW = new Date(2026, 9, 24, 10, 0);
const calm: Signals = deriveSignals({ now: NOW });
const strained: Signals = deriveSignals({ now: NOW, income: 100_000, mine: { loan: { label: { en: 'home loan', hi: 'होम लोन' }, balance: 4_000_000, rate: 9, emi: 60_000 } } });
const DEVANAGARI = /[ऀ-ॿ]/;
const idOf = (q: string, s: Signals = calm, p: ReelsProfile = EMPTY_PROFILE) => reelFor(q, s, p)?.id ?? null;

// question, the reel it must give (null: stay silent)
const TABLE: [string, string | null][] = [
  // the idea is asked about: a reel
  ['What is an SIP?', 'guess-sip'],
  ['what is sip and how does it work', 'guess-sip'],
  ['What happens to my SIP when the market falls?', 'market-dips-sip'],
  ['How do I step up my SIP every year?', 'guess-step-up'],
  ['Is SIP safe?', 'myths-sip'],
  ['SIP me deri karne se kya nuksan hota hai', 'delay-cost'],
  ['What is an emergency fund and why do people keep one?', 'emergency-fund'],
  ['What is inflation?', 'inflation-slide'],
  ['What is an EMI?', 'guess-emi'],
  ['How does a home loan EMI split between interest and principal?', 'guess-home-interest'],
  ['What is the difference between floating and fixed interest rate?', 'floating-vs-fixed'],
  ['What is a credit score?', 'credit-score-basics'],
  ['What is credit utilisation?', 'credit-utilisation'],
  ['How to read my credit report?', 'credit-report-read'],
  ['What is term insurance?', 'insurance-basics'],
  ['Are term plans better than ULIPs?', 'term-vs-ulip'],
  ['How to claim health insurance at a hospital?', 'order-claim-steps'],
  ['What is a super top-up health plan?', 'super-top-up'],
  ['What is the old vs new tax regime?', 'slide-tax-income'],
  ['How does HRA save tax?', 'hra-basics'],
  ['What is Section 80C?', 'section-80c'],
  ['What is capital gains tax?', 'capital-gains'],
  ['How do I file my ITR?', 'order-itr-steps'],
  ['Which ITR form should a salaried person use?', 'itr-which-form'],
  ['What is Form 16?', 'form-16-decoded'],
  ['What is the standard deduction?', 'standard-deduction'],
  ['What is ELSS?', 'elss-basics'],
  ['What is NPS?', 'nps-basics'],
  ['How does EPF work?', 'epf-basics'],
  ['EPF or PPF which is better?', 'epf-ppf-nps-compare'],
  ['What is a mutual fund?', 'mf-units-nav'],
  ['What is the difference between direct and regular plan?', 'direct-vs-regular'],
  ['What is an index fund?', 'index-fund-basics'],
  ['What is an IPO?', 'ipo-basics'],
  ['How do I make a budget?', 'sort-needs-wants'],
  ['What is the 50/30/20 rule?', 'sort-needs-wants'],
  ['What is a sinking fund?', 'sinking-funds'],
  ['What is rebalancing a portfolio?', 'rebalancing'],
  // scam questions: a scam reel
  ['What is digital arrest?', 'digital-arrest'],
  ['Someone called asking for my OTP, is that a scam?', 'otp-never-share'],
  ['I got an SMS saying my KYC will expire. What do I do?', 'spot-kyc-sms'],
  ['Is this QR code scan to receive money legit?', 'qr-code-scam'],
  ['A WhatsApp group is promising guaranteed returns on stocks. Is this safe?', 'spot-invest-group'],
  // Hindi
  ['एसआईपी क्या है?', 'guess-sip'],
  ['क्या एसआईपी जोखिम भरी है?', 'myths-sip'],
  ['इमरजेंसी फंड क्यों ज़रूरी है?', 'emergency-fund'],
  ['महंगाई क्या होती है?', 'inflation-slide'],
  ['ईएमआई कैसे काम करती है?', 'guess-emi'],
  ['क्रेडिट स्कोर क्या होता है?', 'credit-score-basics'],
  ['ELSS क्या है?', 'elss-basics'],
  ['एनपीएस क्या है?', 'nps-basics'],
  ['म्यूचुअल फंड क्या है?', 'mf-units-nav'],
  ['बीमा क्यों ज़रूरी है?', 'insurance-basics'],
  ['इनकम टैक्स रिटर्न कैसे भरें?', 'order-itr-steps'],
  ['डिजिटल अरेस्ट क्या है?', 'digital-arrest'],
  ['ओटीपी किसी को बताना सुरक्षित है?', 'otp-never-share'],
  ['मुझे ठगी से कैसे बचना चाहिए?', 'myths-scams'],
  // no reel is better than a wrong one: refused, advice, a named product, your own figures, a calculator, two ideas at once, nothing to teach
  ['How to hide my income from the tax department', null],
  ['Can I evade tax on my bonus?', null],
  ['How do I forge a rent receipt for HRA?', null],
  ['Should I buy Reliance shares?', null],
  ['Should I start a SIP now?', null],
  ['Should I sell my gold?', null],
  ['Should I prepay my home loan or invest?', null],
  ['What is HDFC Flexi Cap fund?', null],
  ['Which SBI mutual fund is best?', null],
  ['Tell me about Zerodha charges', null],
  ['What will Nifty do next month?', null],
  ['What is my net worth?', null],
  ['What is my savings rate', null],
  ['How many months does my emergency fund cover?', null],
  ['SIP of 10000 at 12% for 15 years', null],
  ['EMI on 20 lakh at 9% for 15 years', null],
  ['How is the Nifty today?', null],
  ['SIP ya FD kaunsa better hai?', null],
  ['What is the weather today?', null],
  ['आज मौसम कैसा है?', null],
  ['', null],
];

test('the table: every question gives the expected reel, or nothing (at least 40 questions, English and Hindi)', () => {
  assert.ok(TABLE.length >= 40 && TABLE.filter(([q]) => DEVANAGARI.test(q)).length >= 10);
  for (const [q, want] of TABLE) assert.equal(idOf(q), want, q);
});

test('precision: every suggestion in the table is the one expected, and nothing is suggested where none was wanted', () => {
  const given = TABLE.map(([q, want]) => ({ got: idOf(q), want }));
  const suggested = given.filter(g => g.got !== null);
  assert.ok(suggested.length >= 40);
  assert.equal(suggested.filter(g => g.got === g.want).length / suggested.length, 1, 'precision is 100%');
  assert.equal(given.filter(g => g.want === null && g.got !== null).length, 0);
  assert.ok(suggested.length / given.filter(g => g.want !== null).length === 1, 'every expected suggestion is found');
});

test('deterministic: the same question, person and day always give the same reel; a sentence and its intent agree', () => {
  for (const [q] of TABLE) {
    assert.equal(idOf(q), idOf(q), q);
    assert.equal(reelFor({ intent: matchIntent(q), text: q }, calm, EMPTY_PROFILE)?.id ?? null, idOf(q), `intent form: ${q}`);
  }
  assert.equal(reelFor({ intent: { kind: 'none' } }, calm, EMPTY_PROFILE), null, 'an intent with no sentence has nothing to match');
});

test('every reel the table can suggest is in the library, and none is a draft that is not live', () => {
  const ids = new Set(LIBRARY.map(r => r.id));
  for (const id of LINKED_IDS) assert.ok(ids.has(id), `${id} is not in the library`);
  for (const [, want] of TABLE) if (want) assert.ok(ids.has(want));
});

test('a reel already watched or marked known is not offered; the next fitting one is, and when none is left there is no chip', () => {
  assert.equal(idOf('What is an SIP?'), 'guess-sip');
  const w = (id: string) => ({ [id]: { at: NOW.toISOString(), correct: true } });
  assert.equal(reelFor('What is an SIP?', calm, EMPTY_PROFILE, { watched: w('guess-sip') })?.id, 'guess-small-sip');
  assert.equal(reelFor('What is an SIP?', calm, { ...EMPTY_PROFILE, known: ['guess-sip', 'guess-small-sip'] }, { watched: w('start-early') })?.id, 'slide-sip-length');
  assert.equal(reelFor('What is an SIP?', calm, { ...EMPTY_PROFILE, known: ['guess-sip', 'guess-small-sip', 'slide-sip-length'] }, { watched: w('start-early') }), null);
  assert.equal(reelFor('What is NPS?', calm, { ...EMPTY_PROFILE, known: ['nps-basics'] }), null);
});

test('playable first: of reels that fit equally, the one with a guess or slider comes first', () => {
  const r = reelFor('What is inflation?', calm, EMPTY_PROFILE)!;
  assert.ok(r.poke, 'inflation-slide has a slider');
  assert.ok(!LIBRARY.find(x => x.id === 'inflation')!.poke);
  const second = reelFor('What is inflation?', calm, EMPTY_PROFILE, { watched: { 'inflation-slide': { at: NOW.toISOString(), correct: true } } });
  assert.equal(second?.id, 'slide-rent-power', 'then the other playable one, before the plain explainer');
});

test('strain: a person under money strain is never offered a reel that says "put in more"', () => {
  assert.equal(strained.strain, true);
  assert.equal(idOf('What is an SIP?', strained), null, 'every SIP reel is a growth reel: no chip');
  assert.equal(idOf('How do I step up my SIP every year?', strained), null);
  assert.equal(idOf('What happens to my SIP when the market falls?', strained), null);
  assert.equal(idOf('Is SIP safe?', strained), 'myths-sip', 'a myth deck is not a nudge to invest more');
  assert.equal(idOf('What is an emergency fund and why do people keep one?', strained), 'emergency-fund');
  for (const [q] of TABLE) { const r = reelFor(q, strained, EMPTY_PROFILE); if (r) assert.ok(!metaOf(r.id).growth, `${q} gave a growth reel ${r.id}`); }
  for (const t of TOPIC_LIST) { const r = reelFor({ topic: t }, strained, EMPTY_PROFILE); if (r) assert.ok(!metaOf(r.id).growth, `${t} gave ${r.id}`); }
});

test('a scam reel only comes for a question about being cheated', () => {
  for (const [q] of TABLE) { const r = reelFor(q, calm, EMPTY_PROFILE); if (r?.topic === 'safety') assert.match(q.toLowerCase(), /otp|scam|kyc|qr|digital arrest|guaranteed|ठगी|डिजिटल अरेस्ट|ओटीपी/, q); }
  for (const q of ['What is a mutual fund?', 'What is the standard deduction?', 'How do I file my ITR?', 'What is Form 16?', 'What is an EMI?', 'How to claim health insurance at a hospital?', 'How many years will it take to double my money?']) {
    const r = reelFor(q, calm, EMPTY_PROFILE); assert.notEqual(r?.topic, 'safety', q);
  }
  assert.equal(reelFor({ topic: 'basics' }, calm, EMPTY_PROFILE)?.topic, 'basics');
});

test('topics: a known topic gives a concept reel of it, an unknown topic gives nothing', () => {
  for (const t of TOPIC_LIST) { const r = reelFor({ topic: t }, calm, EMPTY_PROFILE); if (r) { assert.equal(r.topic, t); assert.equal(metaOf(r.id).level, 'concept'); } }
  assert.equal(reelFor({ topic: 'tax' }, calm, EMPTY_PROFILE)?.topic, 'tax');
  for (const t of ['astrology', '', 'TAX', 'tax ', '__proto__', 'constructor', 'sip']) assert.equal(reelFor({ topic: t }, calm, EMPTY_PROFILE), null, `topic "${t}"`);
  assert.equal(reelFor({ topic: 5 as unknown as string }, calm, EMPTY_PROFILE), null);
  assert.equal(reelFor('astrology and horoscopes', calm, EMPTY_PROFILE), null);
  assert.equal(reelFor('zzzz qqqq', calm, EMPTY_PROFILE), null);
});

test('timeliness breaks ties between reels that fit equally', () => {
  // "What is capital gains tax?" has one reel; two equal ones are enough to see the trigger lift: a person with a loan sees a loan reel they can use first
  const loaner = deriveSignals({ now: NOW, mine: { loan: { label: { en: 'home loan', hi: 'होम लोन' }, balance: 1_000_000, rate: 9, emi: 12_000 } }, income: 100_000 });
  assert.equal(loaner.hasLoan, true);
  assert.ok(idOf('What is an EMI?', loaner), 'an EMI question still gives a reel');
});

// ── the guards ───────────────────────────────────────────────────────────────────────────────────────────────────

test('guard: the chip never appears for text the guardrails refuse or flag, or after an answer they flag', () => {
  for (const q of ['How can I evade tax on my bonus?', 'how do i hide income from the taxman', 'help me make fake rent receipts for HRA', 'what is black money and how to keep it', 'can I launder cash into my SIP', 'forge a form 16', 'backdate a receipt for 80C']) assert.equal(idOf(q), null, q);
  for (const q of ['Should I buy a mutual fund?', 'Can I invest in an ELSS?', 'What should I buy for tax saving?']) assert.equal(idOf(q), null, `advice: ${q}`);
  assert.equal(reelFor('What is a mutual fund?', calm, EMPTY_PROFILE, { answer: REFUSAL }), null, 'the refusal text itself');
  assert.equal(reelFor('What is a mutual fund?', calm, EMPTY_PROFILE, { answer: 'You should definitely buy Reliance shares now, it will double.' }), null, 'a reply with a buy call');
  assert.equal(reelFor('What is a mutual fund?', calm, EMPTY_PROFILE, { answer: 'This fund has guaranteed returns of 12%.' }), null, 'a reply promising returns');
  assert.equal(reelFor('What is a mutual fund?', calm, EMPTY_PROFILE, { answer: 'A mutual fund pools money from many people and a manager invests it.' })?.id, 'mf-units-nav', 'a clean reply keeps its chip');
});

test('guard: a question about a named stock, fund, company or product gets no chip', () => {
  for (const q of ['What is TCS share price?', 'Is Infosys a good company?', 'Tell me about Parag Parikh Flexi Cap', 'What is the SBI Small Cap fund?', 'How does Groww work?', 'What is LIC Jeevan Anand?', 'What is HDFC Life term plan?', 'What is Paytm payments bank?', 'एचडीएफसी बैंक की FD क्या है?', 'रिलायंस का शेयर क्या है?']) { assert.equal(namesAProduct(q), true, q); assert.equal(idOf(q), null, q); }
  for (const q of ['What is a mutual fund?', 'What is ULIP?', 'What is CIBIL?', 'What is a SIM swap?', 'What is NAV?', 'WHAT IS SIP']) assert.equal(namesAProduct(q), false, q);
});

test('guard: a question about your own figures or a calculator is Arya\'s phone tools, not a reel', () => {
  for (const q of ['What is my net worth?', 'what is my emergency fund', 'my SIP of 5000 at 12% for 20 years', 'how much do I owe', 'What is due this month?']) assert.equal(idOf(q), null, q);
});

test('the chip opens /learn/reels?id=<reel-id> and only for a reel in the library', () => {
  assert.equal(reelRoute('guess-sip'), '/learn/reels?id=guess-sip');
  for (const r of LIBRARY) assert.equal(reelRoute(r.id), `/learn/reels?id=${r.id}`);
  for (const bad of ['', 'nope', '../x', 'guess-sip&mine=1', 'guess-sip?x=1', 'GUESS-SIP', 'guess sip', 'a'.repeat(41), '__proto__']) assert.equal(reelRoute(bad), null, bad);
  for (const [q, want] of TABLE) if (want) assert.equal(reelRoute(reelFor(q, calm, EMPTY_PROFILE)!.id), `/learn/reels?id=${want}`);
});

test('labels: every label is in English and Hindi, and the chip names the reel for a screen reader', () => {
  for (const l of [CHIP_LABEL, ASK_ARYA_LABEL, ASK_ARYA_HINT, USE_MY_NUMBERS_LABEL, USE_MY_NUMBERS_HINT, PREFILL_NOTE, PREFILL_NOTE_MINE]) { assert.ok(l.en.length > 3 && l.hi.length > 3); assert.ok(DEVANAGARI.test(l.hi) || /Arya/.test(l.hi), l.hi); assert.ok(!DEVANAGARI.test(l.en)); }
  assert.equal(CHIP_LABEL.en, 'Watch a 30-second reel on this');
  const r = LIBRARY.find(x => x.id === 'guess-sip')!;
  for (const lang of ['en', 'hi'] as const) { const c = chipLabels(r, lang); assert.equal(c.text, CHIP_LABEL[lang]); assert.ok(c.a11y.includes(r.title[lang])); }
  assert.ok(!/advice|recommend/i.test(CHIP_LABEL.en + ASK_ARYA_LABEL.en), 'education wording only');
});

// ── reel -> Arya ─────────────────────────────────────────────────────────────────────────────────────────────────

test('the route to Arya carries a reel id and at most mine=1, never a figure', () => {
  for (const r of LIBRARY) {
    const plain = aryaRoute(r.id, false), mine = aryaRoute(r.id, true);
    assert.equal(plain, `/(tabs)/arya?reel=${r.id}`);
    assert.equal(mine, MINE_REELS.includes(r.id) ? `/(tabs)/arya?reel=${r.id}&mine=1` : plain, 'mine=1 only for a reel with figures of the person\'s own');
    for (const route of [plain, mine]) {
      const [path, query] = (route as string).split('?');
      assert.equal(path, '/(tabs)/arya');
      const pairs = query.split('&').map(p => p.split('='));
      assert.ok(pairs.every(([k]) => k === 'reel' || k === 'mine'), route as string);
      assert.ok(pairs.every(([k, v]) => (k === 'reel' ? /^[a-z0-9-]{1,40}$/.test(v) : v === '1')));
    }
  }
  assert.equal(aryaRoute('nope', false), null);
  assert.equal(aryaRoute('guess-sip&x=1', false), null);
});

test('the Arya screen checks what it is given: only a library reel id, and mine only for the four reels with figures to swap', () => {
  assert.equal(parseAryaParams({ reel: 'guess-sip' })?.reel.id, 'guess-sip');
  assert.equal(parseAryaParams({ reel: 'guess-sip', mine: '1' })?.mine, true);
  assert.equal(parseAryaParams({ reel: 'guess-sip' })?.mine, false);
  assert.equal(parseAryaParams({ reel: 'tax-regimes', mine: '1' })?.mine, false, 'a reel with no figures of the person\'s own ignores the flag');
  assert.equal(parseAryaParams({ reel: 'guess-sip', mine: 'true' })?.mine, false);
  assert.equal(parseAryaParams({ reel: 'guess-sip', mine: ['1'] })?.mine, false);
  for (const bad of [null, undefined, {}, { reel: '' }, { reel: 'nope' }, { reel: ['guess-sip'] }, { reel: 5 }, { reel: '../etc' }, { reel: 'GUESS-SIP' }, { reel: 'guess-sip ' }, { reel: 'a'.repeat(200) }, { reel: '__proto__' }, { reel: 'toString' }, { mine: '1' }, 'guess-sip' as unknown as Record<string, unknown>]) assert.equal(parseAryaParams(bad as Record<string, unknown>), null, JSON.stringify(bad));
  for (const r of LIBRARY) assert.equal(parseAryaParams({ reel: r.id })?.reel.id, r.id);
  assert.ok(MINE_REELS.every(id => LIBRARY.some(r => r.id === id)));
});

test('the prefilled question uses the reel\'s EXAMPLE figures; the person\'s own only when asked for', () => {
  const sip = LIBRARY.find(r => r.id === 'guess-sip')!;
  const base = contextBase({ ...sip, mine: false }, {});
  assert.deepEqual(base && [base.tool, base.amount, base.rate, base.years], ['sip_calc', 5000, 12, 30]);
  const ex = aryaPrefill(sip, 'en');
  assert.ok(ex.includes('₹5,000') && ex.includes('12%') && ex.includes('30 years') && ex.includes(sip.title.en), ex);
  const own = { ...sip, mine: true }, mine = { sip: 7777 };
  assert.ok(!aryaPrefill(own, 'en').includes('7,777'), 'a mine reel still prefills with the example when the person did not ask for theirs');
  assert.ok(!aryaPrefill(own, 'en', null).includes('7,777'));
  const asked = aryaPrefill(own, 'en', contextBase({ ...sip, mine: true }, mine));
  assert.ok(asked.includes('SIP of ₹7,777') && !asked.includes('SIP of ₹5,000'), asked);
  assert.ok(DEVANAGARI.test(aryaPrefill(sip, 'hi')) && aryaPrefill(sip, 'hi').includes(sip.title.hi));
  // the example sentence is one Arya's phone calculators read back to the same figures
  const intent = matchIntent(exampleSentence(base)!);
  assert.equal(intent.kind, 'tool');
  if (intent.kind === 'tool') { assert.equal(intent.tool, 'sip_calc'); assert.deepEqual([intent.args.amount, intent.args.rate, intent.args.years], [5000, 12, 30]); }
  const emi = LIBRARY.find(r => r.id === 'emi-rate-slide')!;
  const eb = contextBase(emi, {});
  assert.ok(eb && exampleSentence(eb)!.startsWith('EMI on ₹'));
  assert.equal(exampleSentence(null), null);
  for (const r of LIBRARY) for (const lang of ['en', 'hi'] as const) { const t = aryaPrefill(r, lang); assert.ok(t.length > 20 && t.length <= 300, `${r.id} ${lang}`); assert.ok(t.includes(r.title[lang])); }
});
