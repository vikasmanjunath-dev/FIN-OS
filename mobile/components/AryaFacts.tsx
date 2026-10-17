import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { loadArFacts } from '@/lib/aryaFactsStorage';
import type { ArFacts } from '@/lib/aryaFacts';

/** Loads what the phone knows about the person each time the screen is shown. `failed` is true when storage could not be read. */
export function useAryaFacts() {
  const [facts, setFacts] = useState<ArFacts | null>(null);
  const [failed, setFailed] = useState(false);
  useFocusEffect(useCallback(() => {
    let alive = true;
    loadArFacts(new Date()).then(f => { if (alive) { setFacts(f); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []));
  return { facts, failed };
}
