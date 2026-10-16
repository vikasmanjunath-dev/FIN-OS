// Anonymous usage counters kept on the phone: how often each screen opened, nothing about what was on it.
// Same structure and rules as FinosFeedback.Usage in js/finos-feedback.js ({ v:1, days: { 'YYYY-MM-DD': { page: n } } }, 90 days),
// with the website's page-path rule swapped for a screen-name rule (parity test injects the website's rule to prove the counting is the same).
// Counting happens only while the 'usage' consent is on (lib/consents.ts); the default is off. Pure: no storage, no React Native.

export const USAGE_DAYS = 90;
export const MAX_COUNT = 100000;
export const USAGE_KEY = 'finos_usage';

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar day, no finer: same as the website. */
export function dayOf(d?: Date | null): string {
  const x = d instanceof Date && !Number.isNaN(+d) ? d : new Date();
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/**
 * A screen name from a route: "/tools/score" -> "tools/score", "/(tabs)/dashboard" -> "dashboard", "/" -> "index".
 * Anything that could carry something a person typed (query string, ids with digits, odd characters, deep paths) -> "unknown".
 */
export function cleanScreen(p: unknown): string {
  if (p == null) return 'unknown';
  let s = String(p).split(/[?#]/)[0];
  s = s.replace(/\([a-z0-9-]+\)\/?/gi, '').replace(/^\/+|\/+$/g, '');
  if (s === '') return 'index';
  if (s.length > 80 || s.includes('..')) return 'unknown';
  s = s.toLowerCase();
  if (!/^[a-z][a-z0-9-]{0,29}(?:\/[a-z][a-z0-9-]{0,29}){0,3}$/.test(s)) return 'unknown';
  if (/\d{3,}/.test(s)) return 'unknown';
  return s;
}

export interface UsageData { v: 1; days: Record<string, Record<string, number>> }
export const EMPTY_USAGE: UsageData = { v: 1, days: {} };

/** A new usage object with one more open for `screen` today. Older than 90 days is dropped. `clean` is injectable for the parity test. */
export function usageAdd(data: any, screen: unknown, now: Date, clean: (p: unknown) => string = cleanScreen): UsageData {
  const today = dayOf(now);
  const days: Record<string, Record<string, number>> = { ...(data && typeof data.days === 'object' && data.days ? data.days : {}) };
  const page = clean(screen);
  days[today] = { ...(days[today] || {}) };
  days[today][page] = (Number(days[today][page]) || 0) + 1;
  const keep = Object.keys(days).sort().slice(-USAGE_DAYS);
  return { v: 1, days: Object.fromEntries(keep.map(d => [d, days[d]])) };
}

/** Total opens per screen across all days. */
export function usageTotals(data: any): Record<string, number> {
  const out: Record<string, number> = {};
  Object.values((data && data.days) || {}).forEach((d: any) => Object.entries(d || {}).forEach(([p, n]) => { out[p] = (out[p] || 0) + (Number(n) || 0); }));
  return out;
}

/** Stored value -> a clean object: only real days, only clean screen names, positive capped counts. Re-run on every read. */
export function normaliseUsage(data: any, clean: (p: unknown) => string = cleanScreen): UsageData {
  const out: UsageData = { v: 1, days: {} };
  if (!data || typeof data !== 'object' || !data.days || typeof data.days !== 'object') return out;
  Object.keys(data.days).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-USAGE_DAYS).forEach(d => {
    const row: Record<string, number> = {};
    Object.entries(data.days[d] || {}).forEach(([p, n]) => {
      const cp = clean(p);
      const c = Math.min(Number(n), MAX_COUNT);
      if (cp !== 'unknown' && c > 0) row[cp] = (row[cp] || 0) + c;
    });
    if (Object.keys(row).length) out.days[d] = row;
  });
  return out;
}

/** Sorted list for display: most opened first. */
export function usageRows(data: any): { screen: string; count: number }[] {
  return Object.entries(usageTotals(data)).filter(([p]) => p !== 'unknown').map(([screen, count]) => ({ screen, count })).sort((a, b) => b.count - a.count || a.screen.localeCompare(b.screen));
}
