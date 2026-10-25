// Control and transparency for the Money Reels: everything the reels have learned about the person on this phone, in plain words and both
// languages, what resetting each part does, and one sentence on why a reel was chosen. Pure: it reads state that is passed in and returns
// text. Nothing here stores, sends or changes anything (the resets are in lib/reels/transparencyStorage.ts). The Hindi is a draft for a native reviewer.
import { libraryById } from '@/lib/reels/library';
import { TOPIC_NAME } from '@/lib/reels/map';
import { TOPIC_LIST, TIPS_MAX, type ReelsProfile } from '@/lib/reels/reelsProfile';
import { METRIC_OF, type MovesState } from '@/lib/reels/moves';
import { LEVEL_OPTIONS } from '@/lib/reels/coldstart';
import { milestoneById } from '@/lib/reels/milestones';
import { healthOf, type StatsState } from '@/lib/reels/stats';
import { CHALLENGES, challengeById, isFinished, type ChallengeState } from '@/lib/reels/challenges';
import { followupsOn, fromLocalIso, type MoveReminder, type NotifyPrefs, type NudgePrefs } from '@/lib/reels/reminders';
import { SPEEDS, type VoicePrefs } from '@/lib/reels/voicePrefs';
import { money } from '@/lib/reels/figures';
import { MINE_KEYS, type Mine } from '@/lib/reels/mine';
import { SEASON_NOTES } from '@/lib/reels/triggers';
import type { Ranked, Watched } from '@/lib/reels/journey';
import type { L, Reel } from '@/lib/reels/types';

const l = (en: string, hi: string): L => ({ en, hi });
const num = (n: number): string => String(n);

/** Every part the person can look at and reset on its own. */
export type PartId = 'known' | 'less' | 'saved' | 'pledges' | 'milestones' | 'play' | 'moves' | 'watched' | 'stats' | 'challenges' | 'reminders' | 'voice' | 'housekeeping' | 'welcome';
export const PART_IDS: PartId[] = ['known', 'less', 'saved', 'pledges', 'milestones', 'welcome', 'play', 'moves', 'watched', 'stats', 'challenges', 'reminders', 'voice', 'housekeeping'];

/** The storage keys that hold each part (from lib/privacy.ts's registry). A key that belongs to no part fails a test, so a new one cannot be forgotten. */
export const PART_KEYS: Record<PartId, string[]> = {
  known: ['finos_session_reels_profile'], less: ['finos_session_reels_profile'], saved: ['finos_session_reels_profile'], pledges: ['finos_session_reels_profile'],
  milestones: ['finos_session_reels_profile'], welcome: ['finos_session_reels_profile'], play: ['finos_session_reels_profile'], housekeeping: ['finos_session_reels_profile'],
  moves: ['finos_session_reels_moves'],
  watched: ['finos_reels_watched', 'finos_reels_days'],
  stats: ['finos_session_reels_stats'],
  challenges: ['finos_session_reels_challenges'],
  reminders: ['finos_session_reels_nudge', 'finos_session_reels_reminders', 'finos_session_reels_notify'],
  voice: ['finos_session_reels_voice'],
};
/** All the keys above, once each. */
export const ALL_PART_KEYS: string[] = Array.from(new Set(PART_IDS.flatMap(id => PART_KEYS[id])));
/** The only reels keys that sync with the person's other tracker data (and only if they sign in). Every other reels key starts with `finos_session_`: never uploaded. */
export const SYNCED_KEYS = ['finos_reels_watched', 'finos_reels_days'];

export interface Part {
  id: PartId;
  title: L;
  /** One plain sentence about what is held. */
  summary: L;
  /** Detail lines (reel titles, topics, statuses), already in both languages. At most MAX_LINES; `more` says how many were left out. */
  lines: L[];
  more: number;
  count: number;
  empty: boolean;
  keys: string[];
  /** Whether this part syncs with the person's tracker data when they sign in. */
  synced: boolean;
  reset: { label: L; /** what resetting does, and what it leaves alone */ does: L; confirmTitle: L };
}

export interface ReelsKnowledge {
  profile: ReelsProfile; moves: MovesState; stats: StatsState; challenges: ChallengeState; watched: Watched; days: string[];
  nudge: NudgePrefs; notify: NotifyPrefs; moveReminders: MoveReminder[]; voice: VoicePrefs; mine: Mine;
}

export const MAX_LINES = 8;

const titleOf = (id: string): L => libraryById(id)?.title ?? l('A reel that is no longer in the app', 'एक रील जो अब ऐप में नहीं है');
const clip = (lines: L[]): { lines: L[]; more: number } => ({ lines: lines.slice(0, MAX_LINES), more: Math.max(0, lines.length - MAX_LINES) });
const cnt = (n: number, en1: string, enN: string, hi: string): L => l(`${num(n)} ${n === 1 ? en1 : enN}`, `${num(n)} ${hi}`);
const dash = (a: L, b: L): L => l(`${a.en} — ${b.en}`, `${a.hi} — ${b.hi}`);

