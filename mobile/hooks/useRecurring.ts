import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Recurring } from '@/lib/recurring';
import { loadRecurring, addRecurring, updateRecurring, removeRecurring, syncRecurring, RecurringInput } from '@/lib/recurringStorage';
import { loadTrackerData, persistDerived } from '@/lib/trackerStorage';

export function useRecurring() {
  const [items, setItems] = useState<Recurring[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    setItems(await loadRecurring());
    setLoaded(true);
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  // After any change, run the schedule (a new item may be due today) and refresh derived scores.
  const after = useCallback(async () => {
    const created = await syncRecurring();
    await reload();
    if (created) persistDerived(await loadTrackerData());
  }, [reload]);

  const add = useCallback(async (i: RecurringInput) => { const id = await addRecurring(i); await after(); return id; }, [after]);
  const update = useCallback(async (id: string, p: Partial<Omit<Recurring, 'id'>>) => { const ok = await updateRecurring(id, p); await after(); return ok; }, [after]);
  const remove = useCallback(async (id: string) => { const ok = await removeRecurring(id); await after(); return ok; }, [after]);
  return { items, loaded, add, update, remove, reload };
}
