// The learning loop around the reels: which one to show next, what to do with it, and the day streak. Pure functions of the reels, the
// watched record, the saved Money Score and a date, so every rule is testable and nothing here needs a server.
import type { L, Reel } from '@/lib/reels/types';

export type Watched = Record<string, { at: string; correct: boolean }>;
export type PillarId = 'savings' | 'emergency' | 'insurance' | 'debt' | 'investing' | 'wealth';

const DAY = 86_400_000;
const l = (en: string, hi: string): L => ({ en, hi });

/** Which reels speak to which Money Score pillar, strongest match first. */
export const PILLAR_REELS: Record<PillarId, string[]> = {
  savings: ['cash-flow', 'inflation', 'goal-inflation'],
  emergency: ['emergency-fund', 'cash-flow'],
  insurance: ['insurance-basics', 'life-cover'],
  debt: ['emi-trap', 'card-interest-trap', 'good-bad-debt', 'rbi-and-emi', 'home-loan-tenure', 'home-loan-prepay'],
  investing: ['start-early', 'goal-sip-needed', 'mf-units-nav', 'direct-vs-regular', 'goal-step-up'],
  wealth: ['hundred-minus-age', 'retire-corpus', 'rule-of-72', 'withdrawal-rate', 'start-early'],
};
export const PILLAR_NAME: Record<PillarId, L> = {
  savings: l('savings rate', 'बचत दर'), emergency: l('emergency fund', 'इमरजेंसी फ़ंड'), insurance: l('insurance cover', 'बीमा कवर'),
  debt: l('debt load', 'क़र्ज़ का बोझ'), investing: l('investing habit', 'निवेश की आदत'), wealth: l('wealth for your age', 'उम्र के हिसाब से संपत्ति'),
};

/** What to do about it: the tool that applies the lesson. Routes are checked against the app's files and calculator list by a test. */
export interface Act { href: string; label: L }
export const ACT: Record<string, Act> = {
  'tax-regimes': { href: '/tools/tax', label: l('Compare the two regimes on your pay', 'अपनी आय पर दोनों रिजीम की तुलना करें') },
  'section-80c': { href: '/tools/taxplanner', label: l('See how much you can still claim', 'देखें अभी कितना क्लेम कर सकते हैं') },
  'tds-refund': { href: '/tools/itr', label: l('Get ready to file your return', 'रिटर्न भरने की तैयारी करें') },
  'capital-gains': { href: '/tracker/harvest', label: l('See your gains and losses', 'अपने गेन और लॉस देखें') },
  'tax-dates': { href: '/tools/calendar', label: l('Put the dates in your calendar', 'तारीख़ें कैलेंडर में डालें') },
  'retire-corpus': { href: '/tools/retirement', label: l('Check your retirement odds', 'अपनी रिटायरमेंट की संभावना जाँचें') },
  'epf-basics': { href: '/tracker/epf', label: l('Track your EPF', 'अपना EPF ट्रैक करें') },
  'nps-basics': { href: '/tracker/nps', label: l('Track your NPS', 'अपना NPS ट्रैक करें') },
  'ppf-basics': { href: '/tracker/ppf', label: l('Track your PPF', 'अपना PPF ट्रैक करें') },
  'withdrawal-rate': { href: '/tools/calc/swp', label: l('Try a withdrawal plan', 'निकासी योजना आज़माएँ') },
  'credit-score-basics': { href: '/tools/credit', label: l('Check your credit habits', 'अपनी क्रेडिट आदतें जाँचें') },
  'credit-utilisation': { href: '/tools/credit', label: l('Check your card usage', 'अपने कार्ड का इस्तेमाल जाँचें') },
  'card-interest-trap': { href: '/tools/calc/creditcard', label: l('See what your card balance costs', 'देखें आपके कार्ड की बकाया रकम कितनी महँगी है') },
  'credit-enquiries': { href: '/tools/credit', label: l('Check your credit habits', 'अपनी क्रेडिट आदतें जाँचें') },
  'home-loan-affordability': { href: '/tools/calc/loaneligibility', label: l('Check what you can borrow', 'देखें आप कितना उधार ले सकते हैं') },
  'home-loan-tenure': { href: '/tools/calc/loantenure', label: l('Compare tenures', 'अवधियों की तुलना करें') },
  'home-loan-prepay': { href: '/tools/prepay', label: l('See what prepaying would save', 'देखें प्रीपेमेंट से कितनी बचत होगी') },
  'home-loan-costs': { href: '/tools/homeloan', label: l('Plan your home loan', 'अपना होम लोन प्लान करें') },
  'goal-sip-needed': { href: '/tools/goalopt', label: l('Work out your goal’s monthly amount', 'अपने लक्ष्य की मासिक रकम निकालें') },
  'goal-time-buckets': { href: '/tracker/goals', label: l('Sort your goals', 'अपने लक्ष्य छाँटें') },
  'goal-inflation': { href: '/tools/calc/inflationimpact', label: l('Add inflation to a goal', 'किसी लक्ष्य में महँगाई जोड़ें') },
  'goal-step-up': { href: '/tools/stepup', label: l('Try a step-up SIP', 'स्टेप-अप SIP आज़माएँ') },
  'start-early': { href: '/tools/calc/sip', label: l('Try the SIP calculator with your numbers', 'अपने आँकड़ों से SIP कैलकुलेटर आज़माएँ') },
  'inflation': { href: '/tools/calc/inflationimpact', label: l('See what your expenses will cost later', 'देखें आपका ख़र्च आगे कितना होगा') },
  'emi-trap': { href: '/tools/prepay', label: l('See what prepaying would save you', 'देखें प्रीपेमेंट से कितनी बचत होगी') },
  'emergency-fund': { href: '/tools/score', label: l('Check your emergency fund in Money Score', 'Money Score में अपना इमरजेंसी फ़ंड जाँचें') },
  'rule-of-72': { href: '/tools/calc/compounding', label: l('Try compounding with your numbers', 'अपने आँकड़ों से कंपाउंडिंग देखें') },
  'good-bad-debt': { href: '/tools/debt', label: l('Look at your own debts', 'अपने क़र्ज़ देखें') },
  'rbi-and-emi': { href: '/tools/homeloan', label: l('Check your home loan', 'अपना होम लोन जाँचें') },
  'mf-units-nav': { href: '/funds', label: l('Browse funds and read their goals', 'फ़ंड देखें और उनके उद्देश्य पढ़ें') },
  'direct-vs-regular': { href: '/funds/expense', label: l('Compare fund costs', 'फ़ंड के ख़र्च की तुलना करें') },
  'insurance-basics': { href: '/insurance', label: l('Review your insurance', 'अपना बीमा देखें') },
  'life-cover': { href: '/tools/lifecover', label: l('Estimate your life cover', 'अपने लाइफ़ कवर का अनुमान लगाएँ') },
  'hundred-minus-age': { href: '/tools/rebalance', label: l('Check your own mix', 'अपना मिश्रण जाँचें') },
  'cash-flow': { href: '/tools/leak', label: l('Find where your money leaks', 'देखें आपका पैसा कहाँ बहता है') },
};

