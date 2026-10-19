// The Money Map: nine topics by four rungs (myth, concept, decision, action). A rung fills as the person finishes the reels on it, and each
// topic points at the next reel on the lowest rung that is not done. Pure functions of the library, the ladder levels in meta.ts and the watched record.
import { LEVELS, metaOf, type Level } from '@/lib/reels/meta';
import type { L, Reel, Topic } from '@/lib/reels/types';

type Watched = Record<string, { at: string; correct: boolean }>;

export const TOPIC_ORDER: Topic[] = ['basics', 'invest', 'loans', 'credit', 'protect', 'tax', 'retire', 'goals', 'safety'];
export const TOPIC_NAME: Record<Topic, L> = {
  basics: { en: 'Basics', hi: 'बुनियादी' }, invest: { en: 'Investing', hi: 'निवेश' }, loans: { en: 'Loans', hi: 'लोन' },
  credit: { en: 'Credit', hi: 'क्रेडिट' }, protect: { en: 'Protection', hi: 'सुरक्षा' }, tax: { en: 'Tax', hi: 'टैक्स' },
  retire: { en: 'Retirement', hi: 'रिटायरमेंट' }, goals: { en: 'Goals', hi: 'लक्ष्य' }, safety: { en: 'Scams', hi: 'धोखाधड़ी' },
};
export const LEVEL_NAME: Record<Level, L> = {
  myth: { en: 'Myth', hi: 'भ्रम' }, concept: { en: 'Concept', hi: 'अवधारणा' }, decision: { en: 'Decision', hi: 'फ़ैसला' }, action: { en: 'Action', hi: 'कदम' },
};

export type RungState = 'empty' | 'none' | 'some' | 'done';
export interface Rung { level: Level; total: number; watched: number; right: number; state: RungState; next: string | null }
export interface TopicRow { topic: Topic; rungs: Rung[]; total: number; watched: number; right: number; /** the next reel to watch in this topic */ next: string | null; /** the share of answers right so far, or null before any */ strength: number | null }

export function buildMap(reels: Reel[], watched: Watched): TopicRow[] {
  return TOPIC_ORDER.map(topic => {
    const inTopic = reels.filter(r => r.topic === topic);
    const rungs: Rung[] = LEVELS.map(level => {
      const here = inTopic.filter(r => metaOf(r.id).level === level);
      const seen = here.filter(r => watched[r.id]), right = seen.filter(r => watched[r.id].correct).length;
      const state: RungState = here.length === 0 ? 'empty' : seen.length === 0 ? 'none' : seen.length === here.length ? 'done' : 'some';
      return { level, total: here.length, watched: seen.length, right, state, next: here.find(r => !watched[r.id])?.id ?? null };
    });
    const watchedN = rungs.reduce((n, r) => n + r.watched, 0), rightN = rungs.reduce((n, r) => n + r.right, 0);
    return { topic, rungs, total: inTopic.length, watched: watchedN, right: rightN, next: rungs.find(r => r.next)?.next ?? null, strength: watchedN ? rightN / watchedN : null };
  });
}
