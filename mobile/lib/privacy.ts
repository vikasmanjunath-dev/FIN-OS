// What the phone app does with data — written from what the code actually does, and guarded by __tests__/privacy.test.mts
// (which fails if the app starts talking to a host, or asking for a permission, that is not described here).
// Pure: no React Native imports.

/** Who is responsible for the notice. Left empty on purpose until the operator's business details exist — do not invent them. */
export const ENTITY: { name: string | null; address: string | null; grievanceOfficer: string | null; grievanceEmail: string | null } =
  { name: null, address: null, grievanceOfficer: null, grievanceEmail: null };

export type FlowKind = 'device' | 'account' | 'backend' | 'file' | 'share';

export interface Flow {
  id: string;
  kind: FlowKind;
  title: string;
  when: string;
  sent: string;
  personal: boolean;
  optional: boolean;
  control: string;
}

export const FLOWS: Flow[] = [
  {
    id: 'device', kind: 'device', title: 'Your FIN·OS data, on this phone',
    when: 'Always, while you use the app.',
    sent: 'Nothing. Transactions, budgets, goals, holdings, subscriptions, policies, scores and settings are kept in this app\'s storage so the tools work.',
    personal: true, optional: false,
    control: 'Export it, or delete it, from Privacy & your data.',
  },
  {
    id: 'account', kind: 'account', title: 'Sign-in and sync (Supabase)',
    when: 'Only if you sign in.',
    sent: 'Your email and password to sign in, then your holdings and your tracker data (everything except device-only settings) so they follow you to the website and your other devices.',
    personal: true, optional: true,
    control: 'Use the app without an account and nothing is sent. Sign out any time; delete your cloud copy or your account from Privacy & your data.',
  },
  {
    id: 'arya', kind: 'backend', title: 'Arya chat and market prices (your Arya backend)',
    when: 'When you open Markets, look up a price, or ask Arya a question.',
    sent: 'The symbols you look up, and with a chat message: your name, income, spending, net worth, portfolio value, SIP total and health score as context. These go to the Arya backend address in Settings — software you run yourself (by default the computer running the app\'s development server), not a FIN·OS-operated server.',
    personal: true, optional: true,
    control: 'Do not open Arya, or leave the backend unset. The backend, not your phone, then fetches prices from public market-data providers (NSE, AMFI, Yahoo Finance, CoinGecko); those providers see your backend\'s computer, not your phone.',
  },
  {
    id: 'files', kind: 'file', title: 'Files you choose (bank statements, broker holdings)',
    when: 'When you import a statement or a holdings file.',
    sent: 'Nothing. The file is read on the phone, shown to you as a preview, and only then saved. From a bank statement, account numbers and names are never read; from a holdings file only instrument names, ISINs, quantities and prices are. If you are signed in, imported holdings sync like any holding you add yourself.',
    personal: true, optional: true,
    control: 'Every statement import can be undone from Import a bank statement → Past imports. Imported holdings can be removed one by one in the Portfolio tab.',
  },
  {
    id: 'share', kind: 'share', title: 'The share sheet',
    when: 'Only when you tap Share.',
    sent: 'A short text with your Money Score and pillar scores — no rupee amounts. It goes wherever you pick in your phone\'s share sheet.',
    personal: false, optional: true,
    control: 'Do not tap Share.',
  },
];

/** Things the app deliberately does not do — shown to the person, and kept true by tests. */
export const NOT_DOING = [
  'No analytics, advertising or tracking SDKs.',
  'No access to your contacts, photos, location, camera or microphone.',
  'No selling or sharing of your data.',
];

/** What the app asks the phone for. Only the network: everything else is not built, so it is not requested. */
export const PERMISSIONS = ['Internet access', 'Notifications (only if you turn reminders on)'];

/** Storage keys shown in "What is on this phone". `list` counts the entries of a JSON array; `value` just says it is set. */
export const DATA_ITEMS: { key: string; label: string; kind: 'list' | 'value' }[] = [
  { key: 'finos_transactions', label: 'Transactions', kind: 'list' },
  { key: 'finos_holdings_v1', label: 'Holdings', kind: 'list' },
  { key: 'finos_subscriptions', label: 'Subscriptions', kind: 'list' },
  { key: 'finos_goals', label: 'Goals', kind: 'list' },
  { key: 'finos_insurance_policies', label: 'Insurance policies', kind: 'list' },
  { key: 'finos_ppf_portfolio', label: 'PPF & small-savings accounts', kind: 'list' },
  { key: 'finos_recurring_v1', label: 'Recurring entries', kind: 'list' },
  { key: 'finos_money_score_history', label: 'Money Score history', kind: 'list' },
  { key: 'finos_budgets', label: 'Budget limits', kind: 'value' },
  { key: 'finos_reminders_mobile', label: 'Reminder preferences', kind: 'value' },
  { key: 'finos_money_score', label: 'Latest Money Score', kind: 'value' },
  { key: 'finos_user_name', label: 'Your name', kind: 'value' },
  { key: 'finos_monthly_income', label: 'Income and other profile numbers', kind: 'value' },
];

/** How many entries a stored value holds (lists) or whether it is set (values). */
export function describeStored(raw: string | null, kind: 'list' | 'value'): string | null {
  if (raw == null || raw === '' || raw === '[]' || raw === '{}' || raw === '0') return null;
  if (kind === 'value') return 'saved';
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v.length ? `${v.length}` : null) : 'saved';
  } catch {
    return 'saved';
  }
}

export interface TermsSection { title: string; body: string[] }

/** Port of html/terms.html (a draft for legal review — operator, liability and governing law are not filled in). */
export const TERMS_STATUS = 'Draft for legal review. These terms describe how FIN·OS is meant to be used. They have not been reviewed by a lawyer, and the operator, liability and governing-law details are not filled in yet.';

export const TERMS: TermsSection[] = [
  { title: 'Using FIN·OS', body: [
    'FIN·OS is for adults (18 and over), for your own personal use.',
    'Use it lawfully. Do not try to break, overload, scrape or reverse-engineer it, or to access anyone else\'s data.',
    'Keep your phone safe. Anyone who can use your unlocked phone can see what FIN·OS stores on it.',
  ] },
  { title: 'What FIN·OS is, and is not', body: [
    'It is an educational tool. It helps you understand your money with calculators, trackers and estimates based on common rules of thumb and the rules it models.',
    'It is not advice. FIN·OS is not SEBI registered and does not give personalised investment, tax or legal advice. A score, a suggested next move or an Arya answer is an illustration, not a recommendation to buy, sell or file in a particular way.',
    'For important decisions, such as tax filing, insurance, loans or investments, check with a qualified professional.',
  ] },
  { title: 'Accuracy', body: [
    'Calculators state their assumptions (for example, income-tax slabs for FY 2025-26, without surcharge above ₹50 lakh). Rules change, so a result can be out of date.',
    'Market prices and other third-party data can be delayed, incomplete or wrong. FIN·OS does not guarantee them.',
    'Projections that use an assumed return are illustrations, not promises of returns.',
  ] },
  { title: 'Your data', body: [
    'By default your data stays on your phone. Privacy & your data shows what is stored, what can leave the phone, and how to export or delete it.',
    'You are responsible for backing it up.',
  ] },
  { title: 'Availability and changes', body: [
    'Features can change or be withdrawn. These terms will be updated when that matters, with the date of the latest change shown here.',
  ] },
  { title: 'Liability, governing law and contact', body: [
    'Operator: not set yet. To be added before launch.',
    'Limitation of liability: to be written by the operator\'s counsel.',
    'Governing law and courts: to be set by the operator\'s counsel.',
  ] },
];
