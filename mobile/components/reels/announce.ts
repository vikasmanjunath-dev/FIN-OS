import { AccessibilityInfo, Platform } from 'react-native';

/** Says a short message once to a screen reader on iPhone, where `accessibilityLiveRegion` does nothing. On Android and the web the same words sit in
 *  one live-region text (see the toast, the verdict and the confirmations in ReelPlayer), so this does nothing there: announcing in both would read it twice. */
export function announce(text: string): void {
  if (Platform.OS !== 'ios' || !text) return;
  try { AccessibilityInfo.announceForAccessibility(text); } catch { /* a missed announcement is only a missed announcement */ }
}
