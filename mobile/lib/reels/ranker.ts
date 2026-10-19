// Ranker v2: which reel is best for this person today, and why. It replaces the two signals of rankReels (weakest pillar, quiz history) with
// the blueprint's formula over everything on the phone, still as a pure function so each rule is tested with made-up people.
//
//   fresh reel score = 40 + 60 × (0.5·Need + 0.35·Timeliness + 0.15·Readiness) × Fit × (1 − Fatigue)
//
// A question missed yesterday still comes first (110), a refresher of a right answer after a week is low (20), a finished reel lower (10),
// and a reel the person said they know lowest (5). A person under money strain never sees a reel whose message is "put in more".
import { PILLAR_NAME, type Ranked, type Watched } from '@/lib/reels/journey';
import { levelIndex, metaOf } from '@/lib/reels/meta';
import { pokeFit, weekKey, type ReelsProfile } from '@/lib/reels/reelsProfile';
import type { Signals } from '@/lib/reels/signals';
import { activeTriggers, TRIGGER_NOTES } from '@/lib/reels/triggers';
import type { L, Reel } from '@/lib/reels/types';

const DAY = 86_400_000;
const l = (en: string, hi: string): L => ({ en, hi });

export const W_NEED = 0.5, W_TIME = 0.35, W_READY = 0.15;
/** Without a saved Money Score every pillar counts as a modest need, so no reel is favoured for a reason the app does not know. */
const UNKNOWN_GAP = 0.3;

export interface RankV2Input { watched: Watched; signals: Signals; profile: ReelsProfile; now: Date }

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

export function rankReelsV2(reels: Reel[], { watched, signals, profile, now }: RankV2Input): Ranked[] {
  const trig = activeTriggers(signals);
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
      const lower = (byTopic.get(reel.topic) ?? []).filter(x => levelIndex(metaOf(x.id).level) < levelIndex(meta.level));
      const ready = lower.length === 0 || lower.some(x => done(x.id)) ? 1 : 0.5;
      const fatigue = Math.min(0.75, 0.25 * (profile.less[reel.topic] ?? 0)) + (recentTopic === reel.topic ? 0.15 : 0);
      const fit = reel.poke ? pokeFit(profile) : 1;                        // learned on the phone: do they play with interactive reels or skip them
      score = 40 + 60 * (W_NEED * need + W_TIME * time + W_READY * ready) * fit * (1 - Math.min(0.9, fatigue));
      if (hit) { why = 'timely'; reason = trig.get(hit) ?? TRIGGER_NOTES[hit] ?? null; }
      else if (gentle) { why = 'gentle'; reason = GENTLE; }
      else if (pillar && need >= 0.5) {
        why = 'pillar';
        const sc = signals.pillars[pillar];
        reason = pillar === signals.weakest
          ? l(`Your ${PILLAR_NAME[pillar].en} is your lowest Money Score pillar.`, `आपका ${PILLAR_NAME[pillar].hi} आपके Money Score का सबसे कमज़ोर हिस्सा है।`)
          : sc !== undefined ? l(`Your ${PILLAR_NAME[pillar].en} scores ${Math.round(sc)} out of 100 in Money Score.`, `Money Score में आपका ${PILLAR_NAME[pillar].hi} 100 में से ${Math.round(sc)} है।`) : null;
      } else why = 'new';
    }
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
  const hit = ranked.find(r => r.why !== 'done' && r.why !== 'refresh' && (metaOf(r.reel.id).needs[signals.weakest as keyof Signals['pillars']] ?? 0) >= 0.6);
  if (!hit) return null;
  return { ...hit, why: 'blind', reason: l(`A weekly look at your weakest area: ${PILLAR_NAME[signals.weakest].en}.`, `हर हफ़्ते आपके सबसे कमज़ोर हिस्से पर एक नज़र: ${PILLAR_NAME[signals.weakest].hi}।`) };
}
