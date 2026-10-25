// The Hindi for the terms that come back again and again in Money Reels, with the other spellings and words that are in use or must go.
//
// STATUS: PROPOSED, not agreed. Every `hi` below is the tool-builder's starting point, picked from what the library and the app's own Hindi
// (lib/i18nHi.ts) already say most often. The native Hindi reader decides: change `hi`, `allowed` or `avoid` here and `npm run reels:hindi` re-lints
// the whole library against the new choice. Nothing in the reels is edited by this file.
// Where the reels and the app's own screens (lib/i18nHi.ts) say different things, the proposal follows the screens, so the whole app reads one way.
//
// How a term is read by the lint (lib/reels/hindi-lint.ts):
//  - kind 'acronym': the app prints these in Latin letters (SIP, EMI, KYC), so `hi` is the Latin form. Devanagari spellings (एसआईपी) are `avoid`.
//  - kind 'word': `hi` is the form the reader proposes; `allowed` are other forms that are fine alone but make the library inconsistent when mixed;
//    `avoid` are forms to replace. The English `match` is how the term is recognised in the English text, to check the Hindi renders it.
//  - A Latin-letter spelling of a 'word' term inside a Hindi sentence (a bare "emergency fund") is always flagged.
// All Devanagari here is compared after Unicode NFC, so a nukta typed as one character or two is the same.
export interface Term {
  id: string;
  kind: 'acronym' | 'word';
  /** The English term as people write it. */
  en: string;
  /** Regex source (case-insensitive) that finds the term in English text. */
  match: string;
  /** Proposed Hindi (for an acronym, the Latin form the app prints). */
  hi: string;
  /** Other written forms that are acceptable on their own. */
  allowed?: string[];
  /** Forms to replace with `hi`. */
  avoid?: string[];
  /** For an acronym: what it stands for, so the reader can judge whether a first use should spell it out. */
  full?: string;
  /** Why this choice, or what the app's own Hindi does. */
  note?: string;
}

const A = (id: string, full: string, avoid: string[], note?: string): Term => ({ id: id.toLowerCase(), kind: 'acronym', en: id, match: `\\b${id}\\b`, hi: id, avoid, full, ...(note ? { note } : {}) });

