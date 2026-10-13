// The only file that talks to the operating system's notification scheduler. Everything it schedules comes from
// lib/reminders.ts. Local notifications only: no push token is requested and nothing leaves the device.
import { Platform } from 'react-native';
import { fireDate, type PlannedReminder } from '@/lib/reminders';

export type Permission = 'granted' | 'denied' | 'undetermined' | 'unsupported';
const PREFIX = 'finos-';
const CHANNEL = 'reminders';

// Loaded on demand: the web preview and the unit tests never touch the native module.
function mod(): typeof import('expo-notifications') | null {
  if (Platform.OS === 'web') return null;
  try { return require('expo-notifications'); } catch { return null; }
}

let handlerSet = false;
function prepare(N: typeof import('expo-notifications')) {
  if (!handlerSet) {
    N.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
    handlerSet = true;
  }
}

export async function getPermission(): Promise<Permission> {
  const N = mod();
  if (!N) return 'unsupported';
  try {
    const p = await N.getPermissionsAsync();
    return p.granted ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined';
  } catch { return 'unsupported'; }
}

/** Asks the OS once. On Android 13+ and iOS this shows the system prompt; if it was refused before, the OS will not ask again. */
export async function requestPermission(): Promise<Permission> {
  const N = mod();
  if (!N) return 'unsupported';
  try {
    prepare(N);
    if (Platform.OS === 'android') await N.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: N.AndroidImportance.DEFAULT });
    const p = await N.requestPermissionsAsync();
    return p.granted ? 'granted' : 'denied';
  } catch { return 'unsupported'; }
}

/** Removes every reminder this app scheduled (and only those). */
export async function cancelAll(): Promise<void> {
  const N = mod();
  if (!N) return;
  try {
    const all = await N.getAllScheduledNotificationsAsync();
    await Promise.all(all.filter(n => String(n.identifier).startsWith(PREFIX)).map(n => N.cancelScheduledNotificationAsync(n.identifier)));
  } catch { /* nothing scheduled or module unavailable */ }
}

/** Replaces what is scheduled with `list`. Returns how many were scheduled. */
export async function schedule(list: PlannedReminder[]): Promise<number> {
  const N = mod();
  if (!N) return 0;
  try {
    prepare(N);
    await cancelAll();
    let n = 0;
    for (const r of list) {
      const date = fireDate(r);
      if (date.getTime() <= Date.now()) continue;
      await N.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, data: { route: '/tools/calendar', date: r.date } },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL },
      });
      n++;
    }
    return n;
  } catch { return 0; }
}
