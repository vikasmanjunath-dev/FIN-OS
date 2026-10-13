// A calculator on the phone is data: its inputs and a pure function from the inputs to the lines it shows.
// Each one is a port of a page under calculators/ on the website. __tests__/webCalc.parity.test.mts loads that page's real
// script and compares every line of text it writes with what `run` returns, on random and edge-case inputs.

export type GroupId = 'invest' | 'loans' | 'banking' | 'retire' | 'tax' | 'health' | 'think' | 'desi' | 'trade';
export const GROUPS: { id: GroupId; label: string; icon: string; folder: string }[] = [
  { id: 'invest', label: 'Investment & wealth', icon: '📈', folder: 'investment & wealth' },
  { id: 'loans', label: 'Loans, debt & EMI', icon: '🏦', folder: 'loans, debt & emi' },
  { id: 'banking', label: 'Banking & fixed income', icon: '💰', folder: 'banking & fixed income' },
  { id: 'retire', label: 'Retirement & life planning', icon: '🌅', folder: 'retirement & life planning' },
  { id: 'tax', label: 'Tax & salary', icon: '🧾', folder: 'tax & salary' },
  { id: 'health', label: 'Financial health', icon: '❤️', folder: 'financial health' },
  { id: 'think', label: 'Core thinking', icon: '🧠', folder: 'core-thinking' },
  { id: 'desi', label: 'Desi reality check', icon: '🇮🇳', folder: 'desi reality check' },
  { id: 'trade', label: 'Trading & markets', icon: '📊', folder: 'trading & markets' },
];

export type Unit = '₹' | '%' | 'yrs' | 'months' | 'days' | '×' | '';

export interface NumberInput { kind?: 'number'; key: string; label: string; unit: Unit; def: number; min: number; max: number; step?: number; id?: string; hint?: string }
export interface ChoiceInput { kind: 'choice'; key: string; label: string; def: string; options: { id: string; label: string }[]; id?: string; /** the page keeps this in a script variable (set by buttons) rather than an element */ webVar?: string }
export interface ToggleInput { kind: 'toggle'; key: string; label: string; def: boolean; id?: string }
export type CalcInput = NumberInput | ChoiceInput | ToggleInput;
export type Values = Record<string, number | string | boolean>;

/** One line the calculator shows. `id` is the element the website writes it to and `text` is exactly what the website writes. */
export interface CalcRow { id: string; label?: string; text: string; tone?: 'good' | 'warn' | 'bad' | 'info'; hero?: boolean; /** for a list the website writes as one block: each item on its own line (their text joined is `text`) */ lines?: string[] }

export interface CalcDef {
  id: string;
  group: GroupId;
  title: string;
  blurb: string;
  /** path under calculators/, e.g. 'investment & wealth/sip.html' */
  web: string;
  inputs: CalcInput[];
  run: (v: any) => CalcRow[];
  /** shown under the result: what the formula assumes, and what it leaves out */
  notes?: string[];
}

export const num = (key: string, label: string, unit: Unit, def: number, min: number, max: number, step = 1, extra: Partial<NumberInput> = {}): NumberInput =>
  ({ key, label, unit, def, min, max, step, ...extra });
export const row = (id: string, label: string, text: string, extra: Partial<CalcRow> = {}): CalcRow => ({ id, label, text, ...extra });
