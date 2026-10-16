import { useCallback, useEffect, useRef, useState } from 'react';
import type { Loaded } from '@/lib/marketDataStorage';

export interface Resource<T> {
  data: T | null;
  savedAt: number | null;
  fromCache: boolean;
  error: string | null;
  /** true until the first answer (fresh or saved) arrives */
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
}

/** Runs a "load with last-good cache" function on mount and on demand. Never leaves `loading` true after an answer or a failure. */
export function useMarketResource<T>(load: () => Promise<Loaded<T>>, deps: unknown[] = [], refreshMs = 0): Resource<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, savedAt: null, fromCache: false, error: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const seq = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  const run = useCallback(async (isRefresh: boolean) => {
    const n = ++seq.current;
    if (isRefresh) setRefreshing(true);
    try {
      const r = await loader.current();
      if (alive.current && n === seq.current) setState(r);
    } catch (e) {
      if (alive.current && n === seq.current) setState(s => ({ ...s, error: e instanceof Error ? e.message : 'Could not load.' }));
    } finally {
      if (alive.current && n === seq.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    run(false);
    const id = refreshMs > 0 ? setInterval(() => run(true), refreshMs) : null;
    return () => { alive.current = false; if (id) clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => run(true), [run]);
  return { ...state, loading, refreshing, reload };
}
