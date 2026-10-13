// Reminder preferences on the device and the one function that brings the OS schedule in line with the data.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadCalendarSources } from '@/lib/calendarStorage';
import { collectEvents } from '@/lib/calendar';
import { DEFAULT_PREFS, normalisePrefs, plan, type ReminderPrefs } from '@/lib/reminders';
import { cancelAll, getPermission, schedule } from '@/lib/remindersNative';

export const PREFS_KEY = 'finos_reminders_mobile';

export async function loadPrefs(): Promise<ReminderPrefs> {
  try { return normalisePrefs(JSON.parse((await AsyncStorage.getItem(PREFS_KEY)) ?? 'null')); } catch { return { ...DEFAULT_PREFS }; }
}
export async function savePrefs(p: ReminderPrefs): Promise<void> { await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p)); }

/** Re-plans from today's data. Cheap; called at start, when the app returns to the foreground and after a preference changes. */
export async function syncReminders(now: Date = new Date()): Promise<{ scheduled: number; reason?: string }> {
  const prefs = await loadPrefs();
  if (!prefs.enabled) { await cancelAll(); return { scheduled: 0, reason: 'off' }; }
  if ((await getPermission()) !== 'granted') return { scheduled: 0, reason: 'no-permission' };
  const { sources } = await loadCalendarSources();
  const events = collectEvents(sources, now, 3);
  return { scheduled: await schedule(plan(events, now, prefs)) };
}
