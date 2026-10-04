import { useEffect, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** useState that remembers its value in AsyncStorage (mobile-only keys). Values are merged over the default so new fields never break old saves. */
export function usePersisted<T extends Record<string, any>>(key: string, initial: T) {
  const [value, setValueRaw] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw && alive) {
          const saved = JSON.parse(raw);
          if (saved && typeof saved === 'object') {
            latest.current = Array.isArray(initial) ? (saved as T) : ({ ...initial, ...saved } as T);
            setValueRaw(latest.current);
          }
        }
      } catch { /* keep defaults */ }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    const v = typeof next === 'function' ? (next as (p: T) => T)(latest.current) : next;
    latest.current = v;
    setValueRaw(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { AsyncStorage.setItem(key, JSON.stringify(latest.current)).catch(() => {}); }, 400);
  }, [key]);

  const reset = useCallback(() => { setValue(initial); }, [setValue, initial]);
  return { value, setValue, reset, loaded };
}