function resetOf(label: L, does: L, confirmTitle: L): Part['reset'] { return { label, does, confirmTitle }; }
const FORGET_ONLY = l('It only makes the reels forget. Your trackers, goals and scores are not touched.', 'इससे सिर्फ़ रील्स भूलती हैं। आपके ट्रैकर, लक्ष्य और स्कोर को छुआ नहीं जाता।');

/** The plain-words picture of how the person plays with the interactive parts. No jargon, and nothing is said until there is enough to go on. */
export function playStyle(shown: number, engaged: number): L {
  if (shown < 3) return l('Not enough yet to tell whether you like the interactive parts.', 'अभी इतना नहीं पता कि आपको इंटरैक्टिव हिस्से पसंद हैं या नहीं।');
  const rate = engaged / shown;
  if (rate >= 0.6) return l('You like to try things: you play with most of the interactive parts, so the reels offer you a few more.', 'आपको आज़माना पसंद है: आप ज़्यादातर इंटरैक्टिव हिस्सों के साथ खेलते हैं, इसलिए रील्स आपको थोड़े ज़्यादा दिखाती हैं।');
  if (rate >= 0.3) return l('You try some of the interactive parts and skip others, so the reels keep a balance.', 'आप कुछ इंटरैक्टिव हिस्से आज़माते हैं और कुछ छोड़ देते हैं, इसलिए रील्स संतुलन रखती हैं।');
  return l('You mostly read on without playing, so the reels offer you a few fewer interactive parts.', 'आप ज़्यादातर खेले बिना आगे पढ़ते हैं, इसलिए रील्स आपको कुछ कम इंटरैक्टिव हिस्से दिखाती हैं।');
}

const METRIC_NAME: Record<'sip' | 'fund' | 'loan', L> = {
  sip: l('your SIP', 'आपकी SIP'), fund: l('your emergency fund', 'आपका इमरजेंसी फ़ंड'), loan: l('your loan balance', 'आपके लोन की बकाया रकम'),
};

function part(p: Omit<Part, 'more' | 'lines' | 'keys' | 'synced' | 'empty'> & { lines?: L[]; empty?: boolean }): Part {
  const { lines, more } = clip(p.lines ?? []);
  return { ...p, lines, more, keys: PART_KEYS[p.id], synced: PART_KEYS[p.id].some(k => SYNCED_KEYS.includes(k)), empty: p.empty ?? p.count === 0 };
}

