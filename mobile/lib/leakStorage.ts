// Future Loss on the device: read what it needs, and write the three figures the rest of FIN-OS reads (same keys as the website).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadTransactions } from '@/lib/txnStorage';
import { compute, type LeakOptions, type LeakResult } from '@/lib/leak';
import { finite, getText } from '@/lib/safeStore';

export async function loadLeakInputs(): Promise<{ txns: LeakOptions['txns']; subscriptionsMonthly: number }> {
  const [txns, subsRaw] = await Promise.all([loadTransactions(), getText('finos_subscriptions_monthly')]);
  let subs = 0;
  try { subs = finite(JSON.parse(subsRaw ?? '0')); } catch { subs = finite(subsRaw); }
  if (subs < 0) subs = 0;
  return { txns, subscriptionsMonthly: subs };
}

export async function computeLeak(opts: Omit<LeakOptions, 'txns' | 'subscriptionsMonthly'>): Promise<LeakResult> {
  return compute({ ...opts, ...(await loadLeakInputs()) });
}

/** Persist the figures the Money Score, PULSE and Arya read. Only when there is enough data: a thin month must not overwrite a good one. */
export async function saveLeakFigures(r: LeakResult, now = new Date()): Promise<void> {
  if (!r.enoughData && !(r.monthly > 0)) return;
  const twenty = r.horizons.find(h => h.years === 20);
  await AsyncStorage.multiSet([
    ['finos_leak_monthly', JSON.stringify(r.monthly)],
    ['finos_leak_future_20y', JSON.stringify(twenty ? twenty.value : 0)],
    ['finos_leak_synced_at', JSON.stringify(now.toISOString())],
  ]);
}
