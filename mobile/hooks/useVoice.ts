import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/i18nCore';
import type { Mood } from '@/lib/reels/types';
import { speakScene } from '@/lib/reels/speech';

/**
 * Speaks one scene and reports how far the voice has got. `key` changes with the scene; when it does, the old voice stops and the new one starts.
 * `progress` is 0 to 1 through the spoken text, and `busy` is true from the moment the scene starts to speak until it has finished, so the player can
 * hold the clock at the end of a scene until the sentence is done.
 */
export function useVoice(o: { key: string; text: string; big?: string; mood: Mood; lang: Lang; budgetMs: number; enabled: boolean }): { progress: number; busy: boolean; overrunMs: number; replay: () => void } {
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [overrunMs, setOverrun] = useState(0);
  const last = useRef(0);
  const [again, setAgain] = useState(0);                                               // saying the line again: bump this and the effect speaks it afresh
  useEffect(() => {
    setProgress(0); setBusy(false); setOverrun(0); last.current = 0;
    if (!o.enabled) return;
    setBusy(true);
    const v = speakScene({
      text: o.text, big: o.big, mood: o.mood, lang: o.lang, budgetMs: o.budgetMs,
      onProgress: f => { if (f - last.current >= 0.02 || f >= 1) { last.current = f; setProgress(f); } },
      onDone: () => setBusy(false),
    });
    setOverrun(v.overrunMs);
    return () => { v.cancel(); setBusy(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.key, o.enabled, again]);
  return { progress, busy: o.enabled && busy, overrunMs, replay: () => setAgain(n => n + 1) };
}
