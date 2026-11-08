import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/i18nCore';
import type { Mood } from '@/lib/reels/types';
import { speakScene } from '@/lib/reels/speech';
import { hasClip, playClip } from '@/lib/reels/clipplayer';

/**
 * Speaks one scene and reports how far the voice has got. `key` changes with the scene; when it does, the old voice stops and the new one starts.
 * `progress` is 0 to 1 through the spoken text, and `busy` is true from the moment the scene starts to speak until it has finished, so the player can
 * hold the clock at the end of a scene until the sentence is done.
 */
export function useVoice(o: { key: string; text: string; big?: string; mood: Mood; lang: Lang; budgetMs: number; enabled: boolean; clip?: { reelId: string; scene: number } }): { progress: number; busy: boolean; overrunMs: number; replay: () => void } {
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [overrunMs, setOverrun] = useState(0);
  const last = useRef(0);
  const [again, setAgain] = useState(0);                                               // saying the line again: bump this and the effect speaks it afresh
  useEffect(() => {
    setProgress(0); setBusy(false); setOverrun(0); last.current = 0;
    if (!o.enabled) return;
    setBusy(true);
    const onProgress = (f: number) => { if (f - last.current >= 0.02 || f >= 1) { last.current = f; setProgress(f); } };
    // A scene with a recorded clip plays the recording (its length and phrases are known exactly); any other scene uses the phone's voice.
    const rec = o.clip && hasClip(o.clip.reelId, o.lang, o.clip.scene) ? playClip({ reelId: o.clip.reelId, lang: o.lang, scene: o.clip.scene, onProgress, onDone: () => setBusy(false) }) : null;
    if (rec) return () => { rec.cancel(); setBusy(false); };
    const v = speakScene({
      text: o.text, big: o.big, mood: o.mood, lang: o.lang, budgetMs: o.budgetMs,
      onProgress,
      onDone: () => setBusy(false),
    });
    setOverrun(v.overrunMs);
    return () => { v.cancel(); setBusy(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.key, o.enabled, again]);
  return { progress, busy: o.enabled && busy, overrunMs, replay: () => setAgain(n => n + 1) };
}
