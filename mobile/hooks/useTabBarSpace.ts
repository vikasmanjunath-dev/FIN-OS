import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const TAB_BAR = 64;

/** Height of the floating tab bar (icon row + home indicator). Tab screens pad their scroll content by this much, because the bar sits
 *  on top of them (translucent, so the content shows through) instead of beside them. */
export function useTabBarSpace(): number {
  return TAB_BAR + Math.max(useSafeAreaInsets().bottom, 8);
}