/** Every part, in the order the screen shows them. */
export function summariseReels(k: ReelsKnowledge, now: Date = new Date()): Part[] {
  const pr = k.profile;
  const out: Part[] = [];

  // reels you said you know
  out.push(part({
    id: 'known', title: l('Reels you said you know', 'वे रीलें जो आपने कहा आपको पता हैं'), count: pr.known.length,
    summary: pr.known.length ? l(`You told the reels you already know ${num(pr.known.length)} of them, so they stay out of your daily picks.`, `आपने रील्स को बताया कि ${num(pr.known.length)} रीलें आपको पहले से पता हैं, इसलिए वे रोज़ की पसंद में नहीं आतीं।`) : l('You have not told the reels you know any of them.', 'आपने रील्स को नहीं बताया कि आपको कोई रील पहले से पता है।'),
    lines: pr.known.map(titleOf),
    reset: resetOf(l('Forget what I know', 'जो मुझे पता है वह भुला दें'), l('Those reels can come up in your daily picks again.', 'वे रीलें फिर से रोज़ की पसंद में आ सकती हैं।'), l('Forget the reels you know?', 'जो रीलें आपको पता हैं, उन्हें भुला दें?')),
  }));

  // topics you asked for less of
  const lessTopics = TOPIC_LIST.filter(t => (pr.less[t] ?? 0) > 0);
  out.push(part({
    id: 'less', title: l('Topics you asked for less of', 'वे विषय जिनकी आपने कम माँग की'), count: lessTopics.length,
    summary: lessTopics.length ? l(`You asked for less of ${num(lessTopics.length)} ${lessTopics.length === 1 ? 'topic' : 'topics'}. Each ask moves it a notch down your picks, up to three notches.`, `आपने ${num(lessTopics.length)} विषयों की कम माँग की। हर माँग उसे आपकी पसंद में एक पायदान नीचे ले जाती है, तीन पायदान तक।`) : l('You have not asked for less of any topic.', 'आपने किसी विषय की कम माँग नहीं की।'),
    lines: lessTopics.map(t => { const n = pr.less[t] ?? 0; return l(`${TOPIC_NAME[t].en}: ${num(n)} ${n === 1 ? 'notch' : 'notches'} lower`, `${TOPIC_NAME[t].hi}: ${num(n)} पायदान नीचे`); }),
    reset: resetOf(l('Forget my “less of this”', '“इसकी कम” की मेरी माँगें भुला दें'), l('Those topics are no longer held back, so they may come up more often.', 'उन विषयों को अब रोका नहीं जाता, इसलिए वे ज़्यादा बार आ सकते हैं।'), l('Forget your “less of this” asks?', '“इसकी कम” की माँगें भुला दें?')),
  }));

  // saved
  const saved = pr.saved ?? [];
  out.push(part({
    id: 'saved', title: l('Reels you saved', 'आपकी सेव की हुई रीलें'), count: saved.length,
    summary: saved.length ? l(`You kept ${num(saved.length)} ${saved.length === 1 ? 'reel' : 'reels'} to watch later. They get a small lift in your picks until you watch them.`, `आपने ${num(saved.length)} रीलें बाद में देखने के लिए रखी हैं। देखने तक वे आपकी पसंद में थोड़ा ऊपर रहती हैं।`) : l('You have not saved any reel.', 'आपने कोई रील सेव नहीं की।'),
    lines: [...saved].reverse().map(titleOf),
    reset: resetOf(l('Empty my saved list', 'मेरी सेव सूची ख़ाली करें'), l('The reels are not deleted; they just leave your saved list.', 'रीलें मिटती नहीं; बस आपकी सेव सूची से हट जाती हैं।'), l('Empty your saved list?', 'अपनी सेव सूची ख़ाली करें?')),
  }));

  // moves on your list
  const pledges = pr.pledges ?? [];
  out.push(part({
    id: 'pledges', title: l('Moves on your list', 'आपकी सूची के काम'), count: pledges.length,
    summary: pledges.length ? l(`You said “I’ll do this” about ${num(pledges.length)} ${pledges.length === 1 ? 'move' : 'moves'}. A reel may mention one gently, at most twice.`, `आपने ${num(pledges.length)} कामों के बारे में “मैं यह करूँगा” कहा। कोई रील नरमी से एक का ज़िक्र कर सकती है, ज़्यादा से ज़्यादा दो बार।`) : l('Your list of moves is empty.', 'आपके कामों की सूची ख़ाली है।'),
    lines: [...pledges].reverse().map(x => {
      const status = k.moves.receipts.some(r => r.id === x.id) ? l('your figure improved', 'आपका आँकड़ा सुधरा') : k.moves.open.some(m => m.id === x.id) ? l('watching your figure', 'आपका आँकड़ा देखा जा रहा है') : METRIC_OF[x.id] ? l('not started', 'अभी शुरू नहीं हुआ') : l('whenever you are ready', 'जब आप तैयार हों');
      return dash(titleOf(x.id), status);
    }),
    reset: resetOf(l('Clear my list of moves', 'मेरे कामों की सूची साफ़ करें'), l('The list on My moves empties. It does not undo anything you already did.', 'मेरे काम की सूची ख़ाली हो जाती है। जो आप कर चुके हैं, वह वापस नहीं होता।'), l('Clear your list of moves?', 'अपने कामों की सूची साफ़ करें?')),
  }));

  // milestones
  const ms = (pr.ms ?? []).map(id => milestoneById(id)).filter((m): m is NonNullable<ReturnType<typeof milestoneById>> => !!m);
  const seen = pr.msSeen?.length ?? 0;
  out.push(part({
    id: 'milestones', title: l('Real changes the reels noticed', 'असली बदलाव जो रील्स ने देखे'), count: ms.length, empty: ms.length === 0 && !pr.hadLoan,
    summary: ms.length
      ? l(`The reels noticed ${num(ms.length)} ${ms.length === 1 ? 'change' : 'changes'} in your own figures (${num(seen)} already shown to you). They are noticed from numbers already in your trackers, never from using the app.`, `रील्स ने आपके अपने आँकड़ों में ${num(ms.length)} बदलाव देखे (${num(seen)} आपको दिखाए जा चुके हैं)। ये आपके ट्रैकर के पहले से मौजूद आँकड़ों से देखे जाते हैं, ऐप चलाने से नहीं।`)
      : pr.hadLoan ? l('No change noticed yet. The reels remember that a loan has been in your figures, so a cleared loan can be told apart from never having had one.', 'अभी कोई बदलाव नहीं देखा गया। रील्स को याद है कि आपके आँकड़ों में कभी लोन था, ताकि चुकाए गए लोन और कभी लोन न होने में फ़र्क़ किया जा सके।')
      : l('Nothing noticed yet.', 'अभी कुछ नहीं देखा गया।'),
    lines: ms.map(m => m.title),
    reset: resetOf(l('Forget the changes noticed', 'देखे गए बदलाव भुला दें'), l('The next visit takes a fresh look at your figures and celebrates nothing that was already true.', 'अगली बार रील्स आपके आँकड़ों को नए सिरे से देखती हैं और जो पहले से सच था, उसका जश्न नहीं मनातीं।'), l('Forget the changes noticed?', 'देखे गए बदलाव भुला दें?')),
  }));

  // what you told the welcome
  const st = pr.start;
  const goalNames = st && !st.skipped ? st.goals.map(g => TOPIC_NAME[g]) : [];
  const levelName = st && !st.skipped ? LEVEL_OPTIONS.find(o => o.id === st.level)?.label : undefined;
  out.push(part({
    id: 'welcome', title: l('What you told the welcome', 'जो आपने स्वागत में बताया'), count: st ? 1 : 0,
    summary: !st ? l('You have not answered the welcome questions yet.', 'आपने स्वागत के सवालों के जवाब अभी नहीं दिए।')
      : st.skipped ? l('You skipped the welcome questions, so nothing is assumed about you.', 'आपने स्वागत के सवाल छोड़ दिए, इसलिए आपके बारे में कुछ नहीं माना गया।')
      : l('You told the reels what you are here for and how comfortable you are with money terms. It gives your first week of picks a small nudge that fades away.', 'आपने रील्स को बताया कि आप किसलिए आए हैं और पैसों के शब्दों से कितने सहज हैं। इससे आपके पहले हफ़्ते की पसंद को एक हल्का झुकाव मिलता है जो धीरे-धीरे ख़त्म हो जाता है।'),
    lines: [
      ...(goalNames.length ? [l(`Here for: ${goalNames.map(x => x.en).join(', ')}`, `किसलिए: ${goalNames.map(x => x.hi).join(', ')}`)] : []),
      ...(levelName ? [l(`With money terms: ${levelName.en}`, `पैसों के शब्दों से: ${levelName.hi}`)] : []),
    ],
    reset: resetOf(l('Forget my welcome answers', 'मेरे स्वागत के जवाब भुला दें'), l('The welcome questions come back the next time you open the reels, and the first-week nudge stops.', 'अगली बार रील्स खोलने पर स्वागत के सवाल फिर आएँगे और पहले हफ़्ते का झुकाव रुक जाएगा।'), l('Forget your welcome answers?', 'अपने स्वागत के जवाब भुला दें?')),
  }));

  // how you play
  const shown = pr.fmt?.shown ?? 0, engaged = pr.fmt?.engaged ?? 0;
  out.push(part({
    id: 'play', title: l('How you play with the reels', 'आप रील्स के साथ कैसे खेलते हैं'), count: shown,
    summary: shown ? playStyle(shown, engaged) : l('Nothing learned yet about how you like the interactive parts.', 'इंटरैक्टिव हिस्सों के बारे में अभी कुछ पता नहीं चला।'),
    lines: shown >= 3 ? [l(`${num(shown)} interactive parts shown, you played with ${num(engaged)}.`, `${num(shown)} इंटरैक्टिव हिस्से दिखे, आपने ${num(engaged)} के साथ खेला।`)] : [],
    reset: resetOf(l('Forget how I play', 'मैं कैसे खेलता हूँ यह भुला दें'), l('The reels stop leaning either way and show interactive parts at the usual rate.', 'रील्स किसी तरफ़ झुकना बंद कर देती हैं और इंटरैक्टिव हिस्से सामान्य दर से दिखाती हैं।'), l('Forget how you play?', 'आप कैसे खेलते हैं, यह भुला दें?')),
  }));

  // moves in progress and receipts
  const open = k.moves.open, rec = k.moves.receipts;
  out.push(part({
    id: 'moves', title: l('Moves being watched, and what changed', 'देखे जा रहे काम, और क्या बदला'), count: open.length + rec.length,
    summary: open.length + rec.length
      ? l(`When you tapped a reel’s tool, it remembered one figure from your trackers. ${num(open.length)} ${open.length === 1 ? 'is' : 'are'} being watched and ${num(rec.length)} ${rec.length === 1 ? 'change was' : 'changes were'} noticed. A tap alone never counts as a change.`, `जब आपने किसी रील का टूल खोला, उसने आपके ट्रैकर का एक आँकड़ा याद रखा। ${num(open.length)} देखे जा रहे हैं और ${num(rec.length)} बदलाव देखे गए। सिर्फ़ टैप करना बदलाव नहीं माना जाता।`)
      : l('No move is being watched and no change has been noticed.', 'कोई काम देखा नहीं जा रहा और कोई बदलाव दर्ज नहीं है।'),
    lines: [
      ...open.map(m => dash(titleOf(m.id), l(`watching ${METRIC_NAME[m.metric].en}`, `${METRIC_NAME[m.metric].hi} देखा जा रहा है`))),
      ...rec.map(r => dash(titleOf(r.id), l(`${METRIC_NAME[r.metric].en} changed from ${money(r.before).en} to ${money(r.after).en}`, `${METRIC_NAME[r.metric].hi} ${money(r.before).hi} से ${money(r.after).hi} हुआ`))),
    ],
    reset: resetOf(l('Forget my moves and changes', 'मेरे काम और बदलाव भुला दें'), l('The reels stop watching those figures and the “You did it” notes go. The SIP, fund and loan figures in your trackers stay exactly as they are.', 'रील्स उन आँकड़ों को देखना बंद कर देती हैं और “आपने कर दिखाया” वाले नोट हट जाते हैं। आपके ट्रैकर में SIP, फ़ंड और लोन के आँकड़े जैसे हैं वैसे ही रहते हैं।'), l('Forget your moves and changes?', 'अपने काम और बदलाव भुला दें?')),
  }));

  // what you watched
  const wIds = Object.keys(k.watched), right = wIds.filter(id => k.watched[id].correct).length;
  out.push(part({
    id: 'watched', title: l('Reels you finished', 'जो रीलें आपने पूरी कीं'), count: wIds.length + k.days.length,
    summary: wIds.length ? l(`You finished ${num(wIds.length)} ${wIds.length === 1 ? 'reel' : 'reels'} (${num(right)} answered right) on ${num(k.days.length)} ${k.days.length === 1 ? 'day' : 'days'}. This is what stops a reel coming back as new, and what the day streak counts.`, `आपने ${num(wIds.length)} रीलें पूरी कीं (${num(right)} में सही जवाब) ${num(k.days.length)} दिनों में। इसी से पता चलता है कि कौन-सी रील नई नहीं रही, और दिनों की लड़ी भी इसी से गिनी जाती है।`) : l('You have not finished any reel yet.', 'आपने अभी कोई रील पूरी नहीं की।'),
    lines: [],
    reset: resetOf(l('Forget what I watched', 'जो मैंने देखा वह भुला दें'), l('Every reel counts as new again, and your day streak starts from zero. If you sign in, this one syncs with your other tracker data, so it can come back from the cloud copy until you delete that in Privacy & your data.', 'हर रील फिर से नई गिनी जाती है और दिनों की लड़ी शून्य से शुरू होती है। अगर आप साइन इन करते हैं तो यह आपके बाक़ी ट्रैकर डेटा के साथ सिंक होता है, इसलिए क्लाउड कॉपी से लौट सकता है, जब तक आप उसे गोपनीयता और आपका डेटा में न मिटा दें।'), l('Forget what you watched?', 'जो आपने देखा वह भुला दें?')),
  }));

  // health counters
  const dayCount = Object.keys(k.stats.days).length, h = healthOf(k.stats, now);
  out.push(part({
    id: 'stats', title: l('Daily counts', 'रोज़ की गिनती'), count: dayCount,
    summary: dayCount ? l(`Simple counts for ${num(dayCount)} ${dayCount === 1 ? 'day' : 'days'}: reels finished, questions right, moves started, minutes. In the last 28 days: ${num(h.finished)} finished${h.medianMinutes !== null ? `, about ${num(Math.round(h.medianMinutes * 10) / 10)} minutes on the days you used them` : ''}. No reel names and no amounts.`, `${num(dayCount)} दिनों की सादी गिनती: पूरी रीलें, सही जवाब, शुरू किए काम, मिनट। पिछले 28 दिनों में ${num(h.finished)} पूरी${h.medianMinutes !== null ? `, जिन दिनों इस्तेमाल किया उन दिनों लगभग ${num(Math.round(h.medianMinutes * 10) / 10)} मिनट` : ''}। कोई रील का नाम या रकम नहीं।`) : l('No counts kept yet.', 'अभी कोई गिनती नहीं रखी गई।'),
    lines: [],
    reset: resetOf(l('Delete the counts', 'गिनती मिटाएँ'), l('The counts on the Reels health screen go. Your reels and your progress are not affected.', 'रील्स का हाल स्क्रीन की गिनती मिट जाती है। आपकी रीलें और आपकी प्रगति पर असर नहीं पड़ता।'), l('Delete the counts?', 'गिनती मिटाएँ?')),
  }));

  // challenges
  const runs = k.challenges.runs;
  out.push(part({
    id: 'challenges', title: l('Seven-day challenges', 'सात दिन की चुनौतियाँ'), count: runs.length,
    summary: runs.length ? l(`You started ${num(runs.length)} ${runs.length === 1 ? 'challenge' : 'challenges'}. The days you ticked are the only thing kept.`, `आपने ${num(runs.length)} चुनौतियाँ शुरू कीं। सिर्फ़ वे दिन रखे जाते हैं जो आपने टिक किए।`) : l('You have not started a challenge.', 'आपने कोई चुनौती शुरू नहीं की।'),
    lines: runs.map(r => { const c = challengeById(r.id); const total = c?.days.length ?? 7; const t = c?.title ?? CHALLENGES[0].title; return dash(t, isFinished(r) ? l('finished', 'पूरी हुई') : l(`${num(r.done.length)} of ${num(total)} done`, `${total} में से ${num(r.done.length)} पूरे`)); }),
    reset: resetOf(l('Forget my challenges', 'मेरी चुनौतियाँ भुला दें'), l('Your progress in them goes and they can be started again. What you did for a task, like a subscription you cancelled, is yours and stays.', 'उनमें आपकी प्रगति मिट जाती है और उन्हें फिर शुरू किया जा सकता है। किसी काम के लिए आपने जो किया, जैसे रद्द की गई सब्सक्रिप्शन, वह आपका है और रहता है।'), l('Forget your challenges?', 'अपनी चुनौतियाँ भुला दें?')),
  }));

  // reminders
  const pending = k.moveReminders.filter(m => { const d = fromLocalIso(m.at); return !!d && d.getTime() > now.getTime(); });
  const fu = followupsOn(k.notify, k.nudge, k.moveReminders), weekly = k.notify.weekly;
  const rn = pending.length + (k.nudge.enabled ? 1 : 0) + (fu ? 1 : 0) + (weekly ? 1 : 0);
  const on = (en: string, hi: string): L => l(en, hi);
  const kinds: L[] = [
    ...(k.nudge.enabled ? [on(`a daily reminder at ${num(k.nudge.hour)}:00`, `रोज़ ${num(k.nudge.hour)}:00 बजे का रिमाइंडर`)] : []),
    ...(fu ? [on('follow-ups on things you said you would do', 'जो करने को कहा उन पर फ़ॉलो-अप')] : []),
    ...(weekly ? [on('a Sunday look-back', 'रविवार की समीक्षा')] : []),
    ...(pending.length ? [cnt(pending.length, 'reminder for a move', 'reminders for moves', 'काम के रिमाइंडर')] : []),
  ];
  out.push(part({
    id: 'reminders', title: l('Reminders', 'रिमाइंडर'), count: rn, empty: rn === 0 && k.moveReminders.length === 0 && !k.notify.armed && k.notify.followups === null,
    summary: rn ? l(`Switched on: ${kinds.map(x => x.en).join('; ')}. They are notices on this phone only; the lock screen names a lesson’s public title, never a figure of yours.`, `चालू: ${kinds.map(x => x.hi).join('; ')}। ये सिर्फ़ इसी फ़ोन के नोटिस हैं; लॉक स्क्रीन पर पाठ का सार्वजनिक शीर्षक आता है, आपका कोई आँकड़ा कभी नहीं।`) : l('No reminder is set.', 'कोई रिमाइंडर नहीं लगा है।'),
    lines: pending.map(m => dash(m.label, l(m.at.replace('T', ' at '), m.at.replace('T', ' को ')))),
    reset: resetOf(l('Cancel my reminders', 'मेरे रिमाइंडर रद्द करें'), l('Every reel reminder already scheduled on this phone is cancelled and the daily reminder, follow-ups and Sunday look-back turn off. Your phone’s notification permission is not changed.', 'इस फ़ोन पर लगे रील के सारे रिमाइंडर रद्द हो जाते हैं और रोज़ का रिमाइंडर, फ़ॉलो-अप और रविवार की समीक्षा बंद हो जाते हैं। फ़ोन की नोटिफ़िकेशन अनुमति नहीं बदलती।'), l('Cancel your reminders?', 'अपने रिमाइंडर रद्द करें?')),
  }));

  // voice
  const sp = SPEEDS.reduce((a, b) => (Math.abs(b.value - k.voice.speed) < Math.abs(a.value - k.voice.speed) ? b : a));
  const voiceSet = k.voice.speed !== 1 || k.voice.style !== 'expressive' || k.voice.pauses !== 'normal' || !!k.voice.voice.en || !!k.voice.voice.hi;
  out.push(part({
    id: 'voice', title: l('Reel voice choices', 'रील की आवाज़ की पसंद'), count: voiceSet ? 1 : 0,
    summary: voiceSet ? l(`Speed ${sp.label.toLowerCase()}, ${k.voice.style} style, ${k.voice.pauses} pauses${k.voice.voice.en || k.voice.voice.hi ? ', and a voice you picked' : ''}.`, `गति ${sp.hi}, ${k.voice.style === 'steady' ? 'स्थिर' : 'भावपूर्ण'} अंदाज़, ${k.voice.pauses === 'short' ? 'छोटे' : k.voice.pauses === 'long' ? 'लंबे' : 'सामान्य'} ठहराव${k.voice.voice.en || k.voice.voice.hi ? ', और आपकी चुनी हुई आवाज़' : ''}।`) : l('You have not changed the voice settings.', 'आपने आवाज़ की सेटिंग नहीं बदली।'),
    lines: [],
    reset: resetOf(l('Back to the usual voice', 'सामान्य आवाज़ पर लौटें'), l('Speed, style, pauses and the voice you picked go back to the usual.', 'गति, अंदाज़, ठहराव और चुनी हुई आवाज़ सामान्य पर लौट जाती हैं।'), l('Reset the voice choices?', 'आवाज़ की पसंद रीसेट करें?')),
  }));

  // housekeeping
  const tips = pr.tips ?? 0;
  out.push(part({
    id: 'housekeeping', title: l('Small housekeeping', 'छोटी-मोटी बातें'), count: tips + (pr.blindWeek ? 1 : 0),
    summary: tips || pr.blindWeek ? l(`The gesture tips have shown ${num(Math.min(tips, TIPS_MAX))} of ${num(TIPS_MAX)} times${pr.blindWeek ? `, and the weekly look at your weakest area was last offered in week ${pr.blindWeek}` : ''}.`, `इशारों की सलाह ${num(TIPS_MAX)} में से ${num(Math.min(tips, TIPS_MAX))} बार दिखी${pr.blindWeek ? `, और सबसे कमज़ोर हिस्से पर साप्ताहिक नज़र आख़िरी बार सप्ताह ${pr.blindWeek} में दी गई` : ''}।`) : l('Nothing kept.', 'कुछ नहीं रखा गया।'),
    lines: [],
    reset: resetOf(l('Forget the housekeeping', 'ये बातें भुला दें'), l('The gesture tips can show again, and this week’s weekly look can be offered again.', 'इशारों की सलाह फिर दिख सकती है और इस हफ़्ते की साप्ताहिक नज़र फिर दी जा सकती है।'), l('Forget the housekeeping?', 'ये बातें भुला दें?')),
  }));

  return out;
}

