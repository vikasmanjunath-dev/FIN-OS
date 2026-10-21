// Ranker v2: which reel is best for this person today, and why. It replaces the two signals of rankReels (weakest pillar, quiz history) with
// the blueprint's formula over everything on the phone, still as a pure function so each rule is tested with made-up people.
//
//   fresh reel score = 40 + 60 × (0.5·Need + 0.35·Timeliness + 0.15·Readiness) × Fit × (1 − Fatigue)
//
// A question missed yesterday still comes first (110), a refresher of a right answer after a week is low (20), a finished reel lower (10),
// and a reel the person said they know lowest (5). A person under money strain never sees a reel whose message is "put in more".
//
// Ranker v3 adds what the person has done in the reels, all on the phone: a saved reel not yet watched gets a small boost; a reel they pledged
// to act on, whose tool they have not started, comes back once as "Still on your list" (followup.ts); a milestone reached in their own figures
// lowers the "how to start" reels it answers and lifts the next step; and in Diwali week, Budget week and March the reels people look for then
// get a small lift (triggers.ts). None of it can hide or show a reel the distress guard removed.
import { duePledges, resurfaceReason } from '@/lib/reels/followup';
import { PILLAR_NAME, type Ranked, type Watched } from '@/lib/reels/journey';
import { levelIndex, metaOf } from '@/lib/reels/meta';
import { pokeFit, weekKey, type ReelsProfile } from '@/lib/reels/reelsProfile';
import type { Signals } from '@/lib/reels/signals';
import { activeTriggers, seasonLiftFor, TRIGGER_NOTES } from '@/lib/reels/triggers';
import type { L, Reel } from '@/lib/reels/types';

const DAY = 86_400_000;
const l = (en: string, hi: string): L => ({ en, hi });

export const W_NEED = 0.5, W_TIME = 0.35, W_READY = 0.15;
/** Without a saved Money Score every pillar counts as a modest need, so no reel is favoured for a reason the app does not know. */
const UNKNOWN_GAP = 0.3;

/** Saved and not yet watched: worth about five points, never more. */
export const W_SAVED = 0.08;
/** What a milestone does: it lowers the reels that teach how to start (half of their lift above the base), and lifts the next step (about six points). */
export const MS_LOWER = 0.5, MS_LIFT = 0.1;
/** A fresh reel never scores as high as a missed question (110), whatever is added. */
export const FRESH_MAX = 109;
/** Where a "Still on your list" reel sits: above a fresh reel with little behind it, below a missed question. */
export const PLEDGE_SCORE = 50;

/** What each milestone (milestones.ts) changes: the reels that teach how to start what the person has now done, and the reels that come next. */
export const MILESTONE_SHIFT: Record<string, { lower: string[]; lift: string[]; note: L; /** a trigger that switches the shift off while it is active, so the milestone is not used against a person whose figures have since slipped */ unless?: string }> = {
  'first-sip': {
    lower: ['first-sip-habit', 'start-early', 'delay-cost', 'slide-start-late', 'guess-small-sip'],
    lift: ['goal-step-up', 'guess-step-up', 'slide-step-up-rate', 'sip-vs-lumpsum'],
    note: l('You have a SIP running, so here is a next idea.', 'आपकी SIP चल रही है, इसलिए अगला विचार।'),
  },
  'fund-3': {
    lower: ['emergency-fund', 'emergency-target', 'order-emergency-steps'],
    lift: ['where-keep-fund', 'fd-ladder', 'sort-emergency-or-not'],
    note: l('Your emergency fund covers about three months, so here is what comes next.', 'आपका इमरजेंसी फ़ंड लगभग तीन महीने का है, इसलिए अगला विषय।'),
    unless: 'state:fund-low',
  },
};

export interface RankV2Input {
  watched: Watched; signals: Signals; profile: ReelsProfile; now: Date;
  /** Reels whose tool the person has started (see `startedReelIds` in followup.ts). A pledge on one of these is not brought back. Optional. */
  started?: Iterable<string>;
}

const SAVED_NOTE = l('You saved this one for later.', 'आपने इसे बाद के लिए सेव किया था।');

