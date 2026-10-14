// The "since your last visit" snapshot for the PULSE feed. Same key and the same shape as the website
// (js/arya-sidebar-panel.js writes `finos_pulse_snapshot`), saved by the same rule: only when there is none, or the last is 6+ hours old.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Snapshot } from '@/lib/pulseRank';

export const SNAPSHOT_KEY = 'finos_pulse_snapshot';
export const SNAPSHOT_MIN_GAP_MS = 6 * 3600 * 1000;

/** Tolerant read: anything that is not a snapshot object with a finite `at` is "no snapshot". */
export function normaliseSnapshot(raw: unknown): Snapshot | null {
  let o: any = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return null; } }
  if (!o || typeof o !== 'object' || typeof o.at !== 'number' || !Number.isFinite(o.at)) return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const r = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { at: o.at, netWorth: n(o.netWorth), debt: n(o.debt), sip: n(o.sip), savingsRate: r(o.savingsRate), emergencyMonths: r(o.emergencyMonths),
    policies: n(o.policies), goals: n(o.goals), moneyScore: r(o.moneyScore) };
}

export const shouldSave = (prev: Snapshot | null, cur: Snapshot) => !prev || cur.at - prev.at >= SNAPSHOT_MIN_GAP_MS;

export async function loadSnapshot(): Promise<Snapshot | null> {
  try { return normaliseSnapshot(await AsyncStorage.getItem(SNAPSHOT_KEY)); } catch { return null; }
}
export async function saveSnapshot(s: Snapshot): Promise<void> {
  try { await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s)); } catch { /* not kept */ }
}