// ── figures read from the trackers ───────────────────────────────────────────────────────────────────────────

export interface FiguresUsed {
  title: L;
  /** What was read just now, as plain lines (empty when none of these are in the trackers). */
  lines: L[];
  /** Where it comes from, and that it is never sent, copied or kept. */
  note: L;
  /** The tracker keys read, for the curious. */
  keys: readonly string[];
}

export function figuresUsed(mine: Mine): FiguresUsed {
  const lines: L[] = [];
  if (mine.sip) lines.push(l(`Your SIP: ${money(mine.sip).en} a month`, `आपकी SIP: ${money(mine.sip).hi} महीना`));
  if (mine.spend) lines.push(l(`Your spending: ${money(mine.spend).en} a month`, `आपका ख़र्च: ${money(mine.spend).hi} महीना`));
  if (mine.fund) lines.push(l(`Your emergency fund: ${money(mine.fund).en}`, `आपका इमरजेंसी फ़ंड: ${money(mine.fund).hi}`));
  if (mine.loan) lines.push(l(`Your ${mine.loan.label.en}: ${money(mine.loan.balance).en} left, EMI ${money(mine.loan.emi).en}`, `आपका ${mine.loan.label.hi}: ${money(mine.loan.balance).hi} बाक़ी, EMI ${money(mine.loan.emi).hi}`));
  return {
    title: l('Figures from your own trackers', 'आपके अपने ट्रैकर के आँकड़े'),
    lines,
    note: l('Your SIP, spending, emergency fund and loan are read from your trackers when a reel needs a number for its example. They are never sent anywhere and never copied into the reels’ own memory, so there is nothing to reset here: change them in the tracker. To choose reels, the reels also read your Money Score, life events you declared, age and income, the same way.', 'आपकी SIP, ख़र्च, इमरजेंसी फ़ंड और लोन तब ट्रैकर से पढ़े जाते हैं जब किसी रील को उदाहरण के लिए संख्या चाहिए। वे कहीं भेजे नहीं जाते और रील्स की अपनी याद में कॉपी नहीं होते, इसलिए यहाँ रीसेट करने को कुछ नहीं: उन्हें ट्रैकर में बदलें। रील चुनने के लिए रील्स आपका Money Score, आपकी बताई जीवन-घटनाएँ, उम्र और आय भी इसी तरह पढ़ती हैं।'),
    keys: MINE_KEYS,
  };
}

