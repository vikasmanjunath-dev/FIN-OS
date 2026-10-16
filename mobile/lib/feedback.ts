// Feedback on the phone: the same private-by-design loop as the website (js/finos-feedback.js, docs/FEEDBACK.md).
//   - Feedback lives ON THE DEVICE; the person can see it, share it and delete it.
//   - Comments are redacted before they are stored (lib/redact.ts): amounts, numbers, e-mails, links and IDs never persist.
//   - Nothing is sent unless (1) the matching consent is on AND (2) an endpoint is configured. The endpoint is null, as on the
//     website, so nothing is sent today whatever the consent says. The honest way out is the share sheet: the person shares the
//     report file themselves.
//   - No user id, no device id, no time finer than a day, no route parameters.
// Pure: no storage, no React Native. The only code that could send anything is `send`, and it takes `fetch` as an argument.
import { redact, MAX_COMMENT } from '@/lib/redact';
import { cleanScreen, dayOf, normaliseUsage, USAGE_DAYS } from '@/lib/usage';

export const TOPICS = ['money-score', 'tax', 'calculators', 'arya', 'trackers', 'design', 'privacy', 'other'] as const;
export type Topic = typeof TOPICS[number];
export const TOPIC_LABELS: Record<Topic, string> = {
  'money-score': 'Money Score', tax: 'Tax', calculators: 'Calculators', arya: 'Arya', trackers: 'Trackers', design: 'Design and layout', privacy: 'Privacy', other: 'Something else',
};
export const MAX_LOG = 50;
export { MAX_COMMENT };
export const LOG_KEY = 'finos_feedback_log';

/** Where reports go. null on purpose: until a real inbox exists nothing is sent, whatever the consent says. */
export const CONFIG: { endpoint: string | null } = { endpoint: null };
export function configure(o: { endpoint?: string | null } | null | undefined): string | null {
  CONFIG.endpoint = o && /^https:\/\//i.test(String(o.endpoint ?? '')) ? String(o.endpoint) : null;
  return CONFIG.endpoint;
}

export interface FeedbackEvent { day: string; page: string; topic: Topic; rating: 'up' | 'down' | null; comment: string }

export function sanitizeEvent(raw: any, now: Date): FeedbackEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const rating = raw.rating === 'up' || raw.rating === 'down' ? raw.rating : null;
  const comment = typeof raw.comment === 'string' ? redact(raw.comment) : '';
  if (!rating && !comment) return null;                                   // nothing worth keeping
  return { day: dayOf(now), page: cleanScreen(raw.page), topic: (TOPICS as readonly string[]).includes(raw.topic) ? raw.topic : 'other', rating, comment };
}

/** Re-sanitise a stored event (its own day is kept), so nothing stored earlier or tampered with can leak. */
function reclean(e: any): FeedbackEvent | null {
  const day = typeof e?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.day) ? e.day : null;
  const base = sanitizeEvent(e, new Date(`${day ?? ''}T12:00:00`));
  return base && day ? { ...base, day } : base;
}

export function parseLog(raw: unknown): FeedbackEvent[] {
  let v: any = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { v = []; } }
  return (Array.isArray(v) ? v : []).map(reclean).filter((e): e is FeedbackEvent => !!e).slice(-MAX_LOG);
}

export function addEvent(list: FeedbackEvent[], raw: any, now: Date): { list: FeedbackEvent[]; saved: FeedbackEvent | null } {
  const e = sanitizeEvent(raw, now);
  if (!e) return { list, saved: null };
  return { list: [...list, e].slice(-MAX_LOG), saved: e };
}

export interface Report {
  app: 'FIN-OS'; kind: 'feedback-report'; v: 1; platform: 'mobile'; appVersion: string | null; generatedAt: string;
  feedback: FeedbackEvent[]; usage: { v: 1; days: Record<string, Record<string, number>> } | null;
}

/** include: { feedback, usage }. Everything is re-sanitised here, so nothing stored earlier can leak. */
export function buildReport(o: { feedback?: unknown; usage?: unknown; now?: Date; include?: { feedback?: boolean; usage?: boolean }; appVersion?: string | null }): Report {
  const include = o.include ?? { feedback: true, usage: false };
  const feedback = include.feedback ? (Array.isArray(o.feedback) ? o.feedback : []).map(reclean).filter((e): e is FeedbackEvent => !!e).slice(-MAX_LOG) : [];
  let usage: Report['usage'] = null;
  if (include.usage && o.usage && typeof o.usage === 'object') {
    const u = normaliseUsage(o.usage);
    usage = Object.keys(u.days).length ? u : { v: 1, days: {} };
  }
  return { app: 'FIN-OS', kind: 'feedback-report', v: 1, platform: 'mobile', appVersion: o.appVersion ?? null, generatedAt: dayOf(o.now), feedback, usage };
}
export { USAGE_DAYS };

export type SendReason = 'no-consent' | 'nothing-to-send' | 'no-endpoint' | 'no-network' | 'rejected' | 'network';
export interface SendDeps { consent: (id: string) => boolean; fetch?: ((url: string, init: any) => Promise<{ ok: boolean }>) | null; endpoint: string | null }

/**
 * The only place anything could leave the phone. Sends a section only if its consent is on, and only if an https endpoint is set.
 * (Same decisions, in the same order, as FinosFeedback.send; tests run both.)
 */
export async function send(report: { feedback?: unknown; usage?: unknown } | null | undefined, deps: SendDeps): Promise<{ ok: boolean; reason?: SendReason }> {
  const allowFeedback = !!(deps && deps.consent && deps.consent('feedback'));
  const allowUsage = !!(deps && deps.consent && deps.consent('usage'));
  const body = buildReport({ feedback: report?.feedback, usage: report?.usage, now: new Date(), include: { feedback: allowFeedback, usage: allowUsage } });
  if (!allowFeedback && !allowUsage) return { ok: false, reason: 'no-consent' };
  if (!body.feedback.length && !body.usage) return { ok: false, reason: 'nothing-to-send' };
  if (!deps.endpoint || !/^https:\/\//i.test(String(deps.endpoint))) return { ok: false, reason: 'no-endpoint' };
  if (typeof deps.fetch !== 'function') return { ok: false, reason: 'no-network' };
  try {
    const res = await deps.fetch(deps.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' });
    return res && res.ok ? { ok: true } : { ok: false, reason: 'rejected' };
  } catch { return { ok: false, reason: 'network' }; }
}

/** What the person is told after saving: always says where the feedback is, never implies it was sent when it was not. */
export const OUTCOME: Record<'ok' | SendReason | 'other', string> = {
  ok: 'Saved on this phone and sent. Thank you.',
  'no-consent': 'Saved on this phone. Nothing was sent. You can share it yourself with "Share my feedback" below.',
  'nothing-to-send': 'Saved on this phone. Nothing was sent.',
  'no-endpoint': 'Saved on this phone. Nothing was sent, because the team has not set up an inbox yet. You can share it yourself with "Share my feedback" below.',
  'no-network': 'Saved on this phone. Nothing was sent.',
  network: 'Saved on this phone. Sending did not work, so nothing left your phone.',
  rejected: 'Saved on this phone. The team\'s inbox did not accept it, so nothing was kept there.',
  other: 'Saved on this phone. Nothing was sent.',
};
