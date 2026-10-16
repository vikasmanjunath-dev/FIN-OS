// Reads what the calendar needs from the device (the trackers' keys and the person's own dates), tolerating anything missing or corrupt. Nothing is written.
import type { Sources } from '@/lib/calendar';
import { loadCustomEvents } from '@/lib/financialCalendarStorage';
import { asList, flatRecord, getMany, finite } from '@/lib/safeStore';

const KEYS = ['finos_sip_portfolio', 'finos_fd_portfolio', 'finos_insurance_policies', 'finos_goals', 'finos_subscriptions', 'finos_holdings_v1',
  'finos_home_loan_emi', 'finos_car_loan_emi', 'finos_personal_loan_emi'] as const;

/** The stored records as flat objects with text and number fields of the right type (anything else is left out). */
const list = (raw: string | null | undefined): any[] => asList(raw).map(flatRecord).filter((x): x is NonNullable<typeof x> => x !== null);
const num = (raw: string | null | undefined) => { const n = parseFloat(raw ?? ''); return Number.isFinite(n) && n > 0 ? n : 0; };

export async function loadCalendarSources(): Promise<{ sources: Sources; emis: { home: number; car: number; personal: number }; sipFromHoldings: number }> {
  const got = await getMany(KEYS);
  const custom = await loadCustomEvents();        // tolerant: [] when missing or corrupt
  // Mutual funds the person tracks with a monthly SIP in the Portfolio tab: the debit day is not known, so they sit on the 1st like the website's default.
  const fromHoldings = list(got.finos_holdings_v1)
    .filter(h => finite(h.sipMonthly) > 0)
    .map(h => ({ fundName: String(h.name || h.symbol || 'SIP'), monthlyAmount: finite(h.sipMonthly), startDate: '1970-01-01' }));
  return {
    sources: {
      sip: [...list(got.finos_sip_portfolio), ...fromHoldings],
      fd: list(got.finos_fd_portfolio) as any,
      insurance: list(got.finos_insurance_policies),
      goals: list(got.finos_goals),
      subscriptions: list(got.finos_subscriptions),
      custom,
    },
    emis: { home: num(got.finos_home_loan_emi), car: num(got.finos_car_loan_emi), personal: num(got.finos_personal_loan_emi) },
    sipFromHoldings: fromHoldings.length,
  };
}
