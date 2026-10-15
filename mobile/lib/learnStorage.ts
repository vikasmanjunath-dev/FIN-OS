// Learn progress on the device. Same key and shape as the website (js/learn-ai.js), so lessons count on both.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEARNED_KEY, OPENED_KEY, parseLearned, parseOpened, markLearned, unmarkLearned, markOpened, type Learned, type Opened } from '@/lib/learn';
import { saveTracker } from '@/lib/trackerStorage';
import { keepIfUnreadable } from '@/lib/safeStore';

export async function loadLearned(): Promise<Learned> {
  try { return parseLearned(await AsyncStorage.getItem(LEARNED_KEY)); } catch { return {}; }
}

export async function loadOpened(): Promise<Opened> {
  try { return parseOpened(await AsyncStorage.getItem(OPENED_KEY)); } catch { return {}; }
}

/** Writes the website's object shape (an array left by older data is converted: ids are kept, nothing is invented). */
async function writeLearned(l: Learned) {
  await keepIfUnreadable(LEARNED_KEY, 'any');
  await AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(l));
  // the Health Score's Knowledge points depend on this: refresh the derived keys the website and Arya read
  await saveTracker({}).catch(() => undefined);
}

export async function setLearned(id: string, learned: boolean, now = new Date()): Promise<Learned> {
  const cur = await loadLearned();
  const next = learned ? markLearned(cur, id, now) : unmarkLearned(cur, id);
  try { await writeLearned(next); } catch { /* storage unavailable: the screen keeps its in-memory state */ }
  return next;
}

export async function noteOpened(id: string, now = new Date()): Promise<void> {
  try { await AsyncStorage.setItem(OPENED_KEY, JSON.stringify(markOpened(await loadOpened(), id, now))); } catch { /* non-fatal */ }
}
