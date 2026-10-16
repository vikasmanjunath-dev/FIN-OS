// The one onboarding action that talks to the phone's notification permission. Kept apart from onboardingStorage.ts so that file
// stays free of native modules (and testable in Node).
import { enableRemindersFlow, type ReminderPermissionOutcome } from '@/lib/permissions';
import { DEFAULT_PREFS } from '@/lib/reminders';
import { loadPrefs, savePrefs, syncReminders } from '@/lib/remindersStorage';
import { getPermission, requestPermission } from '@/lib/remindersNative';

/** Called only from a tap on "Turn on reminders" (after the explanation was on screen). */
export async function turnOnReminders(): Promise<ReminderPermissionOutcome> {
  return enableRemindersFlow({
    confirmed: true,
    current: getPermission,
    request: requestPermission,
    enable: async () => { await savePrefs({ ...(await loadPrefs().catch(() => ({ ...DEFAULT_PREFS }))), enabled: true }); await syncReminders().catch(() => {}); },
  });
}
