import { useCallback, useState } from 'react';
import { ACT_ALL } from '@/lib/reels/library';
import { toLocalIso, whenOptions, type WhenOption } from '@/lib/reels/reminders';
import { addMoveReminder, syncReelReminders } from '@/lib/reelRemindersStorage';
import { getPermission, requestPermission } from '@/lib/remindersNative';
import type { WhenStatus } from '@/components/reels/ReminderSheets';
import type { Lang } from '@/lib/i18nCore';

/** "When will you do it?" for a reel's tool: opens the sheet, asks the phone once for permission, keeps one reminder at the chosen moment, and
 *  starts watching the figure for a receipt (`onStarted`). Shared by the reels feed and My moves. */
export function useMoveReminder(lang: Lang, onStarted: (reelId: string) => void) {
  const [when, setWhen] = useState<null | { reelId: string; status: WhenStatus }>(null);
  const open = useCallback((reelId: string) => setWhen({ reelId, status: null }), []);
  const close = useCallback(() => setWhen(null), []);
  const pick = useCallback(async (o: WhenOption) => {
    if (!when) return;
    const a = ACT_ALL[when.reelId];
    if (!a) return;
    let perm = await getPermission();
    if (perm === 'undetermined') perm = await requestPermission();
    if (perm !== 'granted') { setWhen({ reelId: when.reelId, status: perm === 'unsupported' ? 'unsupported' : 'denied' }); return; }
    await addMoveReminder({ reelId: when.reelId, at: toLocalIso(o.at), href: a.href, label: a.label });
    onStarted(when.reelId);
    await syncReelReminders().catch(() => {});
    setWhen({ reelId: when.reelId, status: { done: o.label[lang] } });
  }, [when, lang, onStarted]);
  const options = whenOptions(new Date());
  return { open, close, pick, visible: when !== null, status: when?.status ?? null, options };
}
