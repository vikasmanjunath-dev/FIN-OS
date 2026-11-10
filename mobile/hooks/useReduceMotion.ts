import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let reduceMotion = false, reduceTransparency = false, started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled?.().then(v => { reduceMotion = !!v; emit(); }).catch(() => {});
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', v => { reduceMotion = !!v; emit(); });
  AccessibilityInfo.isReduceTransparencyEnabled?.().then(v => { reduceTransparency = !!v; emit(); }).catch(() => {});
  AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', v => { reduceTransparency = !!v; emit(); });
}

function useFlag(read: () => boolean) {
  const [v, setV] = useState(read);
  useEffect(() => { start(); const l = () => setV(read()); listeners.add(l); l(); return () => { listeners.delete(l); }; }, [read]);
  return v;
}
const readMotion = () => reduceMotion, readTransparency = () => reduceTransparency;

/** True when the person asked the phone for reduced motion: movement becomes a plain fade. */
export const useReduceMotion = () => useFlag(readMotion);
/** True when the person asked for reduced transparency: blurred materials become solid. */
export const useReduceTransparency = () => useFlag(readTransparency);