// ── day streak ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Local calendar day as YYYY-MM-DD. */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dayNum = (k: string): number => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };

/** Keeps well-formed unique day keys, newest last, at most `max` of them. */
export function cleanDays(raw: unknown, max = 120): string[] {
  if (!Array.isArray(raw)) return [];
  const ok = raw.filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(dayNum(x)));
  return Array.from(new Set(ok)).sort().slice(-max);
}

/** Consecutive days with a finished reel, counting back from today. Today not done yet does not break yesterday's streak. */
export function streakOf(days: string[], today: string): { streak: number; doneToday: boolean; best: number } {
  const set = new Set(days.filter(d => dayNum(d) <= dayNum(today)));
  const doneToday = set.has(today);
  let cur = dayNum(today) - (doneToday ? 0 : 1), streak = 0;
  const nums = new Set([...set].map(dayNum));
  while (nums.has(cur)) { streak++; cur--; }
  const sorted = [...nums].sort((a, b) => a - b);
  let best = 0, run = 0, prev = NaN;
  for (const n of sorted) { run = n === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = n; }
  return { streak, doneToday, best };
}

// ── which reel next ────────────────────────────────────────────────────────────────────────────────────────────────

export interface Ranked { reel: Reel; reason: L | null; why: 'review' | 'timely' | 'gentle' | 'blind' | 'pillar' | 'new' | 'refresh' | 'done' }
export interface RankInput { watched: Watched; weakest: PillarId | null; now: Date }

/**
 * Orders the reels for this person: a question they got wrong (after a day), then new reels about their weakest Money Score pillar, then
 * other new reels, then a refresher of what they got right a week ago, then everything else. Ties keep the library's own order.
 */
export function rankReels(reels: Reel[], { watched, weakest, now }: RankInput): Ranked[] {
  const preferred = weakest ? PILLAR_REELS[weakest] ?? [] : [];
  const scored = reels.map((reel, i) => {
    const w = watched[reel.id];
    const age = w ? (now.getTime() - new Date(w.at).getTime()) / DAY : Infinity;
    let score = 0, why: Ranked['why'] = 'done', reason: L | null = null;
    if (w && !w.correct && age >= 1) { score = 100; why = 'review'; reason = l('You missed this question. Try it again.', 'यह सवाल छूट गया था। फिर कोशिश करें।'); }
    else if (!w) {
      const k = preferred.indexOf(reel.id);
      if (weakest && k >= 0) { score = 80 - k; why = 'pillar'; reason = l(`Your ${PILLAR_NAME[weakest].en} is your lowest Money Score pillar.`, `आपका ${PILLAR_NAME[weakest].hi} आपके Money Score का सबसे कमज़ोर हिस्सा है।`); }
      else { score = 50; why = 'new'; }
    } else if (w.correct && age >= 7) { score = 20; why = 'refresh'; reason = l('A week on: a quick refresher.', 'एक हफ़्ते बाद: एक छोटा दोहराव।'); }
    else if (w && !w.correct) { score = 10; why = 'done'; }
    return { reel, reason, why, score, i };
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map(({ reel, reason, why }) => ({ reel, reason, why }));
}

/** Per topic: how many reels there are, how many were watched and how many answered right. */
export function topicProgress(reels: Reel[], watched: Watched): Record<string, { total: number; watched: number; right: number }> {
  const out: Record<string, { total: number; watched: number; right: number }> = {};
  for (const r of reels) {
    const o = (out[r.topic] ??= { total: 0, watched: 0, right: 0 });
    o.total++;
    if (watched[r.id]) { o.watched++; if (watched[r.id].correct) o.right++; }
  }
  return out;
}
