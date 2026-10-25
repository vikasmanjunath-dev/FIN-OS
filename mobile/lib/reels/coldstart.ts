// The cold start: what a brand-new person meets in their first minute with the reels. Three one-tap questions (all skippable, none blocking),
// then a first episode of exactly two reels (a playable myth on what they came for, then a concept) and the calm stop. Never a quiz first.
// Everything here is pure: the welcome screen (components/reels/Welcome.tsx) only draws these choices, and the feed calls `firstEpisode` on the
// ranker's own output instead of changing the ranker. Answers live in the reels profile (`profile.start`), on the phone only.
import { dayKey, type Ranked, type Watched } from '@/lib/reels/journey';
import { isBeatUsable } from '@/lib/reels/beats';
import { EPISODE_SIZE, composeEpisode, finishedToday, type Episode } from '@/lib/reels/episode';
import { metaOf, type Level } from '@/lib/reels/meta';
import type { ReelsProfile, StartAnswers, StartLevel } from '@/lib/reels/reelsProfile';
import type { L, Reel, Topic } from '@/lib/reels/types';

const DAY = 86_400_000;
const l = (en: string, hi: string): L => ({ en, hi });

/** How many reels the very first episode holds. */
export const FIRST_EPISODE_SIZE = 2;
/** The nudge from the answers lasts this many days from the day they were given, shrinking evenly to nothing. */
export const BIAS_DAYS = 7;

// ── The questions ─────────────────────────────────────────────────────────────────────────────────────────────

export type GoalId = 'save' | 'loan' | 'scams' | 'tax' | 'curious';
export interface GoalOption { id: GoalId; label: L; topics: Topic[] }
/** What are you here for? One tap. "Just curious" names no topic, so the ranker's own order decides. */
export const GOAL_OPTIONS: GoalOption[] = [
  { id: 'save', label: l('Start saving or investing', 'बचत या निवेश शुरू करना'), topics: ['invest', 'basics', 'goals'] },
  { id: 'loan', label: l('Handle a loan or EMI', 'लोन या EMI संभालना'), topics: ['loans', 'credit'] },
  { id: 'scams', label: l('Stay safe from scams', 'धोखाधड़ी से बचना'), topics: ['safety'] },
  { id: 'tax', label: l('Understand tax', 'टैक्स समझना'), topics: ['tax'] },
  { id: 'curious', label: l('Just curious', 'बस कुछ नया जानना है'), topics: [] },
];
export interface LevelOption { id: StartLevel; label: L; hint: L }
export const LEVEL_OPTIONS: LevelOption[] = [
  { id: 'new', label: l('New to this', 'मेरे लिए सब नया है'), hint: l('Plain words first', 'पहले आसान शब्दों में') },
  { id: 'some', label: l('I know some', 'कुछ-कुछ पता है'), hint: l('A mix', 'थोड़ा सब कुछ') },
  { id: 'comfortable', label: l('Comfortable', 'अच्छी समझ है'), hint: l('Get to the choices sooner', 'फ़ैसलों पर जल्दी आएँ') },
];
export const LANG_OPTIONS: { id: 'en' | 'hi'; label: string }[] = [{ id: 'en', label: 'English' }, { id: 'hi', label: 'हिन्दी' }];

export type StepId = 'lang' | 'goal' | 'level';
/** The questions in order. Language comes first, and only when the app has no language set, because every question after it is read in it. */
export const welcomeSteps = (askLang: boolean): StepId[] => (askLang ? ['lang', 'goal', 'level'] : ['goal', 'level']);

export const COPY = {
  title: l('Let’s make this yours', 'इसे आपके लिए बनाते हैं'),
  hello: l('Hi, I’m Mitra. Three quick taps and I’ll pick your first reels.', 'नमस्ते, मैं मित्रा हूँ। तीन छोटे टैप, और मैं आपकी पहली रीलें चुन दूँगी।'),
  privacy: l('Your answers stay on this phone. You can change them any time.', 'आपके जवाब इसी फ़ोन पर रहते हैं। आप इन्हें कभी भी बदल सकते हैं।'),
  qLang: l('Which language do you prefer?', 'आप कौन सी भाषा पसंद करते हैं?'),
  qGoal: l('What are you here for?', 'आप यहाँ किसलिए आए हैं?'),
  qLevel: l('How comfortable are you with money terms?', 'पैसों के शब्दों से आप कितने सहज हैं?'),
  skip: l('Skip', 'अभी छोड़ें'),
  skipHint: l('Skip the questions and see your first reels. You can answer later.', 'सवाल छोड़कर पहली रीलें देखें। बाद में जवाब दे सकते हैं।'),
  back: l('Back', 'पीछे'),
  change: l('Change my answers', 'मेरे जवाब बदलें'),
  changeSkipped: l('Tell Mitra what you want to learn', 'मित्रा को बताएँ कि आप क्या सीखना चाहते हैं'),
  disclaimer: l('For education, not advice.', 'शिक्षा के लिए, सलाह नहीं।'),
} as const;
export const stepText = (step: StepId): L => (step === 'lang' ? COPY.qLang : step === 'goal' ? COPY.qGoal : COPY.qLevel);
export const stepCount = (i: number, n: number): L => l(`${i} of ${n}`, `${n} में से ${i}`);

