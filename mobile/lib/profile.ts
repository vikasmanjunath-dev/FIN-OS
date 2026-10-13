// The few facts about the person that other screens use. Deliberately small: no phone number, no e-mail, no address.
// Same keys as the website, so they line up with the Money Score prefill, the Health Score and the retirement planner.
export const PROFILE_KEYS = { name: 'finos_user_name', age: 'finos_age', income: 'finos_monthly_income', dependents: 'finos_dependents' } as const;

export interface Profile { name: string; age: string; income: string; dependents: string }
export const EMPTY_PROFILE: Profile = { name: '', age: '', income: '', dependents: '' };

/** What each answer is used for, shown beside the field. */
export const USED_FOR: Record<keyof Profile, string> = {
  name: 'Greets you on Home and in Arya. Never leaves the phone unless you share a report.',
  age: 'Money Score (wealth for your age), retirement planner, Health Score and insurance cover targets.',
  income: 'Savings rate, the Money Score prefill, budget suggestions and the reminders that depend on spending.',
  dependents: 'Money Score: whether term cover is expected and how much health cover is enough.',
};

export interface Check { ok: boolean; errors: Partial<Record<keyof Profile, string>>; clean: Profile }

const digits = (s: string) => s.replace(/[₹,\s]/g, '');

export function validate(p: Profile): Check {
  const errors: Check['errors'] = {};
  const name = p.name.trim().replace(/\s+/g, ' ').slice(0, 60);
  let age = '', income = '', dependents = '';
  if (digits(p.age) !== '') {
    const a = Number(digits(p.age));
    if (!Number.isInteger(a) || a < 18 || a > 100) errors.age = 'Enter your age in whole years, 18 to 100.';
    else age = String(a);
  }
  if (digits(p.income) !== '') {
    const v = Number(digits(p.income));
    if (!Number.isFinite(v) || v < 0 || v > 100000000) errors.income = 'Enter your monthly income as a positive number.';
    else income = String(Math.round(v));
  }
  if (digits(p.dependents) !== '') {
    const d = Number(digits(p.dependents));
    if (!Number.isInteger(d) || d < 0 || d > 15) errors.dependents = 'Enter how many people depend on your income, 0 to 15.';
    else dependents = String(d);
  }
  return { ok: Object.keys(errors).length === 0, errors, clean: { name, age, income, dependents } };
}

/** Which of the four are filled in, for the "x of 4" line. */
export const completeness = (p: Profile): number => [p.name.trim(), digits(p.age), digits(p.income), digits(p.dependents)].filter(v => v !== '').length;
