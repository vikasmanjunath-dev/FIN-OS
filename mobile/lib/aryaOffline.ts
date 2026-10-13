// What Arya says when the server cannot be reached, and which parts of the app still work without it.
// Everything below runs on the phone, so the reply points to those instead of leaving a dead end.
export interface OfflineAction { label: string; route: string }

export const OFFLINE_ACTIONS: OfflineAction[] = [
  { label: 'Money Score', route: '/tools/score' },
  { label: 'Calculators', route: '/tools/calculators' },
  { label: 'Financial calendar', route: '/tools/calendar' },
  { label: 'Financial report', route: '/tools/report' },
];

export type Reason = 'unreachable' | 'timeout';

export function offlineReply(reason: Reason = 'unreachable', dev = false): string {
  const head = reason === 'timeout' ? 'Arya is taking too long to answer.' : 'I cannot reach Arya right now, so I cannot answer that here.';
  const lines = [
    head,
    '',
    'Your own numbers do not need me. These still work with no connection:',
    ...OFFLINE_ACTIONS.map(a => `- ${a.label}`),
    '',
    'Try again when you are back online.',
  ];
  if (dev) lines.push('', 'Developer note: start the arya-ai server (port 7475) or set its address in Settings.');
  return lines.join('\n');
}
