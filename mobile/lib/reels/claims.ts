// Finds every regulatory or factual claim in Money Reels, trust notes and money facts that a compliance reader has to source, so the read is a
// checklist and not a search. Pure: text in, claims out. It never decides a claim is right or wrong; it extracts, labels, and cross-checks the numbers
// it can against the constants the app already has (lib/taxcore.ts, lib/taxSavings.ts). Run by scripts/compliance-sheet.mts (`npm run reels:compliance`).
//
// A claim is one sentence in one on-screen text, in one category. A sentence that matters in two ways (a tax limit that names a scheme) is two claims.
// The `source` field is empty on purpose: the compliance reader fills it in.
import { CESS, NEW_REBATE_LIMIT, OLD_REBATE_LIMIT, STD_NEW, STD_OLD } from '@/lib/taxcore';
import { SECTIONS } from '@/lib/taxSavings';

export type ClaimCategory =
  | 'regulator' | 'tax-section' | 'tax-limit' | 'tax-rate' | 'tax-year' | 'tax-example' | 'deposit-insurance' | 'rate-fact' | 'scheme' | 'rule' | 'helpline' | 'advice-wording';

export const CATEGORY_INFO: Record<ClaimCategory, { label: string; ask: string }> = {
  'regulator': { label: 'Names a regulator or law', ask: 'Is the body named correctly and is what it is said to do accurate?' },
  'tax-section': { label: 'Cites an Income-tax section', ask: 'Is the section number right for the rule described, and does it still exist under the current Act?' },
  'tax-limit': { label: 'States a tax limit, threshold or deduction', ask: 'Is the amount right for the year the reel says (or implies), and for the regime it names?' },
  'tax-rate': { label: 'States a tax rate or slab percentage', ask: 'Is the rate right for the year and the regime?' },
  'tax-year': { label: 'Ties a rule to a financial year', ask: 'Is that the year in force when the reel is shown? Does the reel say to check the current rule?' },
  'tax-example': { label: 'Worked tax example', ask: 'Amounts here are example inputs or results (checked by the maths tests). Check the rule the example applies, not the arithmetic.' },
  'deposit-insurance': { label: 'Deposit insurance cover', ask: 'Is the insured amount and what it covers (per depositor, per bank) correct?' },
  'rate-fact': { label: 'An interest, inflation or return figure not marked as assumed', ask: 'Is this a real published figure that needs a source and a date, or should the reel call it an assumption?' },
  'scheme': { label: 'Names a scheme or product', ask: 'Are the scheme’s features as described (lock-in, eligibility, tax treatment)?' },
  'rule': { label: 'A rule, period, date or threshold stated as fact', ask: 'Is the period, date or threshold right, and is it the same for everyone?' },
  'helpline': { label: 'A helpline, number or official website', ask: 'Is the number or address correct and still in service?' },
  'advice-wording': { label: 'Wording that could read as advice or a promise', ask: 'Could a viewer take this as a recommendation or a promise? Reword, qualify, or accept.' },
};
export const CLAIM_CATEGORIES = Object.keys(CATEGORY_INFO) as ClaimCategory[];

export interface ClaimInput { id: string; topic: string; origin: 'reel' | 'trust' | 'fact'; where: string; en: string; hi: string }

export type CheckStatus = 'matches' | 'matches-literal' | 'mismatch' | 'known' | 'not-checked';
export interface CrossCheck { status: CheckStatus; note: string }

export interface Claim {
  /** Stable while the reel does not change: `<reel id>.<nn>`. */
  id: string;
  reel: string;
  origin: ClaimInput['origin'];
  where: string;
  category: ClaimCategory;
  /** The sentence, exactly as on screen. */
  text: string;
  /** The same on-screen text in Hindi, so the figure can be compared. */
  hindi: string;
  /** What was found: the amounts, percentages, section numbers, scheme names or phrases. */
  figure: string;
  /** For a rate: whether the sentence itself says it is assumed. Empty for other categories. */
  framing: '' | 'stated as fact' | 'assumed elsewhere in the reel';
  /** Whether the reel asserts this, or shows it as a wrong option or as part of a scam message. */
  meant: 'asserted' | 'wrong answer option' | 'scam example';
  check: CrossCheck;
  /** For the compliance reader to fill in. */
  source: '';
}

