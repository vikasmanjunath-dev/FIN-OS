import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadTrackerData } from '@/lib/trackerStorage';
import { computeAll } from '@/lib/trackers';

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
  name: 'Friend', netWorth: 0, monthlyIncome: 0, monthlyExpense: 0, savingsRate: 0, healthScore: 0,
  sipTotal: 0, portfolioValue: 0, aaIncome: 0, aaExpense: 0, hasActiveAA: false,
};

/** Profile summary used by Arya's context and the greeting — derived from the trackers. */
export function useFinosContext() {
  const [ctx, setCtx] = useState<FinosContext>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await loadTrackerData();
      const c = computeAll(d);
      let hasActiveAA = false;
      try {
        const consents = JSON.parse((await AsyncStorage.getItem('finos_aa_consents_v1')) || '{}');
        hasActiveAA = Object.values(consents).some((x: any) => x?.active);
      } catch { /* none */ }

      setCtx({
        name: d.name || 'Friend',
        netWorth: c.netWorth.netWorth,
        monthlyIncome: c.budget.income,
        monthlyExpense: c.budget.expense,
        savingsRate: c.budget.savingsRate,
        healthScore: c.health.total,
        sipTotal: d.monthlySip,
        portfolioValue: d.portfolio,
        aaIncome: d.aaIncome,
        aaExpense: d.aaExpense,
        hasActiveAA,
      });
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the screen regains focus, so edits made on other tabs show up.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return { ctx, loading, refresh: load };
}
