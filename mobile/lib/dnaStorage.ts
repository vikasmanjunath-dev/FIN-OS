// The Financial DNA answers on the device (the website's FINOS_CORE_DNA {responses, scores}).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DNA_KEY, STEPS, isComplete, normalise, scoresFor, type Saved } from '@/lib/dna';

export async function loadDna(): Promise<Saved | null> {
  try { return normalise(JSON.parse((await AsyncStorage.getItem(DNA_KEY)) ?? 'null')); } catch { return null; }
}

/** Scores only once every question is answered: a half-finished quiz must not move the Health Score. */
export async function loadDnaScores(): Promise<number[] | null> {
  const s = await loadDna();
  return s && isComplete(s.responses) ? s.scores : null;
}

export async function saveDna(responses: Record<string, string>): Promise<Saved> {
  const clean: Record<string, string> = {};
  STEPS.forEach(s => { if (typeof responses[s.lvl] === 'string') clean[s.lvl] = responses[s.lvl]; });
  const saved = { responses: clean, scores: scoresFor(clean) };
  await AsyncStorage.setItem(DNA_KEY, JSON.stringify(saved));
  return saved;
}

export const resetDna = () => AsyncStorage.removeItem(DNA_KEY);
