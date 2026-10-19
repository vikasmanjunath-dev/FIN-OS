// Ask Mitra: a question about the reel you are watching, answered on the phone with Arya's own phone tools (lib/aryaToolbox.ts), never by a
// model that could invent a number. Two kinds of question are understood:
//   - a what-if on the reel's example ("what if the rate is 10%?", "and for 20 years?"): the reel's own amount, rate and years with only the
//     parts you named changed, worked out by the same calculators the screens use;
//   - anything else the phone tools answer (a calculator sentence, your savings rate, your emergency fund...), from your own records.
// What it will not do: say what to buy or sell, use the network, or change anything. Pure, so it is tested without a screen.
import { matchIntent, numbers, type Args, type ToolId } from '@/lib/aryaIntent';
import { runDeviceTool, type ToolCtx } from '@/lib/aryaToolbox';
import type { Mine } from '@/lib/reels/mine';
import type { L, Reel } from '@/lib/reels/types';

/** The phone tools Mitra may run from a reel: the calculators and a few of the person's own figures. Nothing that writes, opens a screen or goes online. */
export const ALLOWED: ToolId[] = ['sip_calc', 'emi_calc', 'fd_calc', 'rd_calc', 'lumpsum_calc', 'inflation_calc', 'savings_rate', 'emergency_fund', 'debt', 'money_score', 'goal_sip', 'tax_dates', 'tax_80c', 'tax_estimate'];
const CALCS = new Set<ToolId>(['sip_calc', 'emi_calc', 'inflation_calc']);

/** What a what-if changes: the calculator and the reel's own numbers. */
export interface Base { tool: 'sip_calc' | 'emi_calc' | 'inflation_calc'; amount: number; rate: number; years: number }

/** The calculator behind a reel and its numbers, or null for a reel with no what-if to offer. A reel built from the person's own figures uses them. */
export function contextBase(reel: Reel, mine: Mine = {}): Base | null {
  const beat = reel.poke?.beat;
  if (beat?.kind === 'slider') {
    const m = beat.model;
    if (m.kind === 'sip-delay') return { tool: 'sip_calc', amount: m.monthly, rate: m.rate, years: m.horizon };
    if (m.kind === 'sip-years') return { tool: 'sip_calc', amount: m.monthly, rate: m.rate, years: beat.start };
    if (m.kind === 'inflation-years') return { tool: 'inflation_calc', amount: m.amount, rate: m.rate, years: beat.start };
    if (m.kind === 'emi-rate') return { tool: 'emi_calc', amount: m.principal, rate: m.rate0, years: m.years };
    if (m.kind === 'emi-tenure') return { tool: 'emi_calc', amount: m.principal, rate: m.rate, years: beat.start };
    if (m.kind === 'step-up') return { tool: 'sip_calc', amount: m.monthly, rate: m.rate, years: m.years };
    return null;                                       // goal-sip, tax-income, corpus-spend and card-interest have no calculator of this shape
  }
  switch (reel.id) {
    case 'start-early': case 'guess-sip': return { tool: 'sip_calc', amount: reel.mine && mine.sip ? mine.sip : 5000, rate: 12, years: 30 };
    case 'emi-trap': case 'guess-emi': return reel.mine && mine.loan ? { tool: 'emi_calc', amount: mine.loan.balance, rate: mine.loan.rate, years: 20 } : { tool: 'emi_calc', amount: 1_000_000, rate: 9, years: 20 };
    case 'rbi-and-emi': return { tool: 'emi_calc', amount: 3_000_000, rate: 8.5, years: 20 };
    case 'inflation': return { tool: 'inflation_calc', amount: 100, rate: 6, years: 10 };
    default: return null;
  }
}

/** The parts of a base the question changes: a percentage is the rate, years or months the time, money the amount. A bare number is never guessed at. */
export function overrides(question: string): Partial<Pick<Base, 'amount' | 'rate' | 'years'>> {
  const out: Partial<Pick<Base, 'amount' | 'rate' | 'years'>> = {};
  const nums = numbers(question);
  const pct = nums.find(n => n.kind === 'pct'), yrs = nums.find(n => n.kind === 'years'), mo = nums.find(n => n.kind === 'months'), money = nums.find(n => n.kind === 'money');
  if (pct && pct.value > 0 && pct.value <= 50) out.rate = pct.value;
  if (yrs && yrs.value > 0 && yrs.value <= 60) out.years = yrs.value;
  else if (mo && mo.value > 0 && mo.value <= 720) out.years = mo.value / 12;
  if (money && money.value > 0) out.amount = money.value;
  return out;
}

export interface MitraAnswer {
  kind: 'whatif' | 'tool' | 'advice' | 'blocked' | 'none';
  /** A sentence in the app's language from Mitra herself (what she changed, or why she cannot answer). */
  note: L | null;
  /** The worked answer from the phone tool, in English, with no figure the tool did not compute. */
  text: string | null;
  source: string | null;
  asOf: number | null;
  route: string | null;
  routeLabel: string | null;
}

const none = (kind: MitraAnswer['kind'], note: L): MitraAnswer => ({ kind, note, text: null, source: null, asOf: null, route: null, routeLabel: null });