export const GLOSSARY: Term[] = [
  // ── acronyms the app prints in Latin letters ──────────────────────────────────────────────────────────────────────────────────────────
  A('SIP', 'Systematic Investment Plan', ['एसआईपी', 'एस आई पी']),
  A('EMI', 'Equated Monthly Instalment', ['ईएमआई', 'ई एम आई']),
  A('NAV', 'Net Asset Value', ['एनएवी']),
  A('OTP', 'One-Time Password', ['ओटीपी']),
  A('PIN', 'Personal Identification Number', []),
  A('CVV', 'Card Verification Value', ['सीवीवी']),
  A('KYC', 'Know Your Customer', ['केवाईसी']),
  A('UPI', 'Unified Payments Interface', ['यूपीआई']),
  A('FD', 'Fixed Deposit', ['एफडी', 'एफ़डी'], 'The app prints FD. "फिक्स्ड डिपॉज़िट" is allowed only where the reel is explaining what an FD is.'),
  A('PPF', 'Public Provident Fund', ['पीपीएफ']),
  A('EPF', 'Employees’ Provident Fund', ['ईपीएफ']),
  A('EPFO', 'Employees’ Provident Fund Organisation', ['ईपीएफओ']),
  A('PF', 'Provident Fund', ['पीएफ']),
  A('NPS', 'National Pension System', ['एनपीएस']),
  A('ELSS', 'Equity Linked Savings Scheme', ['ईएलएसएस']),
  A('ULIP', 'Unit Linked Insurance Plan', ['यूलिप']),
  A('ETF', 'Exchange Traded Fund', ['ईटीएफ']),
  A('IPO', 'Initial Public Offering', ['आईपीओ']),
  A('TDS', 'Tax Deducted at Source', ['टीडीएस']),
  A('ITR', 'Income Tax Return', ['आईटीआर']),
  A('GST', 'Goods and Services Tax', ['जीएसटी']),
  A('HRA', 'House Rent Allowance', ['एचआरए']),
  A('CTC', 'Cost to Company', ['सीटीसी']),
  A('AIS', 'Annual Information Statement', []),
  A('PAN', 'Permanent Account Number', ['पैन कार्ड'], '"पैन" alone is also the word for a frying pan, so only "पैन कार्ड" is listed.'),
  A('RBI', 'Reserve Bank of India', ['आरबीआई']),
  A('SEBI', 'Securities and Exchange Board of India', ['सेबी']),
  A('IRDAI', 'Insurance Regulatory and Development Authority of India', ['आईआरडीएआई']),
  A('PFRDA', 'Pension Fund Regulatory and Development Authority', ['पीएफआरडीए']),
  A('DICGC', 'Deposit Insurance and Credit Guarantee Corporation', ['डीआईसीजीसी']),
  A('ATM', 'Automated Teller Machine', ['एटीएम']),
  A('SMS', 'Short Message Service', ['एसएमएस']),
  A('SIM', 'Subscriber Identity Module', []),
  A('QR', 'Quick Response (code)', ['क्यूआर']),
  A('CIBIL', 'TransUnion CIBIL (credit bureau)', ['सिबिल']),

  // ── words ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'mutual-fund', kind: 'word', en: 'mutual fund', match: 'mutual funds?', hi: 'म्यूचुअल फ़ंड', allowed: [], avoid: ['म्यूचुअल फंड', 'म्युचुअल फंड', 'म्युचुअल फ़ंड', 'म्यूचुअल फण्ड', 'म्यूचल फंड'], note: 'App UI: म्यूचुअल फ़ंड.' },
  { id: 'fund', kind: 'word', en: 'fund', match: '\\bfunds?\\b', hi: 'फ़ंड', avoid: ['फंड', 'फण्ड'], note: 'With the nukta, as the app writes it.' },
  { id: 'emergency-fund', kind: 'word', en: 'emergency fund', match: 'emergency funds?', hi: 'आपातकालीन निधि', allowed: ['आपातकालीन फ़ंड'], avoid: ['इमरजेंसी फ़ंड', 'इमरजेंसी फंड', 'इमर्जेंसी फंड', 'इमरजेन्सी फंड', 'आपातकालीन फंड'], note: 'The app screens say आपातकालीन निधि; most reels say आपातकालीन फ़ंड. The reader should pick one for both.' },
  { id: 'credit-score', kind: 'word', en: 'credit score', match: 'credit scores?', hi: 'क्रेडिट स्कोर', avoid: ['क्रेडिट सकोर', 'ऋण स्कोर', 'साख अंक'] },
  { id: 'credit-card', kind: 'word', en: 'credit card', match: 'credit cards?', hi: 'क्रेडिट कार्ड', avoid: ['क्रेडिट कार्ड्स'] },
  { id: 'inflation', kind: 'word', en: 'inflation', match: 'inflation', hi: 'महँगाई', allowed: ['मुद्रास्फीति'], avoid: ['महंगाई', 'मँहगाई', 'इन्फ्लेशन', 'इन्फ़्लेशन', 'मंहगाई'], note: 'महँगाई with chandrabindu, as the app writes it. मुद्रास्फीति is the textbook word and reads formal.' },
  { id: 'interest', kind: 'word', en: 'interest', match: 'interest', hi: 'ब्याज', allowed: ['सूद'], avoid: ['इंटरेस्ट', 'इन्टरेस्ट'] },
  { id: 'compound-interest', kind: 'word', en: 'compound interest', match: 'compound interest', hi: 'चक्रवृद्धि ब्याज', allowed: ['चक्रवृद्धि'], avoid: ['कंपाउंड', 'कम्पाउंड', 'कंपाउंडिंग', 'कम्पाउंडिंग'] },
  { id: 'principal', kind: 'word', en: 'principal', match: 'principal', hi: 'मूलधन', avoid: ['प्रिंसिपल', 'प्रिन्सिपल', 'मूल रकम'] },
  { id: 'premium', kind: 'word', en: 'premium', match: 'premiums?', hi: 'प्रीमियम', avoid: ['प्रिमियम', 'प्रीमीयम'] },
  { id: 'term-plan', kind: 'word', en: 'term plan', match: 'term (plan|cover|insurance)', hi: 'टर्म प्लान', allowed: ['टर्म कवर', 'टर्म बीमा'], avoid: ['टर्म इंश्योरेंस', 'टर्म इन्श्योरेंस'] },
  { id: 'insurance', kind: 'word', en: 'insurance', match: 'insur(ance|er)', hi: 'बीमा', avoid: ['इंश्योरेंस', 'इन्श्योरेंस', 'इन्शुरन्स', 'इंश्योरर'] },
  { id: 'life-insurance', kind: 'word', en: 'life insurance', match: 'life (insurance|cover)', hi: 'जीवन बीमा', allowed: ['लाइफ़ कवर', 'लाइफ कवर', 'जीवन कवर', 'टर्म जीवन कवर'], avoid: ['लाइफ़ इंश्योरेंस', 'लाइफ इंश्योरेंस'] },
  { id: 'health-insurance', kind: 'word', en: 'health insurance', match: 'health (insurance|cover)', hi: 'स्वास्थ्य बीमा', allowed: ['हेल्थ बीमा', 'हेल्थ कवर'], avoid: ['हेल्थ इंश्योरेंस'], note: 'App UI: स्वास्थ्य बीमा. Reels also say हेल्थ कवर; the reader should pick one.' },
  { id: 'claim', kind: 'word', en: 'claim', match: 'claims?', hi: 'क्लेम', allowed: ['दावा'], avoid: ['क्लैम'] },
  { id: 'cover', kind: 'word', en: 'cover (insurance)', match: '\\bcover\\b', hi: 'कवर', avoid: ['कवरेज'] },
  { id: 'loan', kind: 'word', en: 'loan', match: 'loans?', hi: 'लोन', allowed: ['क़र्ज़', 'ऋण'], avoid: ['लॉन', 'कर्ज', 'कर्ज़'], note: 'लोन for the product, क़र्ज़ for the burden of owing. ऋण reads as official text.' },
  { id: 'borrow', kind: 'word', en: 'borrow / debt', match: 'debts?|borrow', hi: 'क़र्ज़', allowed: ['उधार', 'ऋण'], avoid: ['कर्ज', 'कर्ज़', 'कर्जा'] },
  { id: 'lender', kind: 'word', en: 'lender', match: 'lenders?', hi: 'लेनदार', allowed: ['बैंक या कंपनी'], avoid: ['लेंडर'] },
  { id: 'down-payment', kind: 'word', en: 'down payment', match: 'down ?payment', hi: 'डाउन पेमेंट', avoid: ['डाउनपेमेंट', 'डाउन पेमेन्ट'] },
  { id: 'prepayment', kind: 'word', en: 'prepayment', match: 'prepay(ment|ing)?', hi: 'प्रीपेमेंट', allowed: ['पहले चुकाना'], avoid: ['प्रिपेमेंट'] },
  { id: 'tenure', kind: 'word', en: 'tenure / term (years)', match: 'tenure', hi: 'अवधि', avoid: ['टेन्योर', 'टेनर', 'कार्यकाल'] },
  { id: 'instalment', kind: 'word', en: 'instalment', match: 'instal?lments?', hi: 'किस्त', avoid: ['क़िस्त', 'इंस्टॉलमेंट', 'इंस्टालमेंट'] },
  { id: 'investment', kind: 'word', en: 'investment', match: 'invest(ment|ing|or|ors)?', hi: 'निवेश', avoid: ['इन्वेस्टमेंट', 'इन्वेस्ट', 'इंवेस्ट', 'इन्वेस्टर'] },
  { id: 'return', kind: 'word', en: 'return (investing)', match: 'returns?', hi: 'रिटर्न', allowed: ['प्रतिफल'], avoid: ['रिटर्नस'] },
  { id: 'profit', kind: 'word', en: 'profit / gain', match: 'profit|gains?', hi: 'मुनाफ़ा', allowed: ['लाभ'], avoid: ['मुनाफा', 'प्रॉफिट', 'प्रोफ़िट'], note: 'Reels use both मुनाफ़ा and लाभ; the app UI uses मुनाफ़ा.' },
  { id: 'loss', kind: 'word', en: 'loss', match: '\\bloss(es)?\\b', hi: 'नुक़सान', allowed: ['घाटा'], avoid: ['नुकसान', 'नुक्सान'] },
  { id: 'risk', kind: 'word', en: 'risk', match: 'risk(y|s)?', hi: 'जोखिम', avoid: ['रिस्क', 'रिस्की'] },
  { id: 'diversification', kind: 'word', en: 'diversification', match: 'diversif', hi: 'विविधीकरण', allowed: ['अलग-अलग जगह लगाना'], avoid: ['डायवर्सिफिकेशन', 'डाइवर्सिफिकेशन', 'डायवर्सिफाई'] },
  { id: 'savings', kind: 'word', en: 'savings', match: 'savings?|saving\\b', hi: 'बचत', avoid: ['सेविंग', 'सेविंग्स'] },
  { id: 'salary', kind: 'word', en: 'salary', match: 'salar(y|ies)', hi: 'सैलरी', allowed: ['वेतन', 'तनख़्वाह'], avoid: ['तनख्वाह', 'पगार'], note: 'Three words are in use in the reels (वेतन, तनख़्वाह, सैलरी). The app screens say सैलरी (21) over वेतन (5).' },
  { id: 'income', kind: 'word', en: 'income', match: 'income', hi: 'आमदनी', allowed: ['आय'], avoid: ['इनकम'], note: 'Reels use आय (76) more than आमदनी (21); the app UI uses आमदनी (62). The reader should pick one.' },
  { id: 'expense', kind: 'word', en: 'expense / spending', match: 'expenses?|spend(ing)?', hi: 'ख़र्च', allowed: ['व्यय'], avoid: ['खर्च', 'खर्चा', 'एक्सपेंस'] },
  { id: 'budget', kind: 'word', en: 'budget', match: 'budget', hi: 'बजट', avoid: ['बजेट'] },
  { id: 'goal', kind: 'word', en: 'goal', match: 'goals?', hi: 'लक्ष्य', allowed: ['गोल'], avoid: [] },
  { id: 'tax', kind: 'word', en: 'tax', match: '\\btax(es)?\\b', hi: 'टैक्स', avoid: ['टेक्स', 'कर-बचत'], note: 'Bare "कर" is not checked: it is also the verb "do".' },
  { id: 'income-tax', kind: 'word', en: 'income tax', match: 'income[- ]tax', hi: 'आयकर', allowed: ['इनकम टैक्स'], avoid: ['इन्कम टैक्स'] },
  { id: 'tax-regime', kind: 'word', en: 'tax regime', match: 'regimes?', hi: 'व्यवस्था', allowed: ['रिजीम'], avoid: ['रेजीम', 'रिज़ीम', 'रेज़ीम', 'रेजिम'], note: 'App UI says व्यवस्था (पुरानी व्यवस्था); the reels say रिजीम. The reader should pick one for both.' },
  { id: 'deduction', kind: 'word', en: 'deduction', match: 'deductions?', hi: 'कटौती', avoid: ['डिडक्शन', 'डीडक्शन'] },
  { id: 'section', kind: 'word', en: 'section (80C)', match: '\\bsection\\b', hi: 'सेक्शन', allowed: ['धारा'], avoid: ['सैक्शन'], note: 'Reels use धारा (7) and सेक्शन (5) in the same way.' },
  { id: 'refund', kind: 'word', en: 'refund', match: 'refunds?', hi: 'रिफ़ंड', allowed: ['वापसी'], avoid: ['रिफंड', 'रिफण्ड'] },
  { id: 'capital-gains', kind: 'word', en: 'capital gains', match: 'capital gains?', hi: 'कैपिटल गेन्स', allowed: ['पूँजीगत लाभ'], avoid: ['कैपिटल गेन', 'कैपिटल गैन', 'पूंजीगत लाभ'] },
  { id: 'slab', kind: 'word', en: 'slab', match: 'slabs?', hi: 'स्लैब', avoid: ['स्लेब'] },
  { id: 'nominee', kind: 'word', en: 'nominee', match: 'nominees?|nomination', hi: 'नॉमिनी', allowed: ['नामित व्यक्ति'], avoid: ['नोमिनी', 'नामांकित', 'नामिनी'] },
  { id: 'will', kind: 'word', en: 'will (testament)', match: '\\bwill\\b(?= (and|or|can|decide|says))', hi: 'वसीयत', avoid: ['विल'] },
  { id: 'retirement', kind: 'word', en: 'retirement', match: 'retire(ment|d)?', hi: 'रिटायरमेंट', allowed: ['सेवानिवृत्ति'], avoid: ['रिटायरमैन्ट', 'रिटायर्मेंट'] },
  { id: 'pension', kind: 'word', en: 'pension', match: 'pensions?', hi: 'पेंशन', avoid: ['पैंशन', 'पेन्शन'] },
  { id: 'maturity', kind: 'word', en: 'maturity', match: 'matur(ity|es|ed|e)', hi: 'परिपक्वता', allowed: ['मैच्योरिटी'], avoid: [] },
  { id: 'deposit', kind: 'word', en: 'deposit', match: 'deposits?', hi: 'जमा', allowed: ['डिपॉज़िट'], avoid: ['डिपॉजिट'] },
  { id: 'account', kind: 'word', en: 'bank account', match: 'accounts?', hi: 'खाता', avoid: ['अकाउंट', 'एकाउंट', 'अकाउन्ट'] },
  { id: 'scam', kind: 'word', en: 'scam / fraud', match: 'scams?|fraud(s|ster)?|scammers?', hi: 'ठगी', allowed: ['धोखाधड़ी'], avoid: ['स्कैम', 'फ्रॉड', 'फ़्रॉड', 'घोटाला'], note: 'ठगी for the trick, धोखाधड़ी for the report you file.' },
  { id: 'helpline', kind: 'word', en: 'helpline', match: 'helpline', hi: 'हेल्पलाइन', avoid: ['हैल्पलाइन'] },
  { id: 'myth', kind: 'word', en: 'myth', match: 'myths?', hi: 'मिथक', avoid: ['मिथ'] },
  { id: 'rupee', kind: 'word', en: 'rupees', match: 'rupees?', hi: 'रुपये', allowed: ['रुपए'], avoid: ['रूपये', 'रूपए', 'रुपयें'], note: 'Spell it one way.' },
  { id: 'crore', kind: 'word', en: 'crore', match: 'crores?', hi: 'करोड़', avoid: ['करोड'], note: 'With the nukta (ड़).' },
  { id: 'lakh', kind: 'word', en: 'lakh', match: 'lakhs?', hi: 'लाख', avoid: ['लाक'] },
  { id: 'unit', kind: 'word', en: 'unit (of a fund)', match: '\\bunits?\\b', hi: 'यूनिट', allowed: ['इकाई'], avoid: ['यूनीट'] },
];

export const byId = (id: string): Term | undefined => GLOSSARY.find(t => t.id === id);

// Latin-letter strings that may stay inside Hindi text without being a leftover: the acronyms above, units and symbols from formulas, and the
// labels reels use for "Fund A / Plan B". Brand names and scam-message strings are judged by the reader, not listed here.
export const LATIN_OK = new Set<string>([
  ...GLOSSARY.filter(t => t.kind === 'acronym').map(t => t.en),
  'FY', 'ID', 'AS', 'ln', 'n', 'r', 'i', 'P', 'C', 'A', 'B', 'D', 'E', 'W', 'm', 'p', 'b', 'WhatsApp', 'FASTag', 'NHAI', 'VIP', 'BHK', 'YES', 'TV', 'AC', 'CCD', 'Wi-Fi', 'OK', 'AI', 'APY', 'XIRR', 'CAGR', 'GB', 'MB', 'KB', 'URL', 'PDF', 'ID', 'vs',
]);
