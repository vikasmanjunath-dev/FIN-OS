// The part of the reel reminders that talks to the operating system's notification scheduler. Local notifications only; nothing leaves the
// phone. Ids start with `finosreel-`, so the calendar reminders (`finos-`, lib/remindersNative.ts) and these never cancel each other.
import { Platform } from 'react-native';
import { ID_PREFIX, type PlannedNotice } from '@/lib/reels/reminders';

const CHANNEL = 'reminders';

// Loaded on demand: the web preview and the unit tests never touch the native module.
function mod(): typeof import('expo-notifications') | null {
  if (Platform.OS === 'web') return null;
  try { return require('expo-notifications'); } catch { return null; }
}

/** Removes every reel reminder this app scheduled (and only those). */
export async function cancelReelNotices(): Promise<void> {
  const N = mod();
  if (!N) return;
  try {
    const all = await N.getAllScheduledNotificationsAsync();
    await Promise.all(all.filter(n => String(n.identifier).startsWith(ID_PREFIX)).map(n => N.cancelScheduledNotificationAsync(n.identifier)));
  } catch { /* nothing scheduled or module unavailable */ }
}

/** Replaces the reel reminders with `list`. Returns how many were scheduled. */
export async function scheduleReelNotices(list: PlannedNotice[]): Promise<number> {
  const N = mod();
  if (!N) return 0;
  try {
    await cancelReelNotices();
    let n = 0;
    for (const r of list) {
      if (r.at.getTime() <= Date.now()) continue;
      await N.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, data: { route: r.route, ...(r.kind ? { kind: r.kind } : {}) } },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL },
      });
      n++;
    }
    return n;
  } catch { return 0; }
}
