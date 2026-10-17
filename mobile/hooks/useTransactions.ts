import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { onTrackersPulled } from '@/lib/trackerSyncStore';
import { IndexedTxn } from '@/lib/budget';
import { loadTransactions, addTransaction, updateTransaction, removeTransaction, TxnInput } from '@/lib/txnStorage';
import { loadTrackerData, persistDerived } from '@/lib/trackerStorage';
import { syncRecurring } from '@/lib/recurringStorage';

/** Logged transactions, newest first. Mutations are serialised in txnStorage; derived keys (health score) refresh after each. */
export function useTransactions() {
  const [txns, setTxns] = useState<IndexedTxn[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      await syncRecurring(); // create any recurring entries that have come due
      const list = await loadTransactions();
      // newest day first; within a day, later-logged entries first
      list.sort((a, b) => (a.date === b.date ? b.i - a.i : a.date < b.date ? 1 : -1));
      setTxns(list);
      setLoaded(true);
    } catch {
      // Preserve the last loaded list; TrackerScreen displays the storage failure notice.
      setLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  useEffect(() => onTrackersPulled(() => { reload(); }), [reload]);

  const after = useCallback(async () => {
    await reload();
    persistDerived(await loadTrackerData());
  }, [reload]);

  const add = useCallback(async (e: TxnInput) => { const id = await addTransaction(e); await after(); return id; }, [after]);
  const update = useCallback(async (id: string, e: TxnInput) => { const ok = await updateTransaction(id, e); await after(); return ok; }, [after]);
  const remove = useCallback(async (id: string) => { const ok = await removeTransaction(id); await after(); return ok; }, [after]);

  return { txns, loaded, add, update, remove, reload };
}
