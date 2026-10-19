// Tapping a reminder opens the screen it is about. Every notice this app schedules (the calendar reminders in lib/remindersNative.ts and the reel
// reminders in lib/reels/reminders-native.ts) carries `data.route`. This file turns a tap into a navigation, and only ever to a plain in-app
// path: anything else in a notice (a link, a scheme, odd characters) is ignored, so a notice can open a screen of this app and nothing more.
import { Platform } from 'react-native';

/** A path inside the app: slash-separated words, no scheme, no host, no dots, no query. Matches the routes the planners accept. */
export const ROUTE = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+){0,6}$/;

/** What expo-notifications calls a plain tap on the notice (as opposed to dismissing it or pressing an action button). */
export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

export interface TapResponse {
  actionIdentifier?: unknown;
  notification?: { date?: unknown; request?: { identifier?: unknown; content?: { data?: unknown } } };
}

/** The route a tap should open, or null when it was not a plain tap or the notice carries no safe route. */
export function routeOf(r: TapResponse | null | undefined): string | null {
  if (!r || typeof r !== 'object') return null;
  if (r.actionIdentifier !== undefined && r.actionIdentifier !== DEFAULT_ACTION) return null;
  const data = r.notification?.request?.content?.data;
  if (!data || typeof data !== 'object') return null;
  const route = (data as Record<string, unknown>).route;
  return typeof route === 'string' && route.length <= 120 && ROUTE.test(route) ? route : null;
}

/** The slice of expo-notifications this uses, so it can be driven by a fake in tests. */
export interface NotificationsLike {
  addNotificationResponseReceivedListener: (fn: (r: TapResponse) => void) => { remove: () => void };
  getLastNotificationResponse?: () => TapResponse | null;
  getLastNotificationResponseAsync?: () => Promise<TapResponse | null>;
  clearLastNotificationResponse?: () => void;
}

const keyOf = (r: TapResponse) => `${String(r.notification?.request?.identifier ?? '')}|${String(r.notification?.date ?? '')}`;

/**
 * Listens for taps while the app runs and also handles the tap that launched it. Each notice is handled once, however many times the OS
 * reports it. Returns a function that stops listening.
 */
export function attachTaps(N: NotificationsLike, go: (route: string) => void): () => void {
  const handled = new Set<string>();
  const handle = (r: TapResponse | null | undefined) => {
    const route = routeOf(r);
    if (!route || !r) return;
    const k = keyOf(r);
    if (handled.has(k)) return;
    handled.add(k);
    try { go(route); } catch { /* the screen could not open; a missed tap is not worth a crash */ }
  };
  let sub: { remove: () => void } | null = null;
  try { sub = N.addNotificationResponseReceivedListener(handle); } catch { sub = null; }
  // The tap that launched the app arrived before anything was listening.
  try {
    if (N.getLastNotificationResponse) { handle(N.getLastNotificationResponse()); N.clearLastNotificationResponse?.(); }
    else if (N.getLastNotificationResponseAsync) N.getLastNotificationResponseAsync().then(r => { handle(r); N.clearLastNotificationResponse?.(); }).catch(() => {});
  } catch { /* no launch tap to read */ }
  return () => { try { sub?.remove(); } catch { /* already removed */ } };
}

/** Starts listening on a phone; on the web preview and in tests there is no native module and this does nothing. */
export function startNotificationTaps(go: (route: string) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  try { return attachTaps(require('expo-notifications') as NotificationsLike, go); } catch { return () => {}; }
}
