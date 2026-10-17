// The record of tool calls Arya made in this session, for the Agent tab. In memory only: it is gone when the app closes, because a
// result can hold the person's own figures and the chat itself is not kept either. Calls are shown next to each answer as well.
import type { ToolStep } from '@/lib/aryaAgent';

export interface LogEntry extends ToolStep { via: 'chat' | 'agent'; question: string }

export const MAX_LOG = 40;
let entries: LogEntry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => { try { l(); } catch { /* a listener must not break the log */ } });

/** Add the steps of one turn, or update them (a step reported as running is later reported as done: same id). */
export function logSteps(steps: ToolStep[], via: LogEntry['via'], question: string) {
  let changed = false;
  for (const s of steps) {
    const i = entries.findIndex(e => e.id === s.id);
    const next: LogEntry = { ...s, via, question: question.slice(0, 120) };
    if (i >= 0) { if (JSON.stringify(entries[i]) !== JSON.stringify(next)) { entries[i] = next; changed = true; } }
    else { entries.unshift(next); changed = true; }
  }
  if (entries.length > MAX_LOG) entries = entries.slice(0, MAX_LOG);
  if (changed) emit();
}
export const getLog = (): LogEntry[] => entries;
export function clearLog() { entries = []; emit(); }
export function subscribeLog(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
