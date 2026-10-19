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