// ── Answers ───────────────────────────────────────────────────────────────────────────────────────────────────

export const goalOf = (id: GoalId): GoalOption => GOAL_OPTIONS.find(g => g.id === id) ?? GOAL_OPTIONS[GOAL_OPTIONS.length - 1];
/** The answers from the two taps. */
export const buildStart = (goal: GoalId, level: StartLevel, now: Date): StartAnswers => ({ goals: [...goalOf(goal).topics], level, at: now.toISOString() });
/** The person chose Skip: remembered so the welcome never asks again, and it nudges nothing. */
export const skippedStart = (now: Date): StartAnswers => ({ goals: [], level: 'some', at: now.toISOString(), skipped: true });
/** Which goal option an earlier answer was, so "Change my answers" can show it chosen. */
export function goalIdOf(start: StartAnswers | undefined): GoalId | null {
  if (!start || start.skipped) return null;
  const key = [...start.goals].sort().join(',');
  return GOAL_OPTIONS.find(g => [...g.topics].sort().join(',') === key)?.id ?? null;
}
/** The stored language value means a choice was made (the app writes "en" or "hi"); anything else means the app has not asked yet. */
export const langWasChosen = (raw: string | null | undefined): boolean => { const v = String(raw ?? '').replace(/^"|"$/g, ''); return v === 'en' || v === 'hi'; };

/** The welcome opens when nothing has been answered or skipped and no reel has been finished: a new person, once. */
export const needsWelcome = (profile: ReelsProfile, watched: Watched): boolean => !profile.start && Object.keys(watched).length === 0;
/** The text of the small row at the calm stop (and anywhere else) that reopens the welcome. */
export const changeLabel = (start: StartAnswers | undefined): L => (start?.skipped || !start ? COPY.changeSkipped : COPY.change);

// ── The nudge for the first week ──────────────────────────────────────────────────────────────────────────────

/** Places a matching topic moves up the ranked list at full strength; a ladder rung moves by the numbers below. The ranker gives most fresh reels
 *  nearly the same score, so the order is what is left to move: on day one a chosen topic leads the fresh reels, and the lead shrinks by the day. */
export const TOPIC_PLACES = 120;
export const LEVEL_PLACES: Record<StartLevel, Partial<Record<Level, number>>> = {
  new: { myth: 12, concept: 8, decision: -8, action: -12 },
  some: {},
  comfortable: { myth: -10, concept: -4, decision: 8, action: 10 },
};

export interface Bias {
  /** 1 on the day of the answers, falling evenly to 0 at BIAS_DAYS. */
  factor: number;
  /** Places to move up (negative: down) by topic and by ladder rung, already scaled by `factor`. Empty when the nudge is over or nothing was answered. */
  topics: Partial<Record<Topic, number>>;
  levels: Partial<Record<Level, number>>;
}
const NONE: Bias = { factor: 0, topics: {}, levels: {} };

/**
 * What the welcome's answers add to the ranking, for the first seven days only. It shrinks evenly each day and is exactly nothing from day seven
 * on (and for a skipped or missing answer, or an unreadable date), so after a week the ranker's own order is all that is left. It only reorders:
 * it cannot bring back a reel the ranker removed.
 */
export function firstEpisodeBias(start: StartAnswers | undefined | null, now: Date): Bias {
  if (!start || start.skipped) return NONE;
  const at = new Date(start.at).getTime();
  if (!Number.isFinite(at)) return NONE;
  const age = (now.getTime() - at) / DAY;
  const factor = age >= BIAS_DAYS ? 0 : Math.min(1, Math.max(0, 1 - age / BIAS_DAYS));
  if (factor <= 0) return NONE;
  const topics: Bias['topics'] = {}, levels: Bias['levels'] = {};
  for (const t of start.goals) topics[t] = TOPIC_PLACES * factor;
  for (const [k, v] of Object.entries(LEVEL_PLACES[start.level] ?? {})) levels[k as Level] = (v as number) * factor;
  return { factor, topics, levels };
}

const growthReel = (r: Ranked) => !!metaOf(r.reel.id).growth;

/**
 * The ranker's list with the nudge applied. Only fresh reels are moved, and only among the places fresh reels already held: a missed question, a refresher, a pledge, a
 * timely or gentle pick keep their exact place. A reel moves by its topic and rung places, and ties keep the ranker's order. A person under strain never gets a growth reel,
 * whatever they chose: those are dropped here as well, in case a list that did not go through the ranker's own guard is passed in.
 */
