import { useEffect, useState } from 'react';
import { getTrackerSyncState, subscribeTrackerSync, syncTrackersNow, TrackerSyncState } from '@/lib/trackerSyncStore';

export function useTrackerSync(): TrackerSyncState & { syncNow: () => Promise<void> } {
  const [s, setS] = useState<TrackerSyncState>(getTrackerSyncState());
  useEffect(() => subscribeTrackerSync(() => setS(getTrackerSyncState())), []);
  return { ...s, syncNow: () => syncTrackersNow({ force: true }) };
}
