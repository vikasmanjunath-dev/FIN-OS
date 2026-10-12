// Reads what the calendar needs from the device, tolerating anything missing or corrupt. Nothing is written.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Sources } from '@/lib/calendar';

const KEYS = ['finos_sip_portfolio', 'finos_fd_portfolio', 'finos_insurance_policies', 'finos_goals', 'finos_subscriptions', 'finos_holdings_v1',
  'finos_home_loan_emi', 'finos_car_loan_emi', 'finos_personal_loan_emi'] as const;

const list = (raw: string | null | undefined): any[] => { try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; } catch { return []; } };
const num = (raw: string | null | undefined) => { const n = parseFloat(raw ?? ''); return Number.isFinite(n) && n > 0 ? n : 0; };

export async function loadCalendarSources(): Promise<{ sources: Sources; emis: { home: number; car: number; personal: number }; sipFromHoldings: number }> {
  const got = Object.fromEntries(await AsyncStorage.multiGet([...KEYS]));
  // Mutual funds the person tracks with a monthly SIP in the Portfolio tab: the debit day is not known, so they sit on the 1st like the website's default.
  const fromHoldings = list(got.finos_holdings_v1)
    .filter(h => Number(h.sipMonthly) > 0)
    .map(h => ({ fundName: h.name || h.symbol || 'SIP', monthlyAmount: Number(h.sipMonthly), startDate: '1970-01-01' }));
  return {
    sources: {
      sip: [...list(got.finos_sip_portfolio), ...fromHoldings],
      fd: list(got.finos_fd_portfolio) as any,
      insurance: list(got.finos_insurance_policies),
      goals: list(got.finos_goals),
      subscriptions: list(got.finos_subscriptions),
    },
    emis: { home: num(got.finos_home_loan_emi), car: num(got.finos_car_loan_emi), personal: num(got.finos_personal_loan_emi) },
    sipFromHoldings: fromHoldings.length,
  };
}
