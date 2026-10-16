// Crash and error reports kept ON THE PHONE, redacted, readable and deletable. There is no crash-reporting service: nothing is
// sent automatically. The person can open Diagnostics, read exactly what is stored, delete it, or share a report through the
// phone's share sheet. The privacy notice (lib/privacy.ts) and a test (privacy.test.mts) keep it that way.
//
// What a record holds: the error's name and message (numbers, names-in-quotes, e-mails, links and IDs removed), at most ten stack
// frames reduced to "function (file:line:col)" (no paths, hosts or arguments), the screen, the app version and the OS. A day, not a time.
// What it cannot hold: anything the person typed, a figure, an account. A message can still carry a word in plain prose; the screen says so.
// Pure: no storage, no React Native; "now" and the environment are parameters.
import { redactShort } from '@/lib/redact';
import { cleanScreen, dayOf, normaliseUsage } from '@/lib/usage';

export const MAX_CRASHES = 20;
export const MAX_FRAMES = 10;
export const MAX_MESSAGE = 160;
export const CRASH_KEY = 'finos_diag_crashes';
export const MAX_COUNT = 9999;

export type CrashKind = 'render' | 'js-error' | 'unhandled-rejection';
export interface Env { appVersion: string; os: string; osVersion: string }

export interface CrashRecord {
  v: 1; day: string; lastDay: string; kind: CrashKind; fatal: boolean; name: string; message: string; stack: string[];
  screen: string; count: number; appVersion: string; os: string; osVersion: string;
}

const IDENT = /^[A-Za-z_$][\w$.]{0,30}$/;
const KEEP_AFTER = /(?:propert(?:y|ies)|reading|setting|calling|function|method|module|variable|reference|key|export|component|attribute|evaluating|element|prop)\s*$/i;

/** Quoted text is where a thrown message carries data ("Unexpected token 'A', "Asha Rao" is not valid JSON"): keep only code-like names after a known word. */
export function scrubQuoted(msg: string): string {
  return msg.replace(/(["'`])((?:\\.|(?!\1).){0,200})\1/g, (m, _q, inner, offset: number) => {
    const before = msg.slice(Math.max(0, offset - 24), offset);
    return IDENT.test(inner) && KEEP_AFTER.test(before) ? m : '"…"';
  });
}

export function cleanName(n: unknown): string {
  const s = typeof n === 'string' ? n : '';
  return /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(s) ? s : 'Error';
}

/** One stack frame ("at fn (http://<dev-host>:8081/path/file.js?x=1:12:34)" or "fn@file:12:34") -> "fn (file.js:12:34)". */
export function cleanFrame(line: string): string | null {
  const raw = String(line).trim();
  if (!raw) return null;
  let fn = '', loc = '';
  let m = raw.match(/^at\s+(?:async\s+)?(.*?)\s*\((.*)\)\s*$/);
  if (m) { fn = m[1]; loc = m[2]; }
  else if ((m = raw.match(/^at\s+(.*)$/))) { loc = m[1]; }
  else if ((m = raw.match(/^([^@\s]*)@(.*)$/))) { fn = m[1]; loc = m[2]; }
  else return null;
  const pos = loc.match(/:(\d+):(\d+)\)?$/);
  if (!pos) return null;
  const path = loc.slice(0, loc.length - pos[0].length).split('?')[0];
  const file = path.split(/[\\/]/).pop() || '';
  const okFile = /^[\w.\-\[\]()]{1,60}$/.test(file) ? file : 'bundle';
  const okFn = IDENT.test(fn.replace(/^new\s+/, '').replace(/^Object\./, '')) ? fn.slice(0, 40) : '';
  return `${okFn ? okFn + ' ' : ''}(${okFile}:${pos[1]}:${pos[2]})`;
}

export function cleanStack(stack: unknown): string[] {
  if (typeof stack !== 'string') return [];
  const out: string[] = [];
  for (const line of stack.split('\n')) {
    const f = cleanFrame(line);
    if (f) out.push(f);
    if (out.length >= MAX_FRAMES) break;
  }
  return out;
}

export function sanitizeError(err: unknown): { name: string; message: string; stack: string[] } {
  const e: any = err;
  const name = cleanName(e && typeof e === 'object' ? e.name : undefined);
  const rawMsg = e && typeof e === 'object' && 'message' in e ? String(e.message ?? '') : typeof err === 'string' ? err : '';
  const message = redactShort(scrubQuoted(rawMsg.slice(0, 1000)), MAX_MESSAGE);
  const stack = cleanStack(e && typeof e === 'object' ? e.stack : undefined);
  return { name, message, stack };
}