/** What never leaves the phone, and which keys are the exception. Shown on the screen under the sections. */
export const KEPT_NOTE: L = l(
  'Everything on this screen is kept on this phone only. Nothing is sent anywhere automatically. All of it is stored under names that start with finos_session_, which are never uploaded or synced. The one exception is the list of reels you finished and your finishing days: if you sign in, those sync with your other tracker data like your lesson ticks do. Resetting only makes the reels forget; it never changes your trackers.',
  'इस स्क्रीन की हर चीज़ सिर्फ़ इसी फ़ोन पर रहती है। कुछ भी अपने आप कहीं नहीं भेजा जाता। सब कुछ finos_session_ से शुरू होने वाले नामों के तहत रखा जाता है, जो कभी अपलोड या सिंक नहीं होते। एक अपवाद है: पूरी की गई रीलों की सूची और पूरा करने के दिन। अगर आप साइन इन करते हैं तो ये आपके बाक़ी ट्रैकर डेटा के साथ सिंक होते हैं, जैसे आपके पाठ के टिक होते हैं। रीसेट से सिर्फ़ रील्स भूलती हैं; आपके ट्रैकर कभी नहीं बदलते।');

/** Words the screen needs, in both languages, kept here so a test can hold every one to have a Hindi version. */
export const TEXT = {
  title: l('What the reels know about you', 'रील्स आपके बारे में क्या जानती हैं'),
  subtitle: l('Everything the money reels have learned on this phone, in plain words, and a way to forget each part. For education, not advice.', 'इस फ़ोन पर मनी रील्स ने जो कुछ सीखा है, सादे शब्दों में, और हर हिस्से को भुलाने का तरीक़ा। शिक्षा के लिए, सलाह नहीं।'),
  nothing: l('Nothing is kept yet.', 'अभी कुछ नहीं रखा गया।'),
  whyTitle: l('Why today’s first reel', 'आज की पहली रील क्यों'),
  whyNone: l('No reel is picked yet.', 'अभी कोई रील नहीं चुनी गई।'),
  resetAllLabel: l('Reset everything about reels', 'रील्स की सारी याद रीसेट करें'),
  resetAllDoes: l('Every part above is forgotten, the reels’ reminders are cancelled, and the reels start as if new. Your trackers, goals, scores and the rest of the app stay exactly as they are.', 'ऊपर का हर हिस्सा भुला दिया जाता है, रील्स के रिमाइंडर रद्द होते हैं और रील्स नई जैसी शुरू होती हैं। आपके ट्रैकर, लक्ष्य, स्कोर और ऐप की बाक़ी चीज़ें जैसी हैं वैसी रहती हैं।'),
  resetAllConfirm: l('Reset everything about reels?', 'रील्स की सारी याद रीसेट करें?'),
  cancel: l('Cancel', 'रद्द'),
  done: l('Done. The reels forgot that.', 'हो गया। रील्स ने वह भुला दिया।'),
  doneAll: l('Done. The reels forgot everything above.', 'हो गया। रील्स ने ऊपर की सब चीज़ें भुला दीं।'),
  more: (n: number): L => l(`and ${num(n)} more`, `और ${num(n)}`),
  whatResetDoes: l('What resetting does', 'रीसेट करने से क्या होता है'),
  syncs: l('Syncs with your other tracker data if you sign in.', 'साइन इन करने पर आपके बाक़ी ट्रैकर डेटा के साथ सिंक होता है।'),
  neverSynced: l('Never uploaded or synced.', 'कभी अपलोड या सिंक नहीं होता।'),
  keptTitle: l('Where it stays', 'यह कहाँ रहता है'),
  openPrivacy: l('Privacy & your data', 'गोपनीयता और आपका डेटा'),
  back: l('Back to the reels', 'रील्स पर वापस'),
  forgetOnly: FORGET_ONLY,
} as const;

