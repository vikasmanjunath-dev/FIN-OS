import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FinosContext {
  name: string;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpense: number;
  savingsRate: number;
  healthScore: number;
  sipTotal: number;
  portfolioValue: number;
  aaIncome: number;
  aaExpense: number;
  hasActiveAA: boolean;
}

const DEFAULTS: FinosContext = {
  name: 'Friend',
  netWorth: 0,
  monthlyIncome: 0,
  monthlyExpense: 0,
  savingsRate: 0,
  healthScore: 0,
  sipTotal: 0,
  portfolioValue: 0,
  aaIncome: 0,
  aaExpense: 0,
  hasActiveAA: false,
};

const STORAGE_KEYS = {
  name:            'finos_user_name',
  netWorth:        'finos_net_worth',
  monthlyIncome:   'finos_monthly_income',
  monthlyExpense:  'finos_monthly_expense',
  healthScore:     'finos_health_score',
  sipTotal:        'finos_sip_total',
  portfolioValue:  'finos_portfolio_value',
  aaIncome:        'finos_aa_income',
  aaExpense:       'finos_aa_expense',
  aaConsents:      'finos_aa_consents_v1',
};

export function useFinosContext() {
  const [ctx, setCtx] = useState<FinosContext>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const keys = Object.values(STORAGE_KEYS);
      const pairs = await AsyncStorage.multiGet(keys);
      const map = Object.fromEntries(pairs.map(([k, v]) => [k, v]));

      const income  = parseFloat(map[STORAGE_KEYS.aaIncome]  || '0');
      const expense = parseFloat(map[STORAGE_KEYS.aaExpense] || '0');
      const consents = JSON.parse(map[STORAGE_KEYS.aaConsents] || '{}');
      const hasActiveAA = Object.values(consents).some((c: any) => c?.active);

      setCtx({
        name:           map[STORAGE_KEYS.name]          || 'Friend',
        netWorth:       parseFloat(map[STORAGE_KEYS.netWorth]       || '0'),
        monthlyIncome:  parseFloat(map[STORAGE_KEYS.monthlyIncome]  || '0') || income,
        monthlyExpense: parseFloat(map[STORAGE_KEYS.monthlyExpense] || '0') || expense,
        savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
        healthScore:    parseFloat(map[STORAGE_KEYS.healthScore]    || '0'),
        sipTotal:       parseFloat(map[STORAGE_KEYS.sipTotal]       || '0'),
        portfolioValue: parseFloat(map[STORAGE_KEYS.portfolioValue] || '0'),
        aaIncome:       income,
        aaExpense:      expense,
        hasActiveAA,
      });
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ctx, loading, refresh: load };
}