export function makeRecord(err: unknown, o: { kind: CrashKind; fatal?: boolean; screen?: string | null; env: Env; now: Date }): CrashRecord {
  const s = sanitizeError(err);
  const day = dayOf(o.now);
  return {
    v: 1, day, lastDay: day, kind: o.kind, fatal: o.fatal === true, name: s.name, message: s.message, stack: s.stack,
    screen: cleanScreen(o.screen ?? 'unknown'), count: 1, appVersion: o.env.appVersion, os: o.env.os, osVersion: o.env.osVersion,
  };
}

const sig = (r: CrashRecord) => `${r.kind}|${r.name}|${r.message}|${r.stack[0] ?? ''}|${r.screen}`;

/** Appends a record to the ring buffer. A repeat of the same crash only raises the count, so a crash loop cannot push everything else out. */
export function addCrash(list: CrashRecord[], rec: CrashRecord): CrashRecord[] {
  const i = list.findIndex(r => sig(r) === sig(rec));
  if (i >= 0) {
    const next = list.slice();
    const cur = next[i];
    next.splice(i, 1);
    next.push({ ...cur, count: Math.min(MAX_COUNT, cur.count + 1), lastDay: rec.lastDay, fatal: cur.fatal || rec.fatal });
    return next;
  }
  return [...list, rec].slice(-MAX_CRASHES);
}

/** Stored value -> clean records. Everything is cleaned again on read, so a tampered or old value cannot show or share more than the rules allow. */
export function parseCrashes(raw: unknown): CrashRecord[] {
  let v: any = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { v = []; } }
  if (!Array.isArray(v)) return [];
  const out: CrashRecord[] = [];
  for (const r of v) {
    if (!r || typeof r !== 'object') continue;
    const kind: CrashKind = r.kind === 'render' || r.kind === 'unhandled-rejection' ? r.kind : 'js-error';
    const day = typeof r.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : '';
    if (!day) continue;
    const lastDay = typeof r.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.lastDay) ? r.lastDay : day;
    const keep = (x: unknown, re: RegExp) => (typeof x === 'string' && re.test(x) ? x : 'unknown');
    out.push({
      v: 1, day, lastDay, kind, fatal: r.fatal === true,
      name: cleanName(r.name),
      message: redactShort(scrubQuoted(String(r.message ?? '').slice(0, 1000)), MAX_MESSAGE),
      stack: (Array.isArray(r.stack) ? r.stack : []).slice(0, MAX_FRAMES).map((f: unknown) => cleanFrame(`at ${String(f)}`) ?? '').filter(Boolean),
      screen: cleanScreen(r.screen),
      count: Math.max(1, Math.min(MAX_COUNT, Math.floor(Number(r.count) || 1))),
      appVersion: keep(r.appVersion, /^[0-9A-Za-z.\-+]{1,20}$/), os: keep(r.os, /^[a-z]{2,10}$/), osVersion: keep(r.osVersion, /^[0-9A-Za-z.\-]{1,20}$/),
    });
  }
  return out.slice(-MAX_CRASHES);
}

export interface DiagnosticReport {
  app: 'FIN-OS'; kind: 'diagnostic-report'; v: 1; platform: 'mobile'; appVersion: string; os: string; osVersion: string; generatedAt: string;
  crashes: CrashRecord[]; usage: { v: 1; days: Record<string, Record<string, number>> } | null;
  note: string;
}

export const REPORT_NOTE = 'Made on the phone by the FIN·OS app from what is stored under Diagnostics. Numbers, amounts, e-mails, links and IDs are removed before anything is stored. Nothing is sent automatically.';

export function buildDiagnosticReport(o: { crashes: unknown; usage?: unknown; env: Env; now: Date; includeUsage?: boolean }): DiagnosticReport {
  return {
    app: 'FIN-OS', kind: 'diagnostic-report', v: 1, platform: 'mobile', appVersion: o.env.appVersion, os: o.env.os, osVersion: o.env.osVersion, generatedAt: dayOf(o.now),
    crashes: parseCrashes(o.crashes), usage: o.includeUsage && o.usage ? normaliseUsage(o.usage) : null, note: REPORT_NOTE,
  };
}

export const formatReport = (r: DiagnosticReport) => JSON.stringify(r, null, 2);

/** A short plain sentence for one record. */
export function describeCrash(r: CrashRecord): string {
  const kind = r.kind === 'render' ? 'A screen failed to draw' : r.kind === 'unhandled-rejection' ? 'A background task failed' : 'An error was not handled';
  return `${kind}${r.screen !== 'unknown' ? ` on "${r.screen}"` : ''}${r.count > 1 ? `, ${r.count} times` : ''}`;
}
