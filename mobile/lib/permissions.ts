// The words shown BEFORE the phone's own permission prompt, and the rule that a prompt only follows a tap on the thing it is for.
// Pure: strings and decisions only. (The calls themselves are in lib/remindersNative.ts and lib/appLockStorage.ts.)

export interface PermissionCopy { title: string; why: string; whatHappens: string; ifNo: string; ask: string; notNow: string }

export const NOTIFICATIONS_COPY: PermissionCopy = {
  title: 'Reminders on this phone',
  why: 'FIN·OS can remind you before a SIP debit, a deposit maturing, an insurance renewal or a tax deadline.',
  whatHappens: 'Your phone will ask whether FIN·OS may send notifications. The reminders are scheduled on this phone only: no account, no server, and nothing is sent anywhere.',
  ifNo: 'If you say no, everything else works the same. You can change your mind later in Settings or in your phone\'s settings.',
  ask: 'Turn on reminders',
  notNow: 'Not now',
};

export const BIOMETRIC_COPY: PermissionCopy = {
  title: 'Unlock with fingerprint or face',
  why: 'Your PIN always works. You can also let your phone\'s fingerprint or face check open the app.',
  whatHappens: 'Your phone will ask you to confirm once, so we know it works. FIN·OS never sees your fingerprint or face: the phone only tells the app yes or no.',
  ifNo: 'If you say no, you keep using the PIN.',
  ask: 'Use fingerprint or face',
  notNow: 'Not now',
};

/** Every sentence a person sees about a permission must say where it stays and what happens on "no". */
export function copyIsComplete(c: PermissionCopy): boolean {
  return [c.title, c.why, c.whatHappens, c.ifNo, c.ask, c.notNow].every(s => s.trim().length > 3) && /\bphone\b/i.test(c.whatHappens) && /\b(no|not)\b/i.test(c.ifNo);
}

export type ReminderPermissionOutcome = 'enabled' | 'denied' | 'unsupported' | 'cancelled';

/**
 * Turning reminders on. The OS prompt is requested only after the person confirmed (`confirmed === true`), never otherwise,
 * and the reminder preference is written only when permission was actually granted.
 */
export async function enableRemindersFlow(deps: {
  confirmed: boolean;
  current: () => Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'>;
  request: () => Promise<'granted' | 'denied' | 'undetermined' | 'unsupported'>;
  enable: () => Promise<void>;
}): Promise<ReminderPermissionOutcome> {
  if (!deps.confirmed) return 'cancelled';
  let p = await deps.current();
  if (p !== 'granted') p = await deps.request();
  if (p === 'granted') { await deps.enable(); return 'enabled'; }
  return p === 'unsupported' ? 'unsupported' : 'denied';
}
