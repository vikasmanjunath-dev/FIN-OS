import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { loadDays } from '@/lib/reelsStorage';
import { dayKey } from '@/lib/reels/journey';
import { reelsTabState, type TabState } from '@/lib/reels/streak';

/** The Reels tab's badge. Re-read whenever the person moves between screens (so finishing a reel updates it as they come back) and when the
 *  app returns to the foreground. Reads only the list of days, so it is cheap. */
export function useReelsTab(): TabState {
  const pathname = usePathname();
  const [state, setState] = useState<TabState>(() => reelsTabState([], dayKey(new Date())));
  const refresh = useCallback(() => { loadDays().then(d => setState(reelsTabState(d, dayKey(new Date())))).catch(() => {}); }, []);
  useEffect(() => { refresh(); }, [pathname, refresh]);
  useEffect(() => { const sub = AppState.addEventListener('change', st => { if (st === 'active') refresh(); }); return () => sub.remove(); }, [refresh]);
  return state;
}