const GENTLE = l('A gentler pick for a tight month: it is about easing the pressure.', 'तंग महीने के लिए एक नरम चुनाव: यह दबाव घटाने के बारे में है।');

/** How much the person's own Money Score says they need this reel, 0 to 1, and the pillar that drives it. */
function needOf(reel: Reel, s: Signals): { need: number; pillar: keyof Signals['pillars'] | null } {
  const needs = Object.entries(metaOf(reel.id).needs) as [keyof Signals['pillars'], number][];
  if (!needs.length) return { need: 0.2, pillar: null };
  const known = Object.keys(s.pillars).length > 0;
  let best = 0, pillar: keyof Signals['pillars'] | null = null;
  for (const [p, w] of needs) {
    const gap = known ? (s.pillars[p] === undefined ? UNKNOWN_GAP : (100 - (s.pillars[p] as number)) / 100) : (p === s.weakest ? 1 : UNKNOWN_GAP);
    if (w * gap > best) { best = w * gap; pillar = p; }
  }
  return { need: best, pillar };
}

export function rankReelsV2(reels: Reel[], { watched, signals, profile, now, started }: RankV2Input): Ranked[] {
  const trig = activeTriggers(signals);
  const saved = new Set(profile.saved ?? []);
  const ms = new Set(profile.ms ?? []);
  const lowered = new Map<string, true>(), lifted = new Map<string, L>();
  for (const [id, shift] of Object.entries(MILESTONE_SHIFT)) if (ms.has(id) && !(shift.unless && trig.has(shift.unless))) { for (const r of shift.lower) lowered.set(r, true); for (const r of shift.lift) if (!lifted.has(r)) lifted.set(r, shift.note); }
  // At most one pledge is brought back, the oldest that is due; never for a person under strain.
  // Only a pledged reel the person has already watched qualifies (an unwatched one is offered as an ordinary fresh reel), and a missed question keeps its place.
  const inLibrary = new Set(reels.map(r => r.id));
  const missed = (id: string) => { const w = watched[id]; return !!w && !w.correct && (now.getTime() - new Date(w.at).getTime()) / DAY >= 1; };
  const due = duePledges(profile, { now, started, strain: signals.strain, eligible: id => inLibrary.has(id) && !!watched[id] && !missed(id) })[0];
  const byTopic = new Map<string, Reel[]>();
  for (const r of reels) byTopic.set(r.topic, [...(byTopic.get(r.topic) ?? []), r]);
  const done = (id: string) => !!watched[id] || profile.known.includes(id);
  // The topic of the most recent reel finished in the last day, so the episode does not stay on one subject.
  const recent = Object.entries(watched).map(([id, w]) => ({ id, t: new Date(w.at).getTime() })).filter(x => Number.isFinite(x.t) && now.getTime() - x.t < DAY).sort((a, b) => b.t - a.t)[0];
  const recentTopic = recent ? reels.find(r => r.id === recent.id)?.topic : undefined;

  const out: { reel: Reel; reason: L | null; why: Ranked['why']; score: number; i: number }[] = [];
  reels.forEach((reel, i) => {
    const meta = metaOf(reel.id), w = watched[reel.id];
    if (signals.strain && meta.growth) return;                                   // never "put in more" to someone under strain
    const age = w ? (now.getTime() - new Date(w.at).getTime()) / DAY : Infinity;
    let score = 0, why: Ranked['why'] = 'done', reason: L | null = null;
    if (w && !w.correct && age >= 1) { score = 110; why = 'review'; reason = l('You missed this question. Try it again.', 'यह सवाल छूट गया था। फिर कोशिश करें।'); }
    else if (w && w.correct && age >= 7 && !profile.known.includes(reel.id)) { score = 20; why = 'refresh'; reason = l('A week on: a quick refresher.', 'एक हफ़्ते बाद: एक छोटा दोहराव।'); }
    else if (profile.known.includes(reel.id)) { score = 5; why = 'done'; }
    else if (w) { score = 10; why = 'done'; }
    else {
      const { need, pillar } = needOf(reel, signals);
      const hit = (meta.triggers ?? []).find(t => trig.has(t));
      const gentle = signals.strain && ((meta.needs.debt ?? 0) >= 0.7 || (meta.needs.emergency ?? 0) >= 0.8);
      const time = hit || gentle ? 1 : 0;
      const season = seasonLiftFor(reel, meta, now), step = lifted.get(reel.id) ?? null, keep = saved.has(reel.id);
      const easier = lowered.has(reel.id) && !hit && !gentle;                // a milestone only lowers a reel nothing else makes timely
      const lower = (byTopic.get(reel.topic) ?? []).filter(x => levelIndex(metaOf(x.id).level) < levelIndex(meta.level));
      const ready = lower.length === 0 || lower.some(x => done(x.id)) ? 1 : 0.5;
      const fatigue = Math.min(0.75, 0.25 * (profile.less[reel.topic] ?? 0)) + (recentTopic === reel.topic ? 0.15 : 0);
      const fit = reel.poke ? pokeFit(profile) : 1;                        // learned on the phone: do they play with interactive reels or skip them
      const lift = W_NEED * need + W_TIME * time + W_READY * ready + (season?.lift ?? 0) + (step ? MS_LIFT : 0) + (keep ? W_SAVED : 0);
      score = 40 + 60 * lift * fit * (1 - Math.min(0.9, fatigue));
      if (easier) score = 40 + (score - 40) * MS_LOWER;
      score = Math.min(FRESH_MAX, score);
      if (hit) { why = 'timely'; reason = trig.get(hit) ?? TRIGGER_NOTES[hit] ?? null; }
      else if (gentle) { why = 'gentle'; reason = GENTLE; }
      else if (pillar && need >= 0.5) {
        why = 'pillar';
        const sc = signals.pillars[pillar];
        reason = pillar === signals.weakest
          ? l(`Your ${PILLAR_NAME[pillar].en} is your lowest Money Score pillar.`, `आपका ${PILLAR_NAME[pillar].hi} आपके Money Score का सबसे कमज़ोर हिस्सा है।`)
          : sc !== undefined ? l(`Your ${PILLAR_NAME[pillar].en} scores ${Math.round(sc)} out of 100 in Money Score.`, `Money Score में आपका ${PILLAR_NAME[pillar].hi} 100 में से ${Math.round(sc)} है।`) : null;
      } else if (season) { why = 'timely'; reason = season.note; }
      else if (step) { why = 'new'; reason = step; }
      else if (keep) { why = 'new'; reason = SAVED_NOTE; }
      else why = 'new';
    }
    if (due && due.id === reel.id && score < PLEDGE_SCORE) { score = PLEDGE_SCORE; why = 'pledge'; reason = resurfaceReason(due.times); }
    out.push({ reel, reason, why, score, i });
  });
  return out.sort((a, b) => b.score - a.score || a.i - b.i).map(({ reel, reason, why }) => ({ reel, reason, why }));
}

/**
 * The weekly blind spot: once a week, the best unseen reel for the person's weakest Money Score pillar, even if they have shown no interest in
 * it and have asked for less of its topic. Null when no score is saved, it was already offered this week, or nothing suits. Never a reel the
 * ranker hid for money strain, because it only chooses from the ranking it is given.
 */
export function blindSpot(ranked: Ranked[], signals: Signals, profile: ReelsProfile, now: Date): Ranked | null {
  if (!signals.weakest || Object.keys(signals.pillars).length === 0) return null;
  if (profile.blindWeek === weekKey(now)) return null;
  const hit = ranked.find(r => r.why !== 'done' && r.why !== 'refresh' && r.why !== 'pledge' && (metaOf(r.reel.id).needs[signals.weakest as keyof Signals['pillars']] ?? 0) >= 0.6);
  if (!hit) return null;
  return { ...hit, why: 'blind', reason: l(`A weekly look at your weakest area: ${PILLAR_NAME[signals.weakest].en}.`, `हर हफ़्ते आपके सबसे कमज़ोर हिस्से पर एक नज़र: ${PILLAR_NAME[signals.weakest].hi}।`) };
}
