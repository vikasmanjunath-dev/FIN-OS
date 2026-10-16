// ITR prep figures on the device. They live under the website's own keys, so a tracker sync carries them both ways and the website's
// ITR page reads what was typed here. Suggestions from other trackers are offered, never written without a tap.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMany } from '@/lib/safeStore';

export interface ItrField { key: string; label: string; group: string; sub?: string }
export const ITR_GROUPS = ['Salary', 'Other income', 'Section 80C', 'Other deductions', 'Tax already paid (TDS)'] as const;
export const ITR_FIELDS: ItrField[] = [
  { key: 'finos_salary_basic', label: 'Basic salary (a year)', group: 'Salary' },
  { key: 'finos_salary_hra_received', label: 'HRA received (a year)', group: 'Salary' },
  { key: 'finos_salary_lta', label: 'LTA (a year)', group: 'Salary' },
  { key: 'finos_salary_special', label: 'Special allowance and other pay (a year)', group: 'Salary', sub: 'Everything taxable that is not basic, HRA or LTA, including bonuses.' },
  { key: 'finos_rent_paid', label: 'Rent paid (a year)', group: 'Salary', sub: 'Needed for the HRA exemption.' },
  { key: 'finos_hra_received', label: 'HRA received, for the exemption (a year)', group: 'Salary' },
  { key: 'finos_passive_rental_annual', label: 'Rent received from property (a year)', group: 'Other income', sub: '30% standard deduction is applied.' },
  { key: 'finos_fd_interest_annual', label: 'FD / deposit interest (a year)', group: 'Other income' },
  { key: 'finos_savings_interest_annual', label: 'Savings-account interest (a year)', group: 'Other income', sub: 'Up to ₹10,000 is deductible (80TTA, old regime).' },
  { key: 'finos_passive_dividend_annual', label: 'Dividends (a year)', group: 'Other income' },
  { key: 'finos_other_income_annual', label: 'Any other income (a year)', group: 'Other income' },
  { key: 'finos_epf_employee_annual', label: 'EPF: your contribution (a year)', group: 'Section 80C', sub: 'Left blank it is taken as 12% of basic.' },
  { key: 'finos_ppf_80c', label: 'PPF and small savings deposited', group: 'Section 80C' },
  { key: 'finos_elss_invested', label: 'ELSS / tax-saving funds', group: 'Section 80C' },
  { key: 'finos_lic_premium_annual', label: 'Life insurance premiums', group: 'Section 80C' },
  { key: 'finos_nps_employee_annual', label: 'NPS: your contribution (a year)', group: 'Section 80C', sub: 'Fills any 80C room first, then the extra ₹50,000 under 80CCD(1B).' },
  { key: 'finos_home_loan_principal_annual', label: 'Home-loan principal repaid', group: 'Section 80C' },
  { key: 'finos_ssy_annual', label: 'Sukanya Samriddhi deposits', group: 'Section 80C' },
  { key: 'finos_school_fees_annual', label: "Children's tuition fees", group: 'Section 80C' },
  { key: 'finos_nps_employer_annual', label: 'Employer NPS contribution (a year)', group: 'Other deductions', sub: '80CCD(2): up to 10% of basic (old) or 14% (new).' },
  { key: 'finos_health_ins_premium', label: 'Health insurance: self and family', group: 'Other deductions', sub: '80D, up to ₹25,000.' },
  { key: 'finos_health_ins_parent_premium', label: 'Health insurance: parents', group: 'Other deductions', sub: '80D, up to ₹25,000 (₹50,000 if they are senior citizens).' },
  { key: 'finos_home_loan_interest_annual', label: 'Home-loan interest paid', group: 'Other deductions', sub: 'Section 24(b), up to ₹2L for a self-occupied home.' },
  { key: 'finos_edu_loan_interest_annual', label: 'Education-loan interest paid', group: 'Other deductions', sub: '80E, no upper limit.' },
  { key: 'finos_tds_salary_annual', label: 'TDS deducted by your employer', group: 'Tax already paid (TDS)', sub: 'From Form 16 or Form 26AS.' },
  { key: 'finos_tds_bank_annual', label: 'TDS deducted by banks and others', group: 'Tax already paid (TDS)' },
];
const FLAG_KEYS = ['finos_parent_senior', 'finos_city_metro'];

export async function loadItr(): Promise<{ vals: Record<string, string>; parentSenior: boolean; metro: boolean }> {
  const keys = [...ITR_FIELDS.map(f => f.key), ...FLAG_KEYS, 'finos_salary_ctc', 'finos_gross_salary'];
  const got = await getMany(keys);
  const vals: Record<string, string> = {};
  keys.forEach(k => { const v = got[k]; if (v != null && v !== '') vals[k] = v; });
  return { vals, parentSenior: got.finos_parent_senior === '1', metro: (got.finos_city_metro || 'yes').toLowerCase() !== 'no' };
}

export const saveItr = (key: string, value: string) => AsyncStorage.setItem(key, String(parseFloat(value) >= 0 ? parseFloat(value) : 0));
export const saveParentSenior = (v: boolean) => AsyncStorage.setItem('finos_parent_senior', v ? '1' : '0');
export const saveMetro = (v: boolean) => AsyncStorage.setItem('finos_city_metro', v ? 'yes' : 'no');

const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) && n > 0 ? n : 0; };
const list = (raw: string | null | undefined): any[] => { try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

/** Figures other FIN-OS screens already know, offered for the fields still empty. */
export async function loadSuggestions(): Promise<Record<string, number>> {
  const g = await getMany(['finos_salary_hra_received', 'finos_salary_rent_paid', 'finos_insurance_policies', 'finos_passive_streams', 'finos_ppf_80c', 'finos_epf_employee_annual']);
  const out: Record<string, number> = {};
  if (num(g.finos_salary_hra_received)) out.finos_hra_received = num(g.finos_salary_hra_received);
  if (num(g.finos_salary_rent_paid)) out.finos_rent_paid = num(g.finos_salary_rent_paid);
  const health = list(g.finos_insurance_policies).filter(p => p && p.type === 'health').reduce((s, p) => s + num(p.annual_premium || p.premium), 0);
  if (health) out.finos_health_ins_premium = health;
  const life = list(g.finos_insurance_policies).filter(p => p && (p.type === 'life_term' || p.type === 'life_ulip')).reduce((s, p) => s + num(p.annual_premium || p.premium), 0);
  if (life) out.finos_lic_premium_annual = life;
  const streams = list(g.finos_passive_streams);
  const yearly = (t: string) => streams.filter(s => s && s.type === t).reduce((s, x) => s + num(x.monthly) * 12, 0);
  if (yearly('rental')) out.finos_passive_rental_annual = yearly('rental');
  if (yearly('dividend')) out.finos_passive_dividend_annual = yearly('dividend');
  if (yearly('fd')) out.finos_fd_interest_annual = yearly('fd');
  return out;
}
