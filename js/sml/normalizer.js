/**
 * SmlNormalizer — deterministic Indian number / language / month normaliser for the SML layer.   (v1.0)
 *
 * Pure functions: no network, no storage, no system clock (every date function takes `now`).
 *
 *   SmlNormalizer.parseAmount('Rent ₹1,40,000 and dedh lakh bonus')
 *     → [{raw:'₹1,40,000', value_inr:140000, start:5, end:14}, {raw:'dedh lakh', value_inr:150000, ...}]
 *   SmlNormalizer.formatInr(140000)        → '₹1,40,000'
 *   SmlNormalizer.formatShort(140000)      → '₹1.4 L'      (2.5 Cr, 11.2K)
 *   SmlNormalizer.detectLanguage(text)     → {lang:'en'|'hi'|'hi-en', confidence}
 *   SmlNormalizer.monthRef('pichhle mahine', new Date(2026, 9, 16)) → '2026-09'
 *
 * ── Money detection rules (what parseAmount() returns) ───────────────────────────────────────────────
 *  A figure is MONEY when ANY of these cues is present:
 *    - currency prefix  : ₹  Rs  Rs.  INR  रु            (e.g. "₹ 3.2L", "Rs. 50,000")
 *    - currency suffix  : "/-"  rupees  rupaye  रुपये  rs  inr   (e.g. "1,25,000/-", "50 rupees")
 *    - a unit word      : crore/cr/crs, lakh/lac/lacs, hazaar/hazar/thousand/k, sau/hundred, million, billion
 *                         (digits: "1.5 cr", "50 K", "3.2L"; words: "do lakh", "das hazaar", "paanch sau")
 *  Hinglish fractions are understood: dedh=1.5, dhai/dhaai/adhai=2.5, sawa=+0.25 ("sawa lakh"=1.25 L),
 *  paune X = X-0.25 ("paune do lakh"=1.75 L), sadhe X = X+0.5. Compounds add: "2 lakh 50 thousand"=250000.
 *  A trailing ranged unit applies to both ends: "5-6 lakh" → 5 lakh and 6 lakh.
 *  Single-letter units: "K" any case ("50k", "50 K"); "L" only as "3.2L" (attached) or an upper-case "3.2 L";
 *  a lower-case detached "5 l" is NOT lakh.
 *
 *  A BARE number (no currency, no unit) is MONEY only when ALL hold:
 *    1. it is NOT a percentage (followed by %, percent, per cent, pct, प्रतिशत, फीसदी);
 *    2. it is NOT a year: a whole number 1900–2100 written without comma/decimal ("2026") is a YEAR
 *       (kind 'year'), never money;
 *    3. its value is >= 100  (bare 1..99 are counts / day numbers / list numbers, never money);
 *    4. it has fewer than 10 integer digits when unformatted (10+ unformatted digits = phone/account id);
 *    5. it is not followed by a count/time word (years, months, days, bps, transactions, units, sq ft …);
 *    6. it is not an ordinal ("5th"), is not glued to letters ("A1234", "5000abc") and is not inside a
 *       masked region (see below).
 *  Masked (ignored) regions — see maskNonAmounts(): citation markers [SOURCE_1] / [1], FY/AY & year ranges
 *  (FY 2025-26, 2025-26), income-tax sections (Section 80C, 80CCD(1B), 87A, 115BAC, 24(b), 10(10D)),
 *  reference numbers (Form 16, Step 2, Tier 2, Option 3), dates ("15 March", "March 2026", "15/03/2026",
 *  "2026-09"), times, URLs, phone / card / Aadhaar-like groups, "ending 1234" style ids and list numbering
 *  ("1.", "2)") at the start of a line.
 *
 * `scanNumbers(text, {yearPolicy})` is the shared tokenizer (also used by SmlNumericCheck). yearPolicy
 * 'always' (default; what parseAmount uses) never reads an uncued 1900–2100 number as money; 'context'
 * reads it as a year only when a year cue is nearby (in/since/from/till/by/during/FY/budget … or
 * "onwards"), otherwise as money — the safer choice for verification.
 *
 * Numbers are written exactly as typed; this module never "corrects" a figure.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlNormalizer = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ───────────────────────────── text normalisation (length-preserving) ─────────────────────────────
  // Every replacement is 1 char → 1 char so offsets into the normalised text are valid in the original.
  function normText(text) {
    return String(text == null ? '' : text)
      .replace(/[०-९]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x0966 + 48)) // Devanagari digits
      .replace(/ज़/g, 'ज').replace(/ड़/g, 'ड').replace(/ढ़/g, 'ढ') // ज़ ड़ ढ़ → base letter
      .replace(/[   ​-‍﻿]/g, ' ')
      .replace(/[‘’]/g, "'");
  }

  const L = '\\p{L}\\p{M}\\p{N}';           // "word" characters, Unicode-aware (JS \b is ASCII only)
  const SP = '[^\\S\\r\\n]';                // whitespace but not a newline
  const NK = '\\u093C?';                    // optional Devanagari nukta

  // ───────────────────────────── ignorable regions ─────────────────────────────
  const MONTH_ALT = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';
  const CITE_WORD = '(?:source|sources|src|tool|ref|cite|citation|doc|document|chunk|note|fn|kb|rag|s|c|t)';
  const CUR_BEFORE = `(?<!(?:₹|\\bRs\\.?|\\bINR)${SP}*)`;     // not directly after a currency symbol
  const SEC_PAREN = '\\((?:\\d{1,2}[A-Za-z]{0,2}|[A-Za-z]{1,2})\\)';
  const UNIT_GUARD = new RegExp(`^${SP}*(?:%|percent\\b|k\\b|l\\b|crs?\\b|crores?\\b|lakhs?\\b|lacs?\\b|hazaar\\b|thousand\\b|million\\b|/-|rupees?\\b|rs\\b|inr\\b)`, 'i');

  // [regex, guard]: guard=true → leave the match alone when a money unit/currency word follows it.
  const MASKS = [
    // URLs
    [/https?:\/\/\S+|www\.\S+/giu, false],
    // citation markers: [SOURCE_1] [1] [Tool 3] [SOURCE_1, SOURCE_2] [TOOL_RESULT_2]
    [new RegExp(`\\[(?:${CITE_WORD}[\\s_:#-]*)?\\d{1,3}(?:\\s*[,;]\\s*(?:${CITE_WORD}[\\s_:#-]*)?\\d{1,3})*\\]|\\[[A-Z]+(?:_[A-Z]+)*_\\d{1,3}\\]`, 'giu'), false],
    // FY / AY / financial year
    [new RegExp(`\\b(?:F\\.?Y\\.?|A\\.?Y\\.?)${SP}*['’]?${SP}*(?:\\d{4}|\\d{2})(?!\\d)(?:${SP}*[-–/]${SP}*(?:\\d{4}|\\d{2})(?!\\d))?`, 'giu'), false],
    [new RegExp(`\\b(?:financial|assessment|fiscal)${SP}+year${SP}+(?:19|20)\\d{2}(?:${SP}*[-–/]${SP}*\\d{2,4})?`, 'giu'), false],
    // ISO dates / months, then year ranges "2025-26", "2024-2025"
    [new RegExp(`${CUR_BEFORE}(?<![\\d,.-])\\b(?:19|20)\\d{2}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\\d|3[01]))?(?![\\d])`, 'giu'), false],
    [new RegExp(`${CUR_BEFORE}(?<![\\d,.])\\b(?:19|20)\\d{2}${SP}*[-–/]${SP}*(?:(?:19|20)\\d{2}|\\d{2})(?!\\d)`, 'giu'), false],
    // income-tax sections
    [new RegExp(`\\b(?:sections?|sec\\.?|u/s)${SP}*\\d+[A-Za-z]{0,5}(?:${SP}*${SEC_PAREN})*(?:${SP}*(?:,|and|&|/|to)${SP}*\\d+(?:[A-Za-z]{1,5}(?:${SP}*${SEC_PAREN})*|(?:${SP}*${SEC_PAREN})+))*`, 'giu'), true],
    [new RegExp(`(?<![\\d,.])\\b80(?:CCC|CCD|CCE|C|DDB|DD|D|EEA|EEB|EE|E|GGA|GGB|GGC|GG|G|IAB|IBA|IA|IB|IC|ID|JJAA|JJA|LA|M|P|QQB|RRB|Q|TTA|TTB|U|V)(?![A-Za-z0-9])(?:${SP}*${SEC_PAREN})*`, 'giu'), false],
    [new RegExp(`${CUR_BEFORE}(?<![\\d,.])\\b\\d{2,3}(?!(?:K|L|M|B|CR|CRS|CRORES?|LAKHS?|LACS?|LAC|LPA|CTC|MN|BN)(?![A-Za-z]))[A-Z]{1,4}(?:${SP}*${SEC_PAREN})*(?![A-Za-z0-9])`, 'gu'), false],
    [new RegExp(`${CUR_BEFORE}(?<![\\d,.])\\b\\d{1,3}[A-Za-z]{0,4}(?:${SEC_PAREN})+`, 'giu'), true],
    // reference numbers: Form 16, Step 2, Tier 2, Rule 114B, #3
    [new RegExp(`\\b(?:form|schedule|rules?|article|chapter|clause|para|paragraph|regulation|circular|notification|table|figure|fig|step|page|pg|tier|phase|stage|option|scenario|slide)\\b\\.?${SP}*[-#:.]?${SP}*\\d{1,3}(?:(?!(?:k|l|cr|crs|crore|crores|lakh|lakhs|lac|lacs)(?![A-Za-z]))[A-Za-z]{1,3}(?![A-Za-z]))?(?:/\\d{1,3}[A-Za-z]{0,3})?(?![\\d,]\\d|\\.\\d)`, 'giu'), true],
    [/(?<![\w])#\d{1,3}(?![\d,]\d)/giu, true],
    // dates and times
    [new RegExp(`${CUR_BEFORE}(?<![\\d,.])\\b\\d{1,2}(?:st|nd|rd|th)?(?:${SP}+(?:of${SP}+)?|[-/.])(?:${MONTH_ALT})\\b\\.?(?:,?${SP}*(?:19|20)\\d{2}(?!\\d))?`, 'giu'), false],
    [new RegExp(`\\b(?:${MONTH_ALT})\\b\\.?,?${SP}*['’]?(?:(?:19|20)\\d{2}|\\d{2}(?![\\d,.]))\\b`, 'giu'), false],
    [new RegExp(`\\b(?:${MONTH_ALT})\\b\\.?${SP}+\\d{1,2}(?:st|nd|rd|th)?(?![\\d,]\\d|\\.\\d)(?:,?${SP}*(?:19|20)\\d{2}(?!\\d))?`, 'giu'), true],
    [/(?<![\d,.])\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)?\d{2}(?!\d)/giu, false],
    [/(?<![\d,.])\b\d{1,2}[/-](?:19|20)\d{2}(?!\d)/giu, false],
    [new RegExp(`\\b\\d{1,2}:\\d{2}(?::\\d{2})?(?:${SP}*[ap]\\.?m\\b\\.?)?`, 'giu'), false],
    // phone / card / Aadhaar-like groups and "ending 1234" ids
    [/(?:\+91[-\s]?)(?<![\d,.])\b[6-9]\d{4}[-\s]?\d{5}\b/giu, false],
    [/(?<![\d,.])\b[6-9]\d{4}[ ]\d{5}\b/giu, false],
    [/\b\d{4}[ -]\d{4}[ -]\d{4}(?:[ -]\d{4})?\b/giu, false],
    [/[xX*•]{2,}[ -]?\d{3,4}\b/giu, false],
    [new RegExp(`\\b(?:ending(?:${SP}+(?:in|with))?|a/c(?:${SP}*no\\.?)?|acct|account${SP}+(?:no\\.?|number)|folio(?:${SP}*(?:no\\.?|number))?|utr|txn${SP}*id|transaction${SP}*id|ref(?:erence)?${SP}*(?:no\\.?|id|number)|order${SP}*id|policy${SP}*(?:no\\.?|number)|pan|aadhaar)\\b${SP}*[:#-]?${SP}*[A-Za-z]*\\d+[A-Za-z0-9]*`, 'giu'), false],
    // list numbering at the start of a line "1." "2)" "(3)" "a."
    [new RegExp(`^${SP}*(?:\\d{1,2}[.)]|\\(\\d{1,2}\\)|\\(?[A-Za-z][.)])(?=${SP})`, 'gimu'), false],
    [new RegExp(`(?<=\\s)\\d{1,2}\\)(?=${SP}+[A-Za-z])`, 'giu'), false],
  ];

  function blank(s) { return s.replace(/[^\n]/g, ' '); }

  /** Replace every ignorable region by spaces (newlines kept) so offsets stay valid. */
  function maskNonAmounts(text) {
    let s = normText(text);
    for (const [re, guard] of MASKS) {
      re.lastIndex = 0;
      let out = '', last = 0, m;
      while ((m = re.exec(s))) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        const end = m.index + m[0].length;
        if (guard && UNIT_GUARD.test(s.slice(end, end + 24))) continue;
        out += s.slice(last, m.index) + blank(m[0]);
        last = end;
      }
      s = out + s.slice(last);
    }
    return s;
  }

  // ───────────────────────────── vocabulary ─────────────────────────────
  const NUMW = {
    // Hinglish (Roman)
    ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, paach: 5, pach: 5,
    chhe: 6, chhah: 6, cheh: 6, che: 6, chhey: 6, saat: 7, aath: 8, nau: 9, das: 10, dus: 10,
    gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17, atharah: 18, unnis: 19,
    bees: 20, pachees: 25, pacchis: 25, tees: 30, chalis: 40, pachas: 50, pachaas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
    // English
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    // Devanagari
    'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'छः': 6, 'छे': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
    'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15, 'पन्द्रह': 15, 'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19,
    'बीस': 20, 'पच्चीस': 25, 'तीस': 30, 'चालीस': 40, 'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90,
  };
  const FRAC_FIXED = { dedh: 1.5, dhai: 2.5, dhaai: 2.5, adhai: 2.5, 'डेढ': 1.5, 'ढाई': 2.5 };
  const FRAC_PLUS_QUARTER = ['sawa', 'sava', 'सवा'];
  const FRAC_MINUS_QUARTER = ['paune', 'pauna', 'पौने'];
  const FRAC_PLUS_HALF = ['sadhe', 'saadhe', 'साढे'];

  const UNIT_MULT = {
    crore: 1e7, crores: 1e7, cr: 1e7, crs: 1e7, 'करोड': 1e7,
    lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5, 'लाख': 1e5,
    lpa: 1e5,
    hazaar: 1e3, hazar: 1e3, hajar: 1e3, hajaar: 1e3, thousand: 1e3, k: 1e3, 'हजार': 1e3,
    sau: 100, hundred: 100, 'सौ': 100,
    million: 1e6, billion: 1e9,
  };
  const UNIT_WORDS_SRC = [
    'crores?', 'crs?', 'lakhs?', 'lacs?', 'lpa', 'hazaar', 'hazar', 'hajar', 'hajaar', 'thousand', 'hundred', 'million', 'billion', 'sau',
    'लाख', `करोड${NK}`, `हज${NK}ार`, 'सौ',
  ].join('|');
  const UNIT_DIGIT_SRC = `${UNIT_WORDS_SRC}|k|l`;

  /** Strip nukta, so Devanagari lookups are stable. */
  function devaKey(s) { return s.replace(/़/g, '').toLowerCase(); }

  const NUMW_SRC = Object.keys(NUMW).sort((a, b) => b.length - a.length).join('|');
  const PLAIN_NUM = '\\d+(?:\\.\\d+)?';
  const NUMTOK = `(?:${NUMW_SRC}|${PLAIN_NUM})`;
  const DIGITS = '(?:\\d{1,2}(?:,\\d{2})+,\\d{3}(?!\\d)(?:\\.\\d+)?|\\d{1,3}(?:,\\d{3})+(?!\\d)(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
  const WORDQTY = '(?:' + [
    `dedh|dhai|dhaai|adhai|डेढ${NK}|ढाई`,
    `(?:sawa|sava|सवा)(?:${SP}+${NUMTOK})?`,
    `(?:paune|pauna|पौने)(?:${SP}+${NUMTOK})?`,
    `(?:sadhe|saadhe|साढ${NK}े)${SP}+${NUMTOK}`,
    NUMW_SRC,
  ].join('|') + ')';
  const CUR_PREFIX = `(?:₹|\\bRs\\.?(?=[\\s\\d]|$)|\\bINR\\b\\.?|रु\\.?)`;
  const CUR_SUFFIX = `(?:${SP}*(?:/-|/=)|${SP}*(?<![${L}])(?:rupees?|rupaye|rupaiye|rupaya|rupay|रुपये|रुपए|रूपये|रुपया|rs|inr)(?![${L}]))`;

  const MASTER_SRC =
    `(?:(?<cp>${CUR_PREFIX})${SP}*)?` +
    `(?:` +
      `(?<![${L}_])(?<!\\d[,.])(?<d>${DIGITS})(?:(?<du>${SP}*(?:${UNIT_DIGIT_SRC}))(?![${L}_]))?` +
    `|` +
      `(?<![${L}_])(?<w>${WORDQTY})(?<wu>${SP}+(?:${UNIT_WORDS_SRC}))(?![${L}_])` +
    `)`;
  const CHAIN_SRC =
    `^${SP}+(?:and${SP}+)?(?:(?<d2>${DIGITS})|(?<w2>${WORDQTY}))(?<u2>${SP}*(?:${UNIT_WORDS_SRC}|k))(?![${L}_])`;

  const MASTER_RE = new RegExp(MASTER_SRC, 'giu');
  const CHAIN_RE = new RegExp(CHAIN_SRC, 'iu');
  const WORD_LIKE = new RegExp(`[${L}_]`, 'u');
  const PERCENT_AFTER = new RegExp(`^${SP}*(?:%|percent(?![${L}])|per${SP}?cent(?![${L}])|pct(?![${L}])|प्रतिशत|फीसदी|फ़ीसदी|फीसद)`, 'iu');
  const ORDINAL_AFTER = new RegExp(`^(?:st|nd|rd|th)(?![${L}])`, 'iu');
  const COUNT_NOUN_AFTER = new RegExp(`^${SP}*(?:bps|bp|basis|years?|yrs?|yr|months?|mths?|mos|days?|weeks?|hours?|hrs?|minutes?|mins?|times|x|units?|shares?|stocks?|transactions?|txns?|entries|rows|items?|orders?|users?|people|persons?|members?|trades?|installments?|instalments?|points?|pts|sq|sqft|ft|kg|km|gm|grams?|ml|litres?|liters?|kwh|gb|mb|saal|sal|varsh|mahine|mahina|din|hafte|ghante)(?![${L}])`, 'iu');
  const RANGE_AFTER = new RegExp(`^${SP}*(?:-|–|—|to|se)${SP}*(?:₹|rs\\.?${SP}*)?(?<n>${DIGITS})(?:(?<u>${SP}*(?:${UNIT_DIGIT_SRC}))(?![${L}_])|(?<p>${SP}*(?:%|percent(?![${L}])|per${SP}?cent(?![${L}]))))`, 'iu');
  const YEAR_BEFORE = /(?:\b(?:in|since|during|from|until|till|by|before|after|between|year|yr|calendar|fy|ay|fiscal|budget)\s*['’]?|(?:19|20)\d{2}\s*(?:-|–|to|and)\s*)$/i;
  const YEAR_AFTER = new RegExp(`^${SP}*(?:onwards?|budget|returns?|data|was|were|saw|had|has|brought|changed|marked|se\\b|ke\\b|ka\\b|tak\\b|mein\\b|me\\b)`, 'iu');

  const DEC = (s) => { const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  const clean = (x) => Number(x.toFixed(6));

  function numVal(tok) {
    const k = devaKey(tok);
    if (Object.prototype.hasOwnProperty.call(NUMW, k)) return NUMW[k];
    if (Object.prototype.hasOwnProperty.call(NUMW, tok)) return NUMW[tok];
    const f = parseFloat(tok);
    return Number.isFinite(f) ? f : null;
  }
  function wordQty(str) {
    const parts = str.trim().split(/\s+/).map((p) => devaKey(p));
    const head = parts[0];
    if (Object.prototype.hasOwnProperty.call(FRAC_FIXED, head)) return FRAC_FIXED[head];
    if (FRAC_PLUS_QUARTER.includes(head)) { const n = parts[1] ? numVal(parts[1]) : 1; return n == null ? null : n + 0.25; }
    if (FRAC_MINUS_QUARTER.includes(head)) { const n = parts[1] ? numVal(parts[1]) : 1; return n == null ? null : n - 0.25; }
    if (FRAC_PLUS_HALF.includes(head)) { const n = numVal(parts[1]); return n == null ? null : n + 0.5; }
    return numVal(head);
  }
  /** Resolve a unit token (with its leading whitespace) to a multiplier; null when it is not a valid unit here. */
  function resolveUnit(tok) {
    const trimmed = tok.trim();
    const key = devaKey(trimmed);
    if (key === 'l' && !(trimmed === 'L' || trimmed.length === tok.length)) return null; // "5 l" ≠ lakh
    return Object.prototype.hasOwnProperty.call(UNIT_MULT, key) ? UNIT_MULT[key] : null;
  }

  // ───────────────────────────── the shared tokenizer ─────────────────────────────
  const CS_RE = new RegExp(`^${CUR_SUFFIX}`, 'iu');

  /** Extend `value` with trailing smaller units ("2 lakh 50 thousand"). Returns {value, mult, end}. */
  function extendChain(s, end, value, mult) {
    for (let guard = 0; guard < 4; guard++) {
      const c = CHAIN_RE.exec(s.slice(end));
      if (!c) break;
      const m2 = resolveUnit(c.groups.u2);
      const v2 = c.groups.d2 ? parseFloat(c.groups.d2.replace(/,/g, '')) : wordQty(c.groups.w2);
      if (m2 == null || v2 == null || m2 >= mult) break;
      value += v2 * m2; mult = m2; end += c[0].length;
    }
    return { value, mult, end };
  }

  /**
   * @returns {Array<{raw,value,kind,start,end,decimals,mult,step}>}
   *   kind: 'money' (value in INR) | 'percent' | 'count' | 'year' | 'ordinal'
   *   noun: (bare numbers only) true when a count/time word follows ("250 transactions", "12 months")
   *   step: displayed precision in INR / percent points (0 = exact claim). Used by SmlNumericCheck.
   */
  function scanNumbers(text, opts) {
    opts = opts || {};
    const yearPolicy = opts.yearPolicy === 'context' ? 'context' : 'always';
    if (typeof text !== 'string' || !text) return [];
    const src = normText(text);
    const s = maskNonAmounts(src);
    const out = [];
    const re = MASTER_RE;
    re.lastIndex = 0;
    const push = (t) => { out.push(t); re.lastIndex = t.end; };
    const pw = (d) => clean(Math.pow(10, -d));
    let m;
    while ((m = re.exec(s))) {
      const g = m.groups;
      const whole = m[0];
      const start = m.index;

      // ── word-quantity branch ("dedh lakh", "paune do lakh", "das hazaar") — a unit is mandatory
      if (g.w) {
        const q = wordQty(g.w);
        const mult = resolveUnit(g.wu);
        if (q == null || mult == null || /^(?:k|l)$/i.test(g.wu.trim())) { re.lastIndex = m.index + 1; continue; }
        if (PERCENT_AFTER.test(s.slice(start + whole.length))) { re.lastIndex = start + whole.length; continue; }   // "one hundred percent"
        const ext = extendChain(s, start + whole.length, q * mult, mult);
        const csm = CS_RE.exec(s.slice(ext.end));
        const end = ext.end + (csm ? csm[0].length : 0);
        push({ raw: text.slice(start, end), value: clean(ext.value), kind: 'money', start, end, decimals: 0, mult: ext.mult, step: 0 });
        continue;
      }

      // ── digit branch
      const cpEnd = g.cp ? g.cp.length : 0;
      const numStart = start + whole.indexOf(g.d, cpEnd);
      const numEnd = numStart + g.d.length;
      const numStr = g.d.replace(/,/g, '');
      const num = parseFloat(numStr);
      const dec = DEC(numStr);
      const hasComma = g.d.indexOf(',') >= 0;
      let mult = 1, hasUnit = false, end = numEnd;
      if (g.du) {
        const um = resolveUnit(g.du);
        if (um != null) { mult = um; hasUnit = true; end = numEnd + g.du.length; }
      }
      let value = num * mult, chained = false;
      if (hasUnit) {
        const ext = extendChain(s, end, value, mult);
        chained = ext.end > end; value = ext.value; mult = ext.mult; end = ext.end;
      }
      const csm = CS_RE.exec(s.slice(end));
      const cs = csm ? csm[0] : '';
      const hasCur = !!g.cp || !!cs;
      const rest = s.slice(numEnd);

      if (hasUnit) {
        const e = end + cs.length;
        push({ raw: text.slice(start, e), value: clean(value), kind: 'money', start, end: e, decimals: dec, mult, step: (dec > 0 && !chained) ? clean(mult * Math.pow(10, -dec)) : 0 });
        continue;
      }
      if (!hasCur) {
        const pm = PERCENT_AFTER.exec(rest);
        if (pm) {
          const e = numEnd + pm[0].length;
          push({ raw: text.slice(numStart, e), value: clean(num), kind: 'percent', start: numStart, end: e, decimals: dec, mult: 1, step: pw(dec) });
          continue;
        }
        const om = ORDINAL_AFTER.exec(rest);
        if (om && !hasComma && dec === 0) {
          const e = numEnd + om[0].length;
          push({ raw: text.slice(numStart, e), value: num, kind: 'ordinal', start: numStart, end: e, decimals: 0, mult: 1, step: 0 });
          continue;
        }
      }
      if (!cs) {
        // "5-6 lakh" / "8-10%": the trailing unit / percent sign applies to the first number too
        const rm = RANGE_AFTER.exec(rest);
        if (rm && parseFloat(rm.groups.n.replace(/,/g, '')) > num) {
          if (rm.groups.p && !g.cp) {
            push({ raw: text.slice(numStart, numEnd), value: clean(num), kind: 'percent', start: numStart, end: numEnd, decimals: dec, mult: 1, step: pw(dec) });
            continue;
          }
          const um = rm.groups.u ? resolveUnit(rm.groups.u) : null;
          if (um != null) {
            push({ raw: text.slice(start, numEnd), value: clean(num * um), kind: 'money', start, end: numEnd, decimals: dec, mult: um, step: dec > 0 ? clean(um * Math.pow(10, -dec)) : 0 });
            continue;
          }
        }
      }
      if (hasCur) {
        const e = numEnd + (cs ? cs.length : 0);
        push({ raw: text.slice(start, e), value: clean(num), kind: 'money', start, end: e, decimals: dec, mult: 1, step: dec > 0 ? pw(dec) : 1 });
        continue;
      }

      // ── bare number (no currency, no unit, not a percent / ordinal)
      const nextCh = s.charAt(numEnd);
      if (nextCh && WORD_LIKE.test(nextCh)) { re.lastIndex = numEnd; continue; }   // "5000abc" — glued to letters
      let kind;
      if (!hasComma && dec === 0 && num >= 1900 && num <= 2100) {
        if (yearPolicy === 'always') kind = 'year';
        else {
          const before = s.slice(Math.max(0, numStart - 28), numStart);
          kind = (YEAR_BEFORE.test(before) || YEAR_AFTER.test(rest.slice(0, 24))) ? 'year' : 'money';
        }
      } else if (!hasComma && dec === 0 && numStr.length >= 10) kind = 'count';       // phone / account id
      else if (num >= 100 && !COUNT_NOUN_AFTER.test(rest)) kind = 'money';
      else kind = 'count';
      push({ raw: text.slice(numStart, numEnd), value: clean(num), kind, start: numStart, end: numEnd, decimals: dec, mult: 1, step: kind === 'money' ? (dec > 0 ? pw(dec) : 1) : 0, noun: COUNT_NOUN_AFTER.test(rest) });
    }
    return out;
  }

  /** Every money amount in the text. See the rules in the file header. */
  function parseAmount(text) {
    return scanNumbers(text, { yearPolicy: 'always' })
      .filter((t) => t.kind === 'money')
      .map((t) => ({ raw: t.raw, value_inr: t.value, start: t.start, end: t.end }));
  }

  // ───────────────────────────── formatting ─────────────────────────────
  function groupIndian(intStr) {
    if (intStr.length <= 3) return intStr;
    const last3 = intStr.slice(-3);
    const rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + last3;
  }
  /** 140000 → '₹1,40,000'; 1234.5 → '₹1,234.50'; negative → '-₹1,40,000'; non-finite → ''. */
  function formatInr(n, opts) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '';
    const sign = x < 0 ? '-' : '';
    let fixed = Math.abs(x).toFixed(2);
    let [i, f] = fixed.split('.');
    const decimals = opts && opts.decimals != null ? opts.decimals : (f === '00' ? 0 : 2);
    if (decimals === 0) { i = String(Math.round(Math.abs(x))); f = ''; }
    return sign + '₹' + groupIndian(i) + (decimals > 0 ? '.' + f : '');
  }
  function trimDot0(s) { return s.replace(/\.0$/, ''); }
  /** 140000 → '₹1.4 L', 25000000 → '₹2.5 Cr', 11200 → '₹11.2K', 950 → '₹950'. One decimal, trailing .0 dropped. */
  function formatShort(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '';
    const sign = x < 0 ? '-' : '';
    const a = Math.abs(x);
    if (a < 1000) return sign + '₹' + trimDot0(a.toFixed(a % 1 === 0 ? 0 : 2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));
    const r1 = (v) => Math.round(v * 10 + 1e-9) / 10;
    if (a < 1e5) {
      const k = r1(a / 1e3);
      if (k < 100) return sign + '₹' + trimDot0(k.toFixed(1)) + 'K';
    }
    if (a < 1e7) {
      const l = r1(a / 1e5);
      if (l < 100) return sign + '₹' + trimDot0(l.toFixed(1)) + ' L';
    }
    const c = r1(a / 1e7);
    const cs = trimDot0(c.toFixed(1));
    const [ci, cf] = cs.split('.');
    return sign + '₹' + groupIndian(ci) + (cf ? '.' + cf : '') + ' Cr';
  }

  // ───────────────────────────── language detection ─────────────────────────────
  const HINGLISH_WORDS = [
    'mera', 'meri', 'mere', 'kitna', 'kitni', 'kitne', 'kya', 'mein', 'hai', 'hain', 'kharch', 'paisa', 'paise', 'nahi', 'nahin',
    'chahiye', 'kaise', 'hua', 'tha', 'thi', 'aur', 'ka', 'ki', 'ko', 'mujhe', 'kyun', 'kab', 'karo', 'karna', 'bhi', 'yeh', 'rupaye',
  ];
  const HINGLISH = new Set(HINGLISH_WORDS);
  /** @returns {{lang:'en'|'hi'|'hi-en', confidence:number}} */
  function detectLanguage(text) {
    const s = String(text == null ? '' : text);
    const dev = (s.match(/[\p{Script=Devanagari}]/gu) || []).length;
    const lat = (s.match(/[A-Za-z]/g) || []).length;
    if (dev + lat === 0) return { lang: 'en', confidence: 0 };
    const share = dev / (dev + lat);
    if (share >= 0.5) return { lang: 'hi', confidence: Math.min(0.99, +(0.5 + share * 0.5).toFixed(2)) };
    const words = s.toLowerCase().match(/[a-z]+/g) || [];
    const hits = words.filter((w) => HINGLISH.has(w)).length;
    if (dev > 0 && share >= 0.15) return { lang: 'hi-en', confidence: +Math.min(0.95, 0.6 + share * 0.5).toFixed(2) };
    const n = words.length;
    if (hits >= 2 || (hits === 1 && n <= 4)) {
      const ratio = hits / Math.max(n, 1);
      return { lang: 'hi-en', confidence: +Math.min(0.99, 0.55 + ratio * 0.5 + Math.min(hits, 5) * 0.03).toFixed(2) };
    }
    if (hits === 1) return { lang: 'en', confidence: 0.55 };
    return { lang: 'en', confidence: n >= 5 ? 0.9 : n >= 2 ? 0.75 : 0.6 };
  }

  // ───────────────────────────── month references ─────────────────────────────
  const MONTH_NAMES = {
    january: 1, janwari: 1, janvari: 1, jan: 1, 'जनवरी': 1,
    february: 2, farwari: 2, farvari: 2, pharwari: 2, feb: 2, 'फरवरी': 2, 'फ़रवरी': 2,
    march: 3, mar: 3, 'मार्च': 3,
    april: 4, aprail: 4, apr: 4, 'अप्रैल': 4, 'अप्रेल': 4,
    may: 5, mai: 5, 'मई': 5,
    june: 6, jun: 6, 'जून': 6,
    july: 7, julai: 7, jul: 7, 'जुलाई': 7,
    august: 8, agast: 8, agust: 8, aug: 8, 'अगस्त': 8,
    september: 9, sitambar: 9, sitamber: 9, sept: 9, sep: 9, 'सितंबर': 9, 'सितम्बर': 9,
    october: 10, oct: 10, aktubar: 10, 'अक्टूबर': 10, 'अक्तूबर': 10,
    november: 11, navambar: 11, navember: 11, nov: 11, 'नवंबर': 11, 'नवम्बर': 11,
    december: 12, disambar: 12, disember: 12, dec: 12, 'दिसंबर': 12, 'दिसम्बर': 12,
  };
  const MONTH_NAME_SRC = Object.keys(MONTH_NAMES).sort((a, b) => b.length - a.length).join('|');
  const MAHINA = 'mah(?:i|ee|e)?n(?:e|a|ey|ay)?|maah|महीने|महीना|माह';
  const REL = [
    { delta: -1, re: new RegExp(`(?<![${L}])(?:pi(?:ch|chh)l[ea]${SP}+(?:${MAHINA})|(?:last|previous|prev|prior)${SP}+month|पिछले${SP}+(?:${MAHINA})|पिछला${SP}+(?:${MAHINA}))(?![${L}])`, 'giu') },
    { delta: 0, re: new RegExp(`(?<![${L}])(?:(?:is{1,2}|isi|ye|yeh|ये|इस)${SP}+(?:${MAHINA})|(?:this|current)${SP}+month)(?![${L}])`, 'giu') },
    { delta: 1, re: new RegExp(`(?<![${L}])(?:(?:agle|aane${SP}+wale|अगले)${SP}+(?:${MAHINA})|next${SP}+month)(?![${L}])`, 'giu') },
  ];
  const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const validNow = (d) => d instanceof Date && !isNaN(d.getTime());

  /**
   * All month references in order of appearance, as 'YYYY-MM' (duplicates kept out).
   * Uses ONLY the `now` argument (its local year/month) — never the system clock. If `now` is missing/invalid,
   * only explicit-year references ("august 2026", "2026-08", "08/2026") resolve.
   * Bare month name ("september", "sitambar"): the most recent such month that is not in the future
   * (the current month counts as itself) → with now = 2026-10: september → 2026-09, october → 2026-10, november → 2025-11.
   * "may"/"mai" count only with context (a year, "in/of/for/since/till … may", "may ka/mein", or the whole text is "may").
   */
  function monthRefs(text, now) {
    const s = normText(text);
    const hits = [];
    const add = (index, val) => { if (val) hits.push({ index, val }); };
    const ny = validNow(now) ? now.getFullYear() : null;
    const nm = validNow(now) ? now.getMonth() + 1 : null;

    let m;
    const iso = /(?<![\d/-])((?:19|20)\d{2})-(0[1-9]|1[0-2])(?!\d)/g;
    while ((m = iso.exec(s))) add(m.index, ym(m[1], +m[2]));
    const my = /(?<![\d/-])(0?[1-9]|1[0-2])\/((?:19|20)\d{2})(?!\d)/g;
    while ((m = my.exec(s))) add(m.index, ym(m[2], +m[1]));

    for (const r of REL) {
      const re = new RegExp(r.re.source, r.re.flags);
      while ((m = re.exec(s))) {
        if (ny == null) continue;
        let mm = nm + r.delta, yy = ny;
        if (mm < 1) { mm += 12; yy -= 1; } else if (mm > 12) { mm -= 12; yy += 1; }
        add(m.index, ym(yy, mm));
      }
    }

    const nameRe = new RegExp(`(?<![${L}])(${MONTH_NAME_SRC})(?![${L}])(?:\\.?,?${SP}*(?:'(\\d{2})(?!\\d)|((?:19|20)\\d{2})(?!\\d)))?`, 'giu');
    while ((m = nameRe.exec(s))) {
      const name = devaKey(m[1]);
      const mo = MONTH_NAMES[name] || MONTH_NAMES[m[1]];
      if (!mo) continue;
      const year = m[3] ? +m[3] : (m[2] ? 2000 + +m[2] : null);
      const after = s.slice(m.index + m[0].length, m.index + m[0].length + 24);
      if (name === 'jan' && /^\s+(?:dhan|aushadhi|suraksha|samarth|vishwas|aadhaar|sunwai)/i.test(after)) continue; // "Jan Dhan"
      if ((name === 'may' || name === 'mai') && year == null) {
        const before = s.slice(Math.max(0, m.index - 22), m.index).toLowerCase();
        const ctxBefore = /(?:\b(?:in|of|for|during|since|until|till|from|by|last|this|next|early|late|mid|end|ka|ke|ki|mein|me|se|tak)\s+)$/.test(before);
        const ctxAfter = /^\s*(?:(?:ka|ke|ki|mein|me|month|mahine|mahina|se|tak)\b|\?|\.|$)/i.test(after);
        const whole = s.trim().toLowerCase().replace(/[.?!]+$/, '') === name;
        if (!(ctxBefore || ctxAfter && !/^\s*(?:i|you|be|not)\b/i.test(after) || whole)) continue;
      }
      if (year != null) add(m.index, ym(year, mo));
      else if (ny != null) add(m.index, ym(mo <= nm ? ny : ny - 1, mo));
    }
    hits.sort((a, b) => a.index - b.index);
    const seen = new Set(); const out = [];
    for (const h of hits) if (!seen.has(h.val)) { seen.add(h.val); out.push(h.val); }
    return out;
  }
  /** First month reference in the text as 'YYYY-MM', or null. See monthRefs(). */
  function monthRef(text, now) {
    const all = monthRefs(text, now);
    return all.length ? all[0] : null;
  }

  return {
    VERSION: '1.0',
    parseAmount, formatInr, formatShort, detectLanguage, monthRef, monthRefs,
    scanNumbers, maskNonAmounts, HINGLISH_WORDS,
  };
});
