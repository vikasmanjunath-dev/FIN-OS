// A counter that goes up each time the person erases everything. The root layout uses it as the key of the navigator, so every
// screen is rebuilt from empty storage and none keeps showing (or writing back) what was just deleted.
import { useSyncExternalStore } from 'react';

let epoch = 0;
const listeners = new Set<() => void>();
export const getEraseEpoch = () => epoch;
export const bumpEraseEpoch = () => { epoch++; listeners.forEach(l => l()); };
export const useEraseEpoch = () => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getEraseEpoch, getEraseEpoch);
