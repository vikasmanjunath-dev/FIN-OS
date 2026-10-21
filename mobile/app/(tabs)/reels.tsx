import { Redirect } from 'expo-router';

/** The Reels tab never shows a screen of its own: pressing it opens the full-screen feed (see the tab bar in _layout.tsx). This is only here so
 *  the tab exists, and for a link that lands on it directly. */
export default function ReelsTab() {
  return <Redirect href={'/learn/reels' as never} />;
}
