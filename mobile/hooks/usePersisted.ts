import { useEffect, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseJSON, keepIfUnreadable } from '@/lib/safeStore';

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
          const p = parseJSON(raw);
          const saved = p.ok ? p.value : null;
          if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
            // Only fields the screen knows, and only where the saved value has the type the default has (a number typed into a text
            // field, an object where a string belongs, is ignored): a damaged save can never put a wrong type in front of a screen.
            const merged: Record<string, unknown> = { ...initial };
            for (const k of Object.keys(initial)) {
              if (k === '__proto__') continue;
              const v = (saved as Record<string, unknown>)[k];
              const d = (initial as Record<string, unknown>)[k];
              if (v === undefined || v === null) continue;
              if (typeof d === 'string' && typeof v === 'number' && Number.isFinite(v)) { merged[k] = String(v); continue; }   // a number saved where text belongs
              if (typeof v === typeof d && !Array.isArray(v) === !Array.isArray(d) && !(typeof v === 'number' && !Number.isFinite(v)) && !(typeof v === 'string' && v.length > 2000)) merged[k] = v;
            }
            latest.current = merged as T;
            setValueRaw(latest.current);
          } else if (!p.ok) {
            keepIfUnreadable(key, 'object');           // an unreadable save is kept aside before the next edit replaces it
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
