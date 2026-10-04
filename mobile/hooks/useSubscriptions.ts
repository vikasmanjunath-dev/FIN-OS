import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Subscription, summarize, localToday } from '@/lib/subscriptions';
import { loadSubscriptions, addSubscription, updateSubscription, removeSubscription, SubscriptionInput } from '@/lib/subscriptionsStorage';

export function useSubscriptions() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [income, setIncome] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [list, inc] = await Promise.all([loadSubscriptions(), AsyncStorage.getItem('finos_monthly_income')]);
    setItems(list);
    setIncome(parseFloat(inc ?? '') || 0);
    setLoaded(true);
  }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const summary = useMemo(() => summarize(items, localToday(), { income }), [items, income]);

  const add = useCallback(async (i: SubscriptionInput) => { const r = await addSubscription(i); await reload(); return r; }, [reload]);
  const update = useCallback(async (id: string, p: Partial<SubscriptionInput>) => { const ok = await updateSubscription(id, p); await reload(); return ok; }, [reload]);
  const remove = useCallback(async (id: string) => { const ok = await removeSubscription(id); await reload(); return ok; }, [reload]);
  return { items, summary, loaded, add, update, remove, reload };
}