// ── reading numbers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const MULT: Record<string, number> = { lakh: 1e5, lakhs: 1e5, l: 1e5, crore: 1e7, crores: 1e7, cr: 1e7, thousand: 1e3, k: 1e3 };
export interface Amount { text: string; value: number; at: number }

/** Rupee amounts in a sentence: ₹1,50,000 / ₹1.5 lakh / Rs 50k, in rupees. */
export function rupees(s: string): Amount[] {
  const out: Amount[] = [];
  for (const m of s.matchAll(/(?:₹|Rs\.?)\s?(\d[\d,]*(?:\.\d+)?)\s?(lakhs?|crores?|thousand|Cr|L|k)?\b/gi)) {
    const n = parseFloat(m[1].replace(/,/g, '')); if (!Number.isFinite(n)) continue;
    out.push({ text: m[0].trim(), value: Math.round(n * (m[2] ? MULT[m[2].toLowerCase()] : 1)), at: m.index ?? 0 });
  }
  return out;
}
const percents = (s: string): number[] => [...s.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map(m => parseFloat(m[1]));

/** Sentences of an on-screen text. A short label is one sentence. */
export function sentences(t: string): string[] {
  return t.split(/(?<=[.!?])\s+(?=[A-Z“"‘'₹\d(])/).map(x => x.trim()).filter(Boolean);
}

// ── detectors ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const REGULATOR = /\b(SEBI|RBI|IRDAI|PFRDA|NPCI|DICGC|CBDT|Reserve Bank(?: of India)?|Insurance Ombudsman|Banking Ombudsman|Ombudsman|Ministry of Finance|TRAI|Income[- ]tax Act(?: 20\d\d)?|IT Act|Income[- ]tax Department|Finance Act|Budget 20\d\d|Consumer (?:Court|Forum))\b/gi;
const TAX_SECTION = /(?<![A-Za-z0-9])(?:Sections?\s+\d{2,3}[A-Z]{0,5}(?:\([0-9A-Za-z]+\))?|80[A-Z]{1,5}(?:\([0-9A-Za-z]+\))?|87A|24\(b\)|10\(10D\)|112A|111A|44ADA?|115BAC|194[A-Z]{0,2}|206AB)(?![A-Za-z0-9])/g;
const TAX_WORDS = /\b(tax|taxes|taxable|taxed|deduction|deductions|rebate|slab|slabs|cess|TDS|ITR|exempt|exemption|regime|regimes|surcharge|capital gains?|HRA|80C|80D|87A)\b/i;
const LIMIT_WORDS = /\b(up to|upto|limit|maximum|max|cap|capped|at most|ceiling|threshold|exempt|exemption|no tax (?:up to|till|below)|nil up to|standard deduction|rebate|deduction of|can claim)\b/i;
const FY = /\b(?:FY|AY|F\.Y\.|assessment year|financial year)\s?(20\d\d)\s?[-–/]\s?(\d{2,4})\b|\b(?:this|current|latest|new) (?:financial year|tax year|budget|rules)\b|\bBudget 20\d\d\b/gi;
const DEPOSIT = /\b(DICGC|deposit insurance|insured (?:up )?to|insurance cover (?:on|for) (?:bank )?deposits?|per depositor)\b/i;
const RATE_WORDS = /\b(interest|inflation|returns?|yield|rates?|repo|CAGR|per annum|a year|p\.a\.|annual(?:ly)?|growth|FD|PPF|EPF|NPS)\b/i;
const ASSUMED = /\b(assum\w*|suppose|imagine|illustrat\w*|example|for instance|what if|let’s say|let's say|say(?= (?:\d|₹))|hypothetical|not a (?:promise|forecast|prediction|guarantee)|rule of thumb|rough\w*|pretend)\b/i;
const SCHEME = /\b(PPF|NPS|EPF|EPFO|ELSS|SCSS|SSY|NSC|APY|ULIP|SGB|KVP|Sukanya(?: Samriddhi)?|Atal Pension|Public Provident Fund|National Pension|Employees’? Provident|Sovereign Gold Bond|Kisan Vikas|Ayushman|PM-?JAY|ESIC)\b/g;
const RULE = /\b(lock-?in|holding period|waiting period|grace period|free[- ]look|cooling[- ]off|due date|last date|deadline|advance tax|long[- ]term|short[- ]term|\d+ (?:days?|months?|years?|hours?) (?:lock-?in|waiting|grace|holding)|more than \d+ months|within \d+ (?:days|hours)|300 to 900|free (?:credit )?report|one free|(?:\d{1,2}(?:st|nd|rd|th)? )(?:January|February|March|April|May|June|July|August|September|October|November|December)|(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}|credit score of \d{3}|\d{3}\+? or (?:above|more)|T\+\d)\b/gi;
const HELPLINE = /\b(1930|1800[- ]?\d[\d-]{5,}|155260|112|cybercrime\.gov\.in|sancharsaathi\.gov\.in|helpline)\b/gi;

// Advice and promise wording. HIGH words are a problem almost anywhere; MEDIUM words are advice only outside a scam-safety reel ("never share your OTP").
const ADVICE_HIGH = /\b(guarantee[ds]?|guaranteed|risk[- ]free|no[- ]risk|sure[- ]?shot|can’?t lose|can't lose|assured (?:returns?|income|profit)|will (?:double|grow|earn|make you|beat|give you|multiply))\b/gi;
const ADVICE_MEDIUM = /\b(should (?:invest|buy|sell|put|choose|pick|take|go|opt|start|stop|switch|move|keep|hold|prefer|avoid)|you (?:must|need to|have to|ought to)|best|safest|safe|top pick|ideal(?:ly)?|recommend\w*|smart(?:est)? (?:way|move|choice)|wise)\b/gi;
const NEGATED = /(?:\bnot|\bno|\bnever|\bwithout|n’t|n't|\bnothing is|\bnor|\bwhy)\W+(?:\w+\W+){0,2}$/i;

// ── what the app already knows ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Constants come from the app's own code where there is one; a literal is marked as such. A literal still tells the reader that the reel agrees with
// the rest of the app, which is worth knowing, but it is not a source.
const sec = (id: string): number => SECTIONS.find(s => s.id === id)?.maxDeduction ?? NaN;
interface Known { id: string; ctx: RegExp; values: { v: number; src: string; literal?: boolean }[] }
const KNOWN_LIMITS: Known[] = [
  { id: 'standard deduction', ctx: /standard deduction/i, values: [{ v: STD_NEW, src: 'lib/taxcore.ts STD_NEW' }, { v: STD_OLD, src: 'lib/taxcore.ts STD_OLD' }] },
  { id: 'Section 87A rebate', ctx: /87A|rebate/i, values: [{ v: NEW_REBATE_LIMIT, src: 'lib/taxcore.ts NEW_REBATE_LIMIT' }, { v: OLD_REBATE_LIMIT, src: 'lib/taxcore.ts OLD_REBATE_LIMIT' }] },
  { id: 'Section 80C', ctx: /\b80C\b(?!CD)/, values: [{ v: sec('s80c'), src: 'lib/taxSavings.ts SECTIONS s80c' }] },
  { id: 'Section 80D', ctx: /\b80D\b|health (?:insurance|cover) premium/i, values: [{ v: sec('s80d'), src: 'lib/taxSavings.ts SECTIONS s80d (self and family)' }, { v: 50_000, src: 'literal: senior-citizen limit, no constant in the app', literal: true }] },
  { id: 'Section 80CCD(1B)', ctx: /80CCD|NPS/i, values: [{ v: sec('nps'), src: 'lib/taxSavings.ts SECTIONS nps' }] },
  { id: 'Section 24(b)', ctx: /24\(b\)|home loan interest/i, values: [{ v: sec('s24b'), src: 'lib/taxSavings.ts SECTIONS s24b' }] },
  { id: 'deposit insurance', ctx: DEPOSIT, values: [{ v: 500_000, src: 'literal: DICGC limit, only in lib/reels/facts.ts text', literal: true }] },
];
/** The financial year lib/taxcore.ts is written for (its header: "FY 2026-27 slabs"). There is no exported constant to import. */
export const TAXCORE_FY = '2026-27';
const SLAB_RATES = [0, 5, 10, 15, 20, 25, 30];   // taxcore's NEW_SLABS and OLD_SLABS are private; these are the rates in them
const HELPLINE_KNOWN: Record<string, string> = { '1930': 'National Cyber Crime Reporting helpline', 'cybercrime.gov.in': 'National Cyber Crime Reporting Portal' };

function check(cat: ClaimCategory, s: string, figure: string): CrossCheck {
  const amts = rupees(s);
  if (cat === 'tax-limit' || cat === 'deposit-insurance') {
    const hits = KNOWN_LIMITS.map(k => ({ k, at: s.search(k.ctx) })).filter(h => h.at >= 0);
    if (!hits.length) return { status: 'not-checked', note: 'No constant in the app for this limit.' };
    if (!amts.length) return { status: 'not-checked', note: 'No rupee amount in the sentence to compare.' };
    const notes: string[] = [];
    let anyMatch = false, anyConst = false, anyMismatch = false;
    for (const { k, at } of hits) {
      // only amounts written next to the rule's name are compared with it: "standard deduction ... ₹75,000", not an income given as an input
      const wide = amts.filter(a => a.at - at <= 80 && at - a.at <= 45);
      // a mismatch needs an amount written right against the rule's name (no comma or colon between); a match may be a little further off
      const tight = amts.filter(a => (a.at >= at && a.at - at <= 30 && !/[,:;]/.test(s.slice(at, a.at))) || (a.at < at && at - a.at <= 20));
      const m = k.values.filter(x => wide.some(a => a.value === x.v));
      if (m.length) { anyMatch = true; if (m.some(x => !x.literal)) anyConst = true; notes.push(`${k.id}: ${m.map(x => x.src).join(', ')}`); }
      else if (tight.length) { anyMismatch = true; notes.push(`${k.id}: expected ${k.values.map(x => x.v.toLocaleString('en-IN')).join(' or ')} (${k.values.map(x => x.src).join('; ')}); next to it: ${tight.map(a => a.text).join(', ')}`); }
      else notes.push(`${k.id}: no amount written next to it`);
    }
    if (anyMismatch) return { status: 'mismatch', note: notes.join(' | ') };
    if (anyMatch) return { status: anyConst ? 'matches' : 'matches-literal', note: notes.join(' | ') };
    return { status: 'not-checked', note: notes.join(' | ') };
  }
  if (cat === 'tax-rate') {
    const cess = s.match(/(\d+(?:\.\d+)?)\s?%\s*(?:health and education )?cess|cess (?:of|at|is|=)?\s?(\d+(?:\.\d+)?)\s?%/i);
    if (cess) { const v = parseFloat(cess[1] ?? cess[2]); return v === CESS * 100 ? { status: 'matches', note: `cess ${CESS * 100}%: lib/taxcore.ts CESS` } : { status: 'mismatch', note: `cess in the app is ${CESS * 100}%; sentence says ${v}%` }; }
    const slab = [...s.matchAll(/(\d+(?:\.\d+)?)\s?%\s*(?:tax\s*)?(?:slab|bracket)|(?:slab|bracket) (?:of |at )?(\d+(?:\.\d+)?)\s?%/gi)].map(m => parseFloat(m[1] ?? m[2]));
    if (slab.length) {
      const bad = slab.filter(x => !SLAB_RATES.includes(x));
      return bad.length ? { status: 'mismatch', note: `${bad.join(', ')}% is not a slab rate in lib/taxcore.ts (${SLAB_RATES.join(', ')}%)` } : { status: 'matches', note: `slab rate ${slab.join(', ')}%: among the rates in lib/taxcore.ts (${SLAB_RATES.join(', ')}%)` };
    }
    return { status: 'not-checked', note: 'No constant in the app for this rate.' };
  }
  if (cat === 'tax-year') {
    const years = [...s.matchAll(/(20\d\d)\s?[-–/]\s?(\d{2,4})/g)].map(m => `${m[1]}-${m[2].slice(-2)}`);
    if (!years.length) return { status: 'not-checked', note: `Says "${figure}" with no year. lib/taxcore.ts is written for FY ${TAXCORE_FY}.` };
    return years.every(y => y === TAXCORE_FY) ? { status: 'matches', note: `FY ${TAXCORE_FY} is the year lib/taxcore.ts is written for. Confirm it is the year in force when the reel is shown.` } : { status: 'mismatch', note: `lib/taxcore.ts is written for FY ${TAXCORE_FY}; the sentence says ${years.join(', ')}.` };
  }
  if (cat === 'helpline') {
    const known = Object.keys(HELPLINE_KNOWN).filter(k => s.toLowerCase().includes(k));
    return known.length ? { status: 'known', note: known.map(k => `${k} = ${HELPLINE_KNOWN[k]} (listed in lib/reels/claims.ts; confirm still current)`).join('; ') } : { status: 'not-checked', note: 'Not a number the tool knows.' };
  }
  return { status: 'not-checked', note: '' };
}

// ── extraction ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const uniq = (xs: string[]): string[] => [...new Set(xs.map(x => x.trim()).filter(Boolean))];
const matches = (re: RegExp, s: string): string[] => uniq([...s.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].map(m => m[0]));

function meantOf(where: string, topic: string): Claim['meant'] {
  if (/message (?:piece|from)/i.test(where) || (topic === 'safety' && /^Interaction: (?:message|piece)/i.test(where))) return 'scam example';
  if (/^Quiz option \d+$/.test(where) || /\(myth\)/.test(where)) return 'wrong answer option';
  return 'asserted';
}

/** Detect claims in one sentence. Returns (category, figure) pairs. */
export function detect(s: string, topic: string, reelAssumes: boolean, inAssumes = false): { category: ClaimCategory; figure: string; framing?: Claim['framing'] }[] {
  const out: { category: ClaimCategory; figure: string; framing?: Claim['framing'] }[] = [];
  const add = (category: ClaimCategory, figure: string, framing?: Claim['framing']) => { if (figure) out.push({ category, figure, ...(framing ? { framing } : {}) }); };
  const amts = rupees(s), pcts = percents(s), taxy = TAX_WORDS.test(s);

  add('regulator', matches(REGULATOR, s).join('; '));
  add('tax-section', matches(TAX_SECTION, s).join('; '));
  if (taxy && amts.length) add(LIMIT_WORDS.test(s) ? 'tax-limit' : 'tax-example', amts.map(a => a.text).join('; '));
  if (taxy && pcts.length) add('tax-rate', pcts.map(p => `${p}%`).join('; '));
  if (/\b(FY|AY)\b|financial year|assessment year|tax year|latest budget|current rules|Budget 20/i.test(s)) add('tax-year', matches(FY, s).join('; ') || (s.match(/\bFY\s?[\d-]+/i)?.[0] ?? ''));
  if (DEPOSIT.test(s)) add('deposit-insurance', uniq([...matches(DEPOSIT, s), ...amts.map(a => a.text)]).join('; '));
  // the "assumes" half of a trust note is assumptions by definition; only a sentence that cites a rule or a published rate is a claim there
  if (pcts.length && RATE_WORDS.test(s) && !ASSUMED.test(s) && !(inAssumes && !/\b(rule|law|declared|set by|government|usual|official|published)\b/i.test(s))) add('rate-fact', pcts.map(p => `${p}%`).join('; '), reelAssumes ? 'assumed elsewhere in the reel' : 'stated as fact');
  add('scheme', matches(SCHEME, s).join('; '));
  add('rule', matches(RULE, s).join('; '));
  add('helpline', matches(HELPLINE, s).join('; '));

  const lower = s;
  const adv: string[] = [];
  for (const m of lower.matchAll(ADVICE_HIGH)) if (!NEGATED.test(lower.slice(0, m.index ?? 0))) adv.push(m[0]);
  if (topic !== 'safety') for (const m of lower.matchAll(ADVICE_MEDIUM)) if (!NEGATED.test(lower.slice(0, m.index ?? 0))) adv.push(m[0]);
  add('advice-wording', uniq(adv).join('; '));
  return out;
}

/** Every claim in the given texts, in the order the texts are given. `items` must list each reel's texts together. */
export function extractClaims(items: ClaimInput[]): Claim[] {
  const reelAssumes = new Map<string, boolean>();
  for (const it of items) if (ASSUMED.test(it.en)) reelAssumes.set(it.id, true);
  const nth = new Map<string, number>();
  const out: Claim[] = [];
  for (const it of items) {
    for (const s of sentences(it.en)) {
      for (const d of detect(s, it.topic, reelAssumes.get(it.id) === true, /^How this is worked out: assumes/.test(it.where))) {
        const n = (nth.get(it.id) ?? 0) + 1; nth.set(it.id, n);
        out.push({
          id: `${it.id}.${String(n).padStart(2, '0')}`, reel: it.id, origin: it.origin, where: it.where, category: d.category, text: s, hindi: it.hi,
          figure: d.figure, framing: d.framing ?? '', meant: meantOf(it.where, it.topic), check: check(d.category, s, d.figure), source: '',
        });
      }
    }
  }
  return out;
}
