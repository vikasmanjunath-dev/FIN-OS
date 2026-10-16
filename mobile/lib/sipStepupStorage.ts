// SIP step-up inputs and results on the device, under the website's keys (finos_ss_* inputs; the three result keys other pages read).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';
import type { StepupResult } from '@/lib/sipStepup';

export const SS_KEYS = { baseSIP: 'finos_ss_base', stepUpPct: 'finos_ss_stepup', years: 'finos_ss_years', returnPct: 'finos_ss_return' } as const;
export type StepupFields = Record<keyof typeof SS_KEYS, string>;

export async function loadStepupFields(): Promise<StepupFields> {
  const got = await getMany(Object.values(SS_KEYS));
  const clean = (raw: string | null | undefined) => { const n = parseFloat(raw ?? ''); return Number.isFinite(n) ? String(n) : ''; };
  return { baseSIP: clean(got[SS_KEYS.baseSIP]), stepUpPct: clean(got[SS_KEYS.stepUpPct]), years: clean(got[SS_KEYS.years]), returnPct: clean(got[SS_KEYS.returnPct]) };
}
export const saveStepupField = (k: keyof StepupFields, v: string) => AsyncStorage.setItem(SS_KEYS[k], String(parseFloat(v) || 0));

export function saveStepupResults(r: StepupResult): Promise<void> {
  return AsyncStorage.multiSet([
    ['finos_sip_stepup_corpus', String(r.finalStep)], ['finos_sip_flat_corpus', String(r.finalFlat)], ['finos_sip_stepup_gain', String(r.advantage)],
  ]);
}
