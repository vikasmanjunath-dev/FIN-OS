// Salary inputs on the device, under the website's finos_salary_* keys so a tracker sync carries them both ways.
// Unlike the website, opening the screen never writes finos_monthly_income: that happens only when the person taps "use as income"
// (the website overwrites it with take-home on every render, which zeroes it when the form is still empty).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';
import { SALARY_KEYS, compute, money, type SalaryInputs, type SalaryRegime } from '@/lib/salary';

export type SalaryFields = Record<'ctc' | 'basic' | 'hraRcvd' | 'lta' | 'special' | 'npsEr' | 'rentPaid', string> & { isMetro: boolean; regime: SalaryRegime };

const NUM = ['ctc', 'basic', 'hraRcvd', 'lta', 'special', 'npsEr', 'rentPaid'] as const;

export async function loadSalaryFields(): Promise<SalaryFields> {
  const keys = [...NUM.map(k => SALARY_KEYS[k]), SALARY_KEYS.city, SALARY_KEYS.regime];
  const got = await getMany(keys);
  const out: any = {};
  NUM.forEach(k => { const v = money(got[SALARY_KEYS[k]]); out[k] = v > 0 ? String(v) : ''; });
  out.isMetro = got[SALARY_KEYS.city] !== 'non-metro';
  out.regime = got[SALARY_KEYS.regime] === 'old' ? 'old' : 'new';
  return out as SalaryFields;
}

export const toInputs = (f: SalaryFields): SalaryInputs => ({
  ctc: money(f.ctc), basic: money(f.basic), hraRcvd: money(f.hraRcvd), lta: money(f.lta), special: money(f.special),
  npsEr: money(f.npsEr), rentPaid: money(f.rentPaid), isMetro: f.isMetro, regime: f.regime,
});

export function saveSalaryField(k: (typeof NUM)[number], value: string): Promise<void> {
  return AsyncStorage.setItem(SALARY_KEYS[k], String(money(value)));
}
export const saveSalaryCity = (isMetro: boolean) => AsyncStorage.setItem(SALARY_KEYS.city, isMetro ? 'metro' : 'non-metro');
export const saveSalaryRegime = (r: SalaryRegime) => AsyncStorage.setItem(SALARY_KEYS.regime, r);

/** Write the figures other trackers read: employee PF and take-home. Called after an edit once there is a basic salary. */
export async function saveSalaryResults(f: SalaryFields): Promise<void> {
  const i = toInputs(f);
  if (!(i.basic > 0)) return;
  const c = compute(i);
  await AsyncStorage.multiSet([[SALARY_KEYS.pf, String(c.pfEmp)], [SALARY_KEYS.takeHome, String(c.takeHomeMo)]]);
}

/** The one place take-home becomes the income the Budget tracker uses. */
export function applyTakeHomeAsIncome(monthly: number): Promise<void> {
  return AsyncStorage.setItem('finos_monthly_income', String(Math.max(0, Math.round(monthly))));
}
