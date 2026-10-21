// The text of a shared lesson. Built from the library's own example reel, never from a personalised one, so it can never carry a figure
// the person entered. The person sees it in a preview and chooses where it goes (components/SharePreview.tsx).
import { LIBRARY } from '@/lib/reels/library';
import type { Lang } from '@/lib/i18nCore';

export function shareText(reelId: string, lang: Lang): string {
  const r = LIBRARY.find(x => x.id === reelId);
  if (!r) return '';
  const tail = lang === 'hi' ? '30 सेकंड के ऐसे पाठ: FIN·OS मनी रील्स। शिक्षा के लिए, सलाह नहीं।' : '30-second lessons like this: FIN·OS Money reels. For education, not advice.';
  return `🦉 ${r.title[lang]}\n\n${r.quiz.why[lang]}\n\n${tail}`;
}

export type ImageShare = 'shared' | 'saved' | 'unavailable';

/**
 * Captures the on-screen lesson card (components/reels/ShareCard.tsx) as a 1080 x 1350 PNG and hands it to the phone's share sheet, then
 * deletes the temporary file. The card holds only the library's example text, so the picture carries nothing personal. Resolves
 * 'unavailable' when this device cannot share a picture (no view-shot, no share sheet), and the caller then offers the text instead.
 * On the web it saves the PNG to downloads, because browsers have no share sheet for files. The native modules are required inside the
 * function so the tests (which run in Node) can import this file.
 */
export async function shareCardImage(view: unknown, title: string, deps?: { platform?: string }): Promise<ImageShare> {
  const platform = deps?.platform ?? require('react-native').Platform.OS;
  const { captureRef } = require('react-native-view-shot');
  const size = { width: 1080, height: 1350 };
  if (platform === 'web') {
    const uri: string = await captureRef(view, { format: 'png', quality: 1, result: 'data-uri', ...size });
    const a = document.createElement('a');
    a.href = uri; a.download = 'finos-money-reel.png'; a.click();
    return 'saved';
  }
  const Sharing = require('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const { deleteTempFile } = require('@/lib/tempFiles');
  const uri: string = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile', fileName: `finos-reel-card-${Date.now()}`, ...size });
  try {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: title });
    return 'shared';
  } finally {
    // iOS resolves when the sheet closes, so the file goes now. On Android the chosen app may still be reading it, so it goes two minutes later.
    if (platform === 'ios') await deleteTempFile(uri);
    else setTimeout(() => { deleteTempFile(uri); }, 120_000);
  }
}
