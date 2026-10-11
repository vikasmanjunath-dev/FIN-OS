import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { loadSavedScore, loadScoreHistory, type SavedScore, type HistoryPoint } from '@/lib/moneyScoreStorage';
import { trend } from '@/lib/moneyScore';

/** The last saved Money Score (or null) and how it moved since the previous day it was worked out. */
export function useMoneyScore() {
  const [saved, setSaved] = useState<SavedScore | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [s, h] = await Promise.all([loadSavedScore(), loadScoreHistory()]);
    setSaved(s && typeof s.score === 'number' ? s : null);
    setHistory(Array.isArray(h) ? h : []);
    setLoaded(true);
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return { saved, history, trend: trend(history) as { delta: number; since: string } | null, loaded, reload };
}
