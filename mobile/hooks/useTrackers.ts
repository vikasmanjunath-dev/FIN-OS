import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { TrackerData, EMPTY_TRACKER_DATA, computeAll } from '@/lib/trackers';
import { loadTrackerData, saveTracker, persistDerived } from '@/lib/trackerStorage';
import { syncRecurring } from '@/lib/recurringStorage';

/** Tracker data + everything computed from it. Reloads whenever the screen regains focus. */
export function useTrackers() {
  const [data, setData] = useState<TrackerData>(EMPTY_TRACKER_DATA);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    await syncRecurring(); // so the Dashboard never shows a month missing its rent
    const d = await loadTrackerData();
    setData(d);
    setLoaded(true);
    persistDerived(d); // keeps finos_net_worth etc. fresh after Portfolio changes
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const save = useCallback(async (patch: Partial<TrackerData>) => {
    setData(prev => ({ ...prev, ...patch })); // optimistic: the UI never waits on storage
    setData(await saveTracker(patch));
  }, []);

  const computed = useMemo(() => computeAll(data), [data]);
  return { data, computed, loaded, save, reload };
}
