export type TrackerStorageIssue = { kind: 'load' | 'save' | 'derived'; message: string };

export const canRenderLoadedTrackerData = (status: TrackerStorageIssue | null) => status?.kind !== 'load';

let issue: TrackerStorageIssue | null = null;
const listeners = new Set<(next: TrackerStorageIssue | null) => void>();

export function getTrackerStorageStatus() { return issue; }

export function setTrackerStorageStatus(next: TrackerStorageIssue | null) {
  issue = next;
  listeners.forEach(listener => listener(issue));
}

/** A later save attempt must not downgrade a failed-load state to a recoverable save warning. */
export function reportTrackerSaveFailure(message: string) {
  if (issue?.kind === 'load') return;
  setTrackerStorageStatus({ kind: 'save', message });
}

export function clearTrackerStorageStatus() { setTrackerStorageStatus(null); }

export function subscribeTrackerStorageStatus(listener: (next: TrackerStorageIssue | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