export function applyBias(ranked: Ranked[], bias: Bias, strain: boolean): Ranked[] {
  const list = strain ? ranked.filter(r => !growthReel(r)) : ranked;
  if (bias.factor <= 0) return list;
  const movable = (r: Ranked) => r.why === 'new' || r.why === 'pillar';
  const places = (r: Ranked) => (bias.topics[r.reel.topic] ?? 0) + (bias.levels[metaOf(r.reel.id).level] ?? 0);
  // Fresh reels trade places among the slots fresh reels already held, so every other reel stays exactly where the ranker put it.
  const slots = list.map((r, i) => (movable(r) ? i : -1)).filter(i => i >= 0);
  const order = slots.map((at, n) => ({ r: list[at], k: at - places(list[at]), n })).sort((a, b) => a.k - b.k || a.n - b.n);
  const out = list.slice();
  slots.forEach((at, n) => { out[at] = order[n].r; });
  return out;
}

// ── The first episode ─────────────────────────────────────────────────────────────────────────────────────────

/** True while everything finished so far was finished today, i.e. the person is still on their first day with the reels. */
export function isFirstDay(watched: Watched, now: Date): boolean {
  const today = dayKey(now);
  return Object.values(watched).every(w => { const d = new Date(w.at); return Number.isFinite(d.getTime()) && dayKey(d) === today; });
}

const playable = (r: Reel) => !!r.poke && isBeatUsable(r);

/**
 * The first-ever episode: two reels, never more. First a playable myth reel on what the person chose (a short thing to touch, no quiz-first
 * start, no jargon), then a concept reel (on the same topic when there is one). Then the calm stop, with a "tomorrow" teaser.
 *
 *   myth pick:  playable myth on a chosen topic → playable reel on a chosen topic (concept first) → any playable myth → any playable reel → top reel
 *   concept:    concept on the myth's topic → on a chosen topic → any concept → any rung but action → next reel
 *
 * `ranked` is the ranker's output; nothing is added to it, so a reel it removed (growth reels for a person under strain) cannot come back, and
 * growth reels are skipped here too. With nothing chosen ("Just curious", Skip) the ranker's order alone decides. `finished` is how many reels
 * were already finished today on this first day: the episode then holds only what is left of the two.
 */
export function firstEpisode(ranked: Ranked[], start: StartAnswers | undefined | null, o: { now: Date; strain?: boolean; finished?: number }): Episode {
  const pool = applyBias(ranked, firstEpisodeBias(start, o.now), !!o.strain).filter(r => r.why !== 'done' && r.why !== 'review' && r.why !== 'refresh' && r.why !== 'pledge');
  const goals = new Set(start?.skipped ? [] : start?.goals ?? []);
  const onGoal = (r: Ranked) => goals.size === 0 || goals.has(r.reel.topic);
  const lvl = (r: Ranked) => metaOf(r.reel.id).level;
  const first = (f: (r: Ranked) => boolean): Ranked | undefined => pool.find(f);

  const myth = goals.size > 0
    ? first(r => onGoal(r) && lvl(r) === 'myth' && playable(r.reel))
      ?? first(r => onGoal(r) && lvl(r) === 'concept' && playable(r.reel)) ?? first(r => onGoal(r) && lvl(r) !== 'action' && playable(r.reel))
      ?? first(r => lvl(r) === 'myth' && playable(r.reel)) ?? first(r => playable(r.reel)) ?? pool[0]
    : first(r => lvl(r) === 'myth' && playable(r.reel)) ?? first(r => playable(r.reel)) ?? pool[0];
  const rest = pool.filter(r => r !== myth);
  const concept = rest.find(r => lvl(r) === 'concept' && myth && r.reel.topic === myth.reel.topic)
    ?? rest.find(r => lvl(r) === 'concept' && onGoal(r)) ?? rest.find(r => lvl(r) === 'concept')
    ?? rest.find(r => lvl(r) !== 'action') ?? rest[0];

  const slots = Math.max(0, FIRST_EPISODE_SIZE - Math.max(0, Math.floor(o.finished ?? 0)));
  const both = [myth, concept].filter((x): x is Ranked => !!x);
  const picks = both.slice(both.length - Math.min(slots, both.length));
  const chosen = new Set(both.map(p => p.reel.id));
  const left = pool.find(r => !chosen.has(r.reel.id) && onGoal(r) && (lvl(r) === 'concept' || lvl(r) === 'decision')) ?? pool.find(r => !chosen.has(r.reel.id));
  return { picks, tomorrow: left ? left.reel : null, blind: false, resurfaced: null };
}

/**
 * Today's episode, the one way: the first-ever day gets the welcome's two-reel episode, any other day the ranked one (less what is already finished today).
 * The feed, the Home card, "why today's first reel" and anything else that names today's first reel call this, so they cannot name different reels.
 * `blind` is the weekly blind-spot reel, which only the feed passes (it records the week when one is used).
 */
export function todaysEpisode(ranked: Ranked[], watched: Watched, now: Date, o: { start?: StartAnswers | null; strain?: boolean; blind?: Ranked | null } = {}): Episode {
  const fin = finishedToday(watched, now);
  return isFirstDay(watched, now) ? firstEpisode(ranked, o.start, { now, strain: o.strain, finished: fin }) : composeEpisode(ranked, Math.max(0, EPISODE_SIZE - fin), o.blind ?? null);
}
