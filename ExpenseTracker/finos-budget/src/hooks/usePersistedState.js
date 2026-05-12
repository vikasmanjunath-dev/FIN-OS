import { useState, useEffect, useRef, useCallback } from "react";

/**
 * usePersistedState — Custom hook that syncs React state with localStorage.
 * Debounced writes prevent performance issues on rapid updates.
 *
 * @param {string} key — localStorage key
 * @param {*} defaultValue — fallback when no stored value exists
 * @param {number} debounceMs — write debounce delay (default 300ms)
 */
export default function usePersistedState(key, defaultValue, debounceMs = 300) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn(`[FIN-OS] Failed to read localStorage key "${key}":`, e);
    }
    return typeof defaultValue === "function" ? defaultValue() : defaultValue;
  });

  const timerRef = useRef(null);

  // Debounced write to localStorage
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch (e) {
        console.warn(`[FIN-OS] Failed to write localStorage key "${key}":`, e);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, state, debounceMs]);

  // Force-save immediately (for critical writes like exports)
  const forceSave = useCallback(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn(`[FIN-OS] Force save failed for key "${key}":`, e);
    }
  }, [key, state]);

  return [state, setState, forceSave];
}
