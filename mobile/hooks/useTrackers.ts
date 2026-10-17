import { useState, useCallback, useMemo, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { onTrackersPulled } from '@/lib/trackerSyncStore';
import { TrackerData, EMPTY_TRACKER_DATA, computeAll } from '@/lib/trackers';
import { loadTrackerData, saveTracker, persistDerived } from '@/lib/trackerStorage';
import { getTrackerStorageStatus, reportTrackerSaveFailure } from '@/lib/trackerStorageStatus';
import { syncRecurring } from '@/lib/recurringStorage';

/** Tracker data + everything computed from it. Reloads whenever the screen regains focus. */
export function useTrackers() {
  const [data, setData] = useState<TrackerData>(EMPTY_TRACKER_DATA);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      await syncRecurring(); // so the Dashboard never shows a month missing its rent
      const d = await loadTrackerData();
      if (getTrackerStorageStatus()?.kind === 'load') { setLoaded(true); return; }
      setData(d);
      setLoaded(true);
      void persistDerived(d); // keeps finos_net_worth etc. fresh after Portfolio changes
    } catch {
      // Keep the last known data and let the shared screen notice show the failure.
      setLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  useEffect(() => onTrackersPulled(() => { reload(); }), [reload]);

  const save = useCallback(async (patch: Partial<TrackerData>) => {
    try {
      const next = await saveTracker(patch);
      setData(next);
      return true;
    } catch {
      reportTrackerSaveFailure('Could not save that tracker change. Your last saved values are still in place; try again.');
      return false;
    }
  }, []);

  const computed = useMemo(() => computeAll(data), [data]);
  return { data, computed, loaded, save, reload };
}
