// Seven-day challenges: one small task a day, each ending in a real thing done (a subscription cancelled, a limit set, a phone made safer).
// A habit, not a game: one task per calendar day at most, a missed day costs nothing (the next task simply waits), and nothing is scored or
// compared. Done is the person's own word, so it is honest and private. Pure functions of the state and "now", tested with known answers.
import { isPlainObject, parseJSON } from '@/lib/safeStore';
import { dayKey, dayNum } from '@/lib/reels/journey';
import type { L } from '@/lib/reels/types';

const l = (en: string, hi: string): L => ({ en, hi });

export interface ChallengeDay { title: L; body: L; /** a screen that helps with the task */ href?: string; hrefLabel?: L }
export interface Challenge { id: string; title: L; blurb: L; days: ChallengeDay[]; end: L }

export const CHALLENGES: Challenge[] = [
  {
    id: 'leak-week',
    title: l('Find your leak in 7 days', '7 दिन में अपना रिसाव ढूँढें'),
    blurb: l('One small step a day to see where your money quietly goes, and plug one hole.', 'हर दिन एक छोटा क़दम: देखें पैसा चुपचाप कहाँ जाता है, और एक छेद बंद करें।'),
    days: [
      { title: l('Log today’s spending', 'आज का ख़र्च दर्ज करें'), body: l('Write down everything you spent today, even the small things.', 'आज जो भी ख़र्च किया, छोटा-बड़ा सब लिख लें।'), href: '/tracker/transactions', hrefLabel: l('Open transactions', 'लेन-देन खोलें') },
      { title: l('List your subscriptions', 'अपनी सब्सक्रिप्शन की सूची बनाएँ'), body: l('List every app, channel and service that charges you each month.', 'हर ऐप, चैनल और सेवा लिखें जो हर महीने आपसे पैसे लेती है।'), href: '/tracker/subscriptions', hrefLabel: l('Open subscriptions', 'सब्सक्रिप्शन खोलें') },
      { title: l('Cancel or pause one', 'एक रद्द करें या रोकें'), body: l('Pick one you barely use and cancel or pause it.', 'ऐसी एक चुनें जो मुश्किल से इस्तेमाल होती है, और उसे रद्द करें या रोकें।'), href: '/tracker/subscriptions', hrefLabel: l('Open subscriptions', 'सब्सक्रिप्शन खोलें') },
      { title: l('Find your biggest category', 'अपनी सबसे बड़ी मद ढूँढें'), body: l('Look at where most of your money goes this month.', 'देखें इस महीने ज़्यादातर पैसा कहाँ जाता है।'), href: '/tools/leak', hrefLabel: l('Open the leak finder', 'रिसाव खोजक खोलें') },
      { title: l('Give it a limit', 'उसकी एक सीमा तय करें'), body: l('Set a monthly limit for that category that feels fair.', 'उस मद की एक मासिक सीमा तय करें जो आपको ठीक लगे।'), href: '/tracker/budget', hrefLabel: l('Open budget', 'बजट खोलें') },
      { title: l('Check the week', 'हफ़्ते का हाल देखें'), body: l('Compare this week’s spending with your limit.', 'इस हफ़्ते का ख़र्च अपनी सीमा से मिलाएँ।'), href: '/tracker/transactions', hrefLabel: l('Open transactions', 'लेन-देन खोलें') },
      { title: l('Pick one habit to change', 'बदलने के लिए एक आदत चुनें'), body: l('Choose one small habit to change next month, and write it down.', 'अगले महीने बदलने के लिए एक छोटी आदत चुनें और उसे लिख लें।') },
    ],
    end: l('You looked at where your money goes for seven days. Keep the limit, and check it once a week.', 'आपने सात दिन देखा कि पैसा कहाँ जाता है। सीमा रखें, और हफ़्ते में एक बार जाँचें।'),
  },
  {
    id: 'scam-proof-week',
    title: l('Scam-proof your phone in 7 days', '7 दिन में अपना फ़ोन ठगी-रोधी बनाएँ'),
    blurb: l('One small setting a day, so a scam call or message has less to work with.', 'हर दिन एक छोटी सेटिंग, ताकि ठगी वाले कॉल या मैसेज के पास कम मौक़ा रहे।'),
    days: [
      { title: l('Lock your payment apps', 'पेमेंट ऐप को लॉक करें'), body: l('Turn on the screen lock or PIN inside each payment app.', 'हर पेमेंट ऐप के अंदर स्क्रीन लॉक या PIN चालू करें।') },
      { title: l('Clear old links', 'पुराने लिंक हटाएँ'), body: l('Delete old messages with links you do not trust. Never click one that asks for KYC or an OTP.', 'जिन लिंक पर भरोसा नहीं, उनके पुराने मैसेज मिटाएँ। KYC या OTP माँगने वाले लिंक पर कभी क्लिक न करें।') },
      { title: l('Set a payment limit', 'भुगतान की सीमा तय करें'), body: l('Set a daily limit in your payment apps or bank app that fits your normal use.', 'अपने पेमेंट ऐप या बैंक ऐप में रोज़ की ऐसी सीमा तय करें जो आपके आम इस्तेमाल से मेल खाए।') },
      { title: l('Turn on bank alerts', 'बैंक अलर्ट चालू करें'), body: l('Turn on an alert for every transaction on each account.', 'हर खाते में हर लेन-देन का अलर्ट चालू करें।') },
      { title: l('Save the right numbers', 'सही नंबर सेव करें'), body: l('Save your bank’s official care number from its own app, and the national cybercrime helpline, 1930.', 'अपने बैंक के अपने ऐप से उसका आधिकारिक केयर नंबर, और राष्ट्रीय साइबर क्राइम हेल्पलाइन 1930 सेव करें।') },
      { title: l('Tell one person', 'एक व्यक्ति को बताएँ'), body: l('Tell a family member about the OTP and “digital arrest” scams.', 'परिवार के किसी सदस्य को OTP और “डिजिटल अरेस्ट” ठगी के बारे में बताएँ।') },
      { title: l('Trim app permissions', 'ऐप की अनुमतियाँ घटाएँ'), body: l('Remove permissions, especially for messages and screen sharing, from apps that do not need them.', 'जिन ऐप को ज़रूरत नहीं, उनसे अनुमतियाँ हटाएँ, ख़ासकर मैसेज और स्क्रीन शेयर की।') },
    ],
    end: l('Your phone is a little harder to scam. Pause before every urgent message, and check in your bank’s own app.', 'आपका फ़ोन अब थोड़ा ज़्यादा ठगी-रोधी है। हर जल्दबाज़ी वाले मैसेज से पहले रुकें, और अपने बैंक के ही ऐप में जाँचें।'),
  },
];

