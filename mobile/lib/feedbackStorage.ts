// Storage side of feedback, usage counters and consents (AsyncStorage). The logic is in feedback.ts / usage.ts / consents.ts.
// Keys are the website's: finos_feedback_log, finos_usage, finos_consents. All three are device-only: they never sync to the
// cloud (lib/trackerSync.ts) and never go into a backup (lib/backup.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appInfo } from '@/lib/appInfo';
import { CONFIG, LOG_KEY, addEvent, buildReport, parseLog, send, type FeedbackEvent, type Report } from '@/lib/feedback';
import { CONSENT_KEY, hasConsent, parseConsents, withConsent, withdrawAll, type ConsentMap } from '@/lib/consents';
import { EMPTY_USAGE, USAGE_KEY, normaliseUsage, usageAdd, type UsageData } from '@/lib/usage';

const appVersion = (): string | null => { const v = appInfo().appVersion; return v === 'unknown' ? null : v; };

let chain: Promise<unknown> = Promise.resolve();
const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

// ── consents ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
let consentCache: ConsentMap | null = null;
export async function loadConsents(): Promise<ConsentMap> {
  try { consentCache = parseConsents(await AsyncStorage.getItem(CONSENT_KEY)); } catch { consentCache = {}; }
  return consentCache;
}
export async function consentGranted(id: string): Promise<boolean> {
  return hasConsent(consentCache ?? await loadConsents(), id);
}
/** Synchronous answer from what was last read (false until loaded): used by the usage counter so it never blocks a screen. */
export const consentGrantedSync = (id: string) => hasConsent(consentCache ?? {}, id);

export async function setConsentFor(id: string, granted: boolean, now: Date = new Date()): Promise<ConsentMap> {
  return serial(async () => {
    const next = withConsent(await loadConsents(), id, granted, now);
    consentCache = next;
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(next));
    return next;
  });
}
export async function withdrawAllConsents(now: Date = new Date()): Promise<void> {
  return serial(async () => { const next = withdrawAll(await loadConsents(), now); consentCache = next; await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(next)); });
}

// ── feedback log ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function loadFeedback(): Promise<FeedbackEvent[]> {
  try { return parseLog(await AsyncStorage.getItem(LOG_KEY)); } catch { return []; }
}
export async function saveFeedback(raw: { rating?: 'up' | 'down' | null; comment?: string; topic?: string; page?: string }, now: Date = new Date()): Promise<FeedbackEvent | null> {
  return serial(async () => {
    const r = addEvent(await loadFeedback(), raw, now);
    if (!r.saved) return null;
    try { await AsyncStorage.setItem(LOG_KEY, JSON.stringify(r.list)); } catch { return null; }
    return r.saved;
  });
}
export async function removeFeedback(index: number): Promise<void> {
  return serial(async () => { const l = await loadFeedback(); if (index >= 0 && index < l.length) { l.splice(index, 1); await AsyncStorage.setItem(LOG_KEY, JSON.stringify(l)); } });
}
export async function clearFeedback(): Promise<void> { await AsyncStorage.removeItem(LOG_KEY); }

// ── usage counters ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function loadUsage(): Promise<UsageData> {
  try { const raw = await AsyncStorage.getItem(USAGE_KEY); return raw ? normaliseUsage(JSON.parse(raw)) : { ...EMPTY_USAGE }; } catch { return { ...EMPTY_USAGE }; }
}
/** Counts one open of `route`, but only while the 'usage' consent is on. Never throws, never waits for the screen. */
export function countScreen(route: string, now: Date = new Date()): void {
  if (!consentGrantedSync('usage')) return;
  serial(async () => {
    if (!consentGrantedSync('usage')) return;
    await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(usageAdd(await loadUsage(), route, now)));
  }).catch(() => {});
}
export async function clearUsage(): Promise<void> { await AsyncStorage.removeItem(USAGE_KEY); }

// ── reports ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The feedback report as it would be shared. Usage is included only when asked for AND the usage consent is on. */
export async function currentReport(opts: { includeUsage?: boolean } = {}): Promise<Report> {
  const usage = opts.includeUsage && (await consentGranted('usage')) ? await loadUsage() : null;
  return buildReport({ feedback: await loadFeedback(), usage, now: new Date(), include: { feedback: true, usage: !!usage }, appVersion: appVersion() });
}

/** After a save: sends only if consent is on and an endpoint is configured (neither is true today). Returns the reason when not sent. */
export async function sendLatest() {
  await loadConsents();
  const latest = (await loadFeedback()).slice(-1);
  return send({ feedback: latest, usage: null }, { consent: id => consentGrantedSync(id), fetch: (globalThis as any).fetch ?? null, endpoint: CONFIG.endpoint });
}
