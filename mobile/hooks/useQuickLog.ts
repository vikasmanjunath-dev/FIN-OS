import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { buildQuickChips, QuickChip } from '@/lib/quicklog';
import { ymd } from '@/lib/budget';
import { inr } from '@/components/TrackerUI';

export interface UndoNotice { id: string; text: string }

/** One-tap re-logging of your usual entries, with a short Undo window. */
export function useQuickLog(limit = 6) {
  const { txns, add, remove, loaded } = useTransactions();
  const chips = useMemo(() => buildQuickChips(txns, limit), [txns, limit]);
  const [undo, setUndo] = useState<UndoNotice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const log = useCallback(async (c: QuickChip) => {
    if (busy.current) return; // ignore a double-tap while the first is still saving
    busy.current = true;
    try {
      const id = await add({ date: ymd(new Date()), amount: c.amount, kind: c.kind, category: c.category, label: c.label });
      const what = c.label || c.category;
      setUndo({ id, text: `${c.kind === 'income' ? 'Income' : c.kind === 'saving' ? 'Invested' : 'Added'} ${inr(c.amount)} · ${what}` });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setUndo(null), 6000);
    } finally {
      busy.current = false;
    }
  }, [add]);

  const undoLast = useCallback(async () => {
    if (!undo) return;
    const { id } = undo;
    setUndo(null);
    if (timer.current) clearTimeout(timer.current);
    await remove(id);
  }, [undo, remove]);

  return { chips, loaded, log, undo, undoLast };
}