export const challengeById = (id: string): Challenge | undefined => CHALLENGES.find(c => c.id === id);

// ── the person's progress ─────────────────────────────────────────────────────────────────────────────────────

export interface Run {
  id: string;
  /** The day (YYYY-MM-DD) it was started. */
  start: string;
  /** The calendar day each finished task was marked done, in order: done[0] is task 1. */
  done: string[];
}
export interface ChallengeState { v: 1; runs: Run[] }
export const EMPTY_CHALLENGES: ChallengeState = { v: 1, runs: [] };

/** A run with no progress for this many days is dropped, so an old abandoned one never lingers. */
export const STALE_DAYS = 30;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseChallenges(raw: string | null | undefined): ChallengeState {
  const p = parseJSON(raw ?? null);
  if (!p.ok || !isPlainObject(p.value) || !Array.isArray((p.value as { runs?: unknown }).runs)) return { v: 1, runs: [] };
  const runs: Run[] = [];
  for (const r of (p.value as { runs: unknown[] }).runs) {
    if (!isPlainObject(r)) continue;
    const o = r as { id?: unknown; start?: unknown; done?: unknown };
    const c = typeof o.id === 'string' ? challengeById(o.id) : undefined;
    if (!c || typeof o.start !== 'string' || !DAY.test(o.start) || !Number.isFinite(dayNum(o.start)) || !Array.isArray(o.done)) continue;
    const done: string[] = [];
    for (const d of o.done) { if (typeof d === 'string' && DAY.test(d) && Number.isFinite(dayNum(d)) && done.length < c.days.length && (done.length === 0 || dayNum(d) > dayNum(done[done.length - 1]))) done.push(d); }
    if (!runs.some(x => x.id === c.id)) runs.push({ id: c.id, start: o.start, done });
  }
  return { v: 1, runs };
}

export const runOf = (s: ChallengeState, id: string): Run | undefined => s.runs.find(r => r.id === id);
export const isFinished = (r: Run): boolean => { const c = challengeById(r.id); return !!c && r.done.length >= c.days.length; };

export interface Today {
  /** 0-based index of the next task to do. */
  index: number;
  /** False when a task was already marked done today: the next one waits for tomorrow. */
  available: boolean;
  finished: boolean;
}

export function todayOf(r: Run, now: Date): Today {
  const c = challengeById(r.id);
  const finished = !!c && r.done.length >= c.days.length;
  const doneToday = r.done.length > 0 && r.done[r.done.length - 1] === dayKey(now);
  return { index: Math.min(r.done.length, (c?.days.length ?? 1) - 1), available: !finished && !doneToday, finished };
}

/** Starts a challenge (or restarts a finished or stale one). Starting one that is in progress changes nothing. */
export function startChallenge(s: ChallengeState, id: string, now: Date): ChallengeState {
  const c = challengeById(id);
  if (!c) return s;
  const cur = runOf(s, id);
  if (cur && !isFinished(cur) && !isStale(cur, now)) return s;
  return { v: 1, runs: [...s.runs.filter(r => r.id !== id), { id, start: dayKey(now), done: [] }] };
}

/** Marks the next task done for today. At most one a day; nothing changes if today's task is already done or the challenge is finished. */
export function completeToday(s: ChallengeState, id: string, now: Date): ChallengeState {
  const cur = runOf(s, id);
  if (!cur) return s;
  const t = todayOf(cur, now);
  if (!t.available) return s;
  return { v: 1, runs: s.runs.map(r => (r.id === id ? { ...r, done: [...r.done, dayKey(now)] } : r)) };
}

/** The last day anything happened in a run. */
const lastDay = (r: Run): string => (r.done.length ? r.done[r.done.length - 1] : r.start);
export const isStale = (r: Run, now: Date): boolean => !isFinished(r) && dayNum(dayKey(now)) - dayNum(lastDay(r)) > STALE_DAYS;

/** Drops runs nobody has touched for a month. */
export const pruneStale = (s: ChallengeState, now: Date): ChallengeState => { const runs = s.runs.filter(r => !isStale(r, now)); return runs.length === s.runs.length ? s : { v: 1, runs }; };
