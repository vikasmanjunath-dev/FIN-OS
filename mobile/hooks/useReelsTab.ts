import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { loadDays } from '@/lib/reelsStorage';
import { loadReelsProfile } from '@/lib/reelsProfileStorage';
import { dayKey } from '@/lib/reels/journey';
import { reelsTabState, type TabState } from '@/lib/reels/streak';
import { useLang } from '@/lib/i18n';

/** The Reels tab's badge. Re-read whenever the person moves between screens (so finishing a reel updates it as they come back) and when the
 *  app returns to the foreground. Reads the list of days and the pledge count (said only in the accessibility label), so it is cheap. */
export function useReelsTab(): TabState {
  const pathname = usePathname();
  const lang = useLang();                                      // the tab's accessibility label follows the app language
  const [state, setState] = useState<TabState>(() => reelsTabState([], dayKey(new Date()), 0, lang));
  const refresh = useCallback(() => {
    Promise.all([loadDays(), loadReelsProfile()]).then(([d, p]) => setState(reelsTabState(d, dayKey(new Date()), p.pledges?.length ?? 0, lang))).catch(() => {});
  }, [lang]);
  useEffect(() => { refresh(); }, [pathname, refresh]);
  useEffect(() => { const sub = AppState.addEventListener('change', st => { if (st === 'active') refresh(); }); return () => sub.remove(); }, [refresh]);
  return state;
}