const ADVICE: L = {
  en: 'I cannot say what to buy, sell or hold. I can show what a number does: try “SIP of 10000 at 12% for 15 years”.',
  hi: 'क्या ख़रीदें, बेचें या रखें, यह मैं नहीं बता सकती। एक संख्या क्या करती है, यह दिखा सकती हूँ: “SIP of 10000 at 12% for 15 years” आज़माएँ।',
};
const BLOCKED: L = {
  en: 'That needs the internet or changes something. Here I only work out numbers on this phone.',
  hi: 'इसके लिए इंटरनेट चाहिए या यह कुछ बदलता है। यहाँ मैं सिर्फ़ इस फ़ोन पर संख्याएँ निकालती हूँ।',
};
const NOT_HERE: L = {
  en: 'I only answer number questions from here. For anything else, open Arya from the menu.',
  hi: 'यहाँ से मैं सिर्फ़ संख्याओं के सवालों के जवाब देती हूँ। बाक़ी के लिए मेन्यू से Arya खोलें।',
};
const OFFLINE_TOOLS = new Set<ToolId>(['quote', 'market', 'commodities', 'crypto', 'fx', 'technical', 'mf_nav', 'news', 'announcements']);
const NONE: L = {
  en: 'I did not catch a number to work with. Try “what if the rate is 10%?” or “EMI on 20 lakh at 9% for 15 years”.',
  hi: 'मुझे काम करने लायक़ कोई संख्या नहीं मिली। “what if the rate is 10%?” या “EMI on 20 lakh at 9% for 15 years” आज़माएँ।',
};

const fmtChanges = (o: Partial<Base>, lang: 'en' | 'hi') => [o.amount !== undefined && (lang === 'en' ? `amount ₹${Math.round(o.amount).toLocaleString('en-IN')}` : `रकम ₹${Math.round(o.amount).toLocaleString('en-IN')}`),
  o.rate !== undefined && (lang === 'en' ? `rate ${o.rate}%` : `दर ${o.rate}%`), o.years !== undefined && (lang === 'en' ? `${o.years} years` : `${o.years} साल`)].filter(Boolean).join(', ');

/** Answers a question about a reel (or, with no base, a general phone-tool question). */
export function askMitra(question: string, ctx: ToolCtx, base: Base | null = null): MitraAnswer {
  const q = String(question ?? '').trim().slice(0, 300);
  if (!q) return none('none', NONE);
  const intent = matchIntent(q);
  if (intent.kind === 'advice') return none('advice', ADVICE);
  const ov = overrides(q);
  const changed = Object.keys(ov).length > 0;

  // A what-if on the reel: nothing stated in full by the question itself, but a number that changes part of the reel's example.
  const stated = intent.kind === 'tool' && CALCS.has(intent.tool) && !(intent.args.defaulted?.length) && intent.args.amount !== undefined && intent.args.rate !== undefined && intent.args.years !== undefined;
  if (base && changed && !stated) {
    const args: Args = { amount: ov.amount ?? base.amount, rate: ov.rate ?? base.rate, years: ov.years ?? base.years };
    const r = runDeviceTool(base.tool, args, ctx);
    const what = fmtChanges(ov, 'en'), whatHi = fmtChanges(ov, 'hi');
    return { kind: 'whatif', note: { en: `Same as the reel, with ${what}.`, hi: `रील जैसा ही, पर ${whatHi}।` }, text: r.text, source: r.source, asOf: r.asOf, route: r.route, routeLabel: r.routeLabel };
  }
  if (intent.kind === 'tool') {
    if (!ALLOWED.includes(intent.tool)) return none('blocked', OFFLINE_TOOLS.has(intent.tool) ? BLOCKED : NOT_HERE);
    const r = runDeviceTool(intent.tool, intent.args, ctx);
    return { kind: 'tool', note: null, text: r.text, source: r.source, asOf: r.asOf, route: r.route, routeLabel: r.routeLabel };
  }
  if (intent.kind === 'ambiguous') {
    const ok = intent.options.find(o => ALLOWED.includes(o.tool));
    if (ok) { const r = runDeviceTool(ok.tool, ok.args, ctx); return { kind: 'tool', note: null, text: r.text, source: r.source, asOf: r.asOf, route: r.route, routeLabel: r.routeLabel }; }
    return none('blocked', BLOCKED);
  }
  return none('none', NONE);
}

/** Questions worth tapping for a reel: what-ifs on its own numbers, or a couple of general ones. */
export function suggestionsFor(base: Base | null): L[] {
  const l = (en: string, hi: string): L => ({ en, hi });
  if (!base) return [l('What is my savings rate?', 'मेरी बचत दर कितनी है?'), l('How many months does my emergency fund cover?', 'मेरा इमरजेंसी फ़ंड कितने महीने चलेगा?')];
  if (base.tool === 'sip_calc') return [l(`What if the rate is ${base.rate > 10 ? base.rate - 2 : base.rate + 2}%?`, `अगर दर ${base.rate > 10 ? base.rate - 2 : base.rate + 2}% हो तो?`), l(`What if for ${base.years - 10} years?`, `अगर ${base.years - 10} साल के लिए हो तो?`), l(`What if the amount is ₹${(base.amount * 2).toLocaleString('en-IN')}?`, `अगर रकम ₹${(base.amount * 2).toLocaleString('en-IN')} हो तो?`)];
  if (base.tool === 'emi_calc') return [l(`What if the rate is ${Math.max(1, base.rate - 1)}%?`, `अगर दर ${Math.max(1, base.rate - 1)}% हो तो?`), l(`What if for ${Math.max(1, base.years - 5)} years?`, `अगर ${Math.max(1, base.years - 5)} साल के लिए हो तो?`)];
  return [l(`What if inflation is ${base.rate - 1}%?`, `अगर महँगाई ${base.rate - 1}% हो तो?`), l(`What if for ${base.years * 2} years?`, `अगर ${base.years * 2} साल हो तो?`)];
}
