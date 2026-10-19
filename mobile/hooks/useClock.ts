import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** A clock in milliseconds for the characters on a screen. It ticks about 16 times a second while `on`, and stays still (a fixed moment) when the phone asks for reduced motion. */
export function useClock(on = true, still = 1200): number {
  const [t, setT] = useState(still);
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(v => { if (live) setCalm(!!v); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!on || calm) return;
    const start = Date.now() - still;
    const id = setInterval(() => setT(Date.now() - start), 60);
    return () => clearInterval(id);
  }, [on, calm, still]);
  return calm ? still : t;
}