// ── why this reel ────────────────────────────────────────────────────────────────────────────────────────────

export const WHY_VALUES: Ranked['why'][] = ['review', 'timely', 'gentle', 'blind', 'pillar', 'new', 'refresh', 'pledge', 'done'];

const SAVED_REASON_EN = 'You saved this one for later.';

/** One plain sentence on why the ranker put this reel where it did, from the reason it gave (see `Ranked`). Never mentions a figure of the person's. */
export function whyThisReel(reel: Reel, ranked: Ranked[]): L {
  const r = ranked.find(x => x.reel.id === reel.id);
  if (!r) return l('Nothing in particular picked this one: it is simply in the library.', 'इसे किसी ख़ास वजह से नहीं चुना गया: यह बस लाइब्रेरी में है।');
  const reason = r.reason;
  switch (r.why) {
    case 'review': return l('Because you missed this question last time, so it is back for another try.', 'क्योंकि पिछली बार यह सवाल छूट गया था, इसलिए यह एक और कोशिश के लिए लौटा है।');
    case 'refresh': return l('Because it has been about a week since you got it right: a quick refresher.', 'क्योंकि इसे सही किए लगभग एक हफ़्ता हो गया: एक छोटा दोहराव।');
    case 'timely': {
      if (reason && reason.en === SEASON_NOTES.diwali.en) return l('Because it is Diwali week, when spending and scam messages both tend to rise.', 'क्योंकि यह दिवाली का हफ़्ता है, जब ख़र्च और ठगी के संदेश दोनों बढ़ते हैं।');
      if (reason && reason.en === SEASON_NOTES.budget.en) return l('Because it is Budget week, when tax rules are in the news.', 'क्योंकि यह बजट का हफ़्ता है, जब टैक्स के नियम चर्चा में होते हैं।');
      if (reason && reason.en === SEASON_NOTES.yearend.en) return l('Because the financial year ends this month and tax-saving dates are close.', 'क्योंकि इस महीने वित्त वर्ष ख़त्म होता है और टैक्स बचाने की तारीख़ें पास हैं।');
      return reason ? l(`Because of the time of year or your situation: ${reason.en}`, `क्योंकि समय या आपकी स्थिति के हिसाब से यह ठीक बैठती है: ${reason.hi}`) : l('Because it fits the time of year or your situation right now.', 'क्योंकि यह अभी साल के इस समय या आपकी स्थिति पर ठीक बैठती है।');
    }
    case 'gentle': return l('Because this month looks tight, so this is a gentler pick about easing the pressure.', 'क्योंकि यह महीना तंग दिखता है, इसलिए यह दबाव घटाने वाली एक नरम पसंद है।');
    case 'blind': return l('Because once a week the reels offer one on your weakest Money Score pillar, even if you asked for less of its topic.', 'क्योंकि हफ़्ते में एक बार रील्स आपके सबसे कमज़ोर Money Score हिस्से पर एक रील देती हैं, चाहे आपने उसके विषय की कम माँग की हो।');
    case 'pillar': return reason ? l(`Because ${reason.en.replace(/^Your /, 'your ')}`, `क्योंकि ${reason.hi}`) : l('Because it speaks to your weakest Money Score pillar.', 'क्योंकि यह आपके सबसे कमज़ोर Money Score हिस्से की बात करती है।');
    case 'pledge': return l('Because you said you would do this, and it is still on your list. No rush.', 'क्योंकि आपने कहा था कि आप यह करेंगे, और यह अब भी आपकी सूची में है। कोई जल्दी नहीं।');
    case 'new':
      if (reason && reason.en === SAVED_REASON_EN) return l('Because you saved it for later.', 'क्योंकि आपने इसे बाद के लिए सेव किया था।');
      return reason ? l(`Chosen for you: ${reason.en}`, `आपके लिए चुनी गई: ${reason.hi}`) : l('Because it is new to you and nothing in particular stands out, so it follows the usual order.', 'क्योंकि यह आपके लिए नई है और कुछ ख़ास अलग नहीं दिखता, इसलिए यह सामान्य क्रम में है।');
    case 'done': return l('Because you asked to see it again; you have already finished it or said you know it.', 'क्योंकि आपने इसे फिर देखना चाहा; आप इसे पूरा कर चुके हैं या कह चुके हैं कि आपको यह पता है।');
    default: { const never: never = r.why; return never; }
  }
}
