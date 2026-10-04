import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUBSCRIPTIONS_KEY, Subscription, normalize, normalizeAll, summarize, localToday } from '@/lib/subscriptions';

// Same key and shape as the website (js/finos-subscriptions.js), so a list built on either side is readable on the other.
// The website also writes two derived totals for the rest of FIN·OS; we keep them in step.
const MONTHLY_KEY = 'finos_subscriptions_monthly';
const ANNUAL_KEY = 'finos_subscriptions_annual';

// Read-modify-write on one key — serialise so two quick taps can't lose a change.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export async function loadSubscriptions(): Promise<Subscription[]> {
  try {
    return normalizeAll(JSON.parse((await AsyncStorage.getItem(SUBSCRIPTIONS_KEY)) ?? '[]'));
  } catch {
    return [];
  }
}

async function writeAll(list: Subscription[]) {
  const clean = normalizeAll(list);
  const sum = summarize(clean, localToday());
  await AsyncStorage.multiSet([
    [SUBSCRIPTIONS_KEY, JSON.stringify(clean)],
    [MONTHLY_KEY, JSON.stringify(Math.round(sum.monthly))],
    [ANNUAL_KEY, JSON.stringify(Math.round(sum.annual))],
  ]);
}

export type SubscriptionInput = Omit<Subscription, 'id'>;

/** Returns the saved record, or null if the input is not a valid subscription. */
export function addSubscription(input: SubscriptionInput): Promise<Subscription | null> {
  return exclusive(async () => {
    const rec = normalize(input);
    if (!rec) return null;
    await writeAll([...(await loadSubscriptions()), rec]);
    return rec;
  });
}

export function updateSubscription(id: string, patch: Partial<SubscriptionInput>): Promise<boolean> {
  return exclusive(async () => {
    const list = await loadSubscriptions();
    const i = list.findIndex(s => s.id === id);
    if (i < 0) return false;
    const next = normalize({ ...list[i], ...patch, id });
    if (!next) return false;
    list[i] = next;
    await writeAll(list);
    return true;
  });
}

export function removeSubscription(id: string): Promise<boolean> {
  return exclusive(async () => {
    const list = await loadSubscriptions();
    const next = list.filter(s => s.id !== id);
    if (next.length === list.length) return false;
    await writeAll(next);
    return true;
  });
}
