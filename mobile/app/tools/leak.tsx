import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr, inrShort } from '@/components/TrackerUI';
import { Segmented, Collapsible, Bullet } from '@/components/CalcUI';
import { usePersisted } from '@/hooks/usePersisted';
import { compute, DEFAULT_INCLUDE, MIN_DAYS, type LeakOptions } from '@/lib/leak';
import { loadLeakInputs, saveLeakFigures } from '@/lib/leakStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const DEFAULTS = { include: null as string[] | null, rate: '12', redirect: '25' };
const RATES = ['8', '10', '12', '14'];
const REDIRECTS = ['10', '25', '50', '100'];

export default function LeakScreen() {
  const { value: f, setValue: set, reset } = usePersisted('finos_leak_inputs_v1', DEFAULTS);
  const [data, setData] = useState<{ txns: LeakOptions['txns']; subscriptionsMonthly: number } | null>(null);
  const load = useCallback(() => { loadLeakInputs().then(setData).catch(() => setData({ txns: [], subscriptionsMonthly: 0 })); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const include = f.include ?? DEFAULT_INCLUDE;
  const r = useMemo(() => compute({ ...(data || {}), include, rate: Number(f.rate), redirectPct: Number(f.redirect) }), [data, f.include, f.rate, f.redirect]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (data && r.enoughData) saveLeakFigures(r).catch(() => {}); }, [data, r]);

  const toggle = (c: string) => set(p => {
    const cur = p.include ?? DEFAULT_INCLUDE;
    return { ...p, include: cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c] };
  });
  const h20 = r.horizons.find(h => h.years === 20);
  const rd20 = r.redirect.horizons.find(h => h.years === 20);

  return (
    <TrackerScreen title="Future loss" subtitle="What the money that quietly leaks every month would have become if it had been invested.">
      {!data ? <Card><Text style={Typography.body}>Reading your tracked spending…</Text></Card> : !r.hasAnyData ? (
        <Card><Text style={Typography.body}>No expenses are logged yet. Log your spending in the Track tab, or import a bank statement, and the leak is worked out from it. Nothing is made up.</Text></Card>
      ) : !r.enoughData && r.monthly === 0 ? (
        <Card><Text style={Typography.body}>
          {`You have ${r.days} day${r.days === 1 ? '' : 's'} of spending logged. It takes at least ${MIN_DAYS} days to turn it into a reliable monthly figure, so only subscriptions you have tracked are counted for now.`}
        </Text></Card>
      ) : (
        <Card accent={Colors.red}>
          <Text style={Typography.label}>YOUR MONTHLY LEAK</Text>
          <Text style={s.big}>{inr(r.monthly)} <Text style={s.small}>a month</Text></Text>
          <Text style={[Typography.caption, { color: Colors.textPrimary, lineHeight: 18 }]}>
            {`Invested at ${r.rate}% a year, ${inr(r.monthly)} a month becomes ${inrShort(h20 ? h20.value : 0)} in 20 years (you would put in ${inrShort(h20 ? h20.invested : 0)}).`}
          </Text>
          <View style={s.hz}>
            {r.horizons.map(h => (
              <View key={h.years} style={s.hzBox}>
                <Text style={Typography.label}>{h.years} YEARS</Text>
                <Text style={s.hzVal}>{inrShort(h.value)}</Text>
                <Text style={s.small}>gain {inrShort(h.gain)}</Text>
              </View>
            ))}
          </View>
          <View style={s.redirect}>
            <Text style={[Typography.caption, { color: Colors.textPrimary, lineHeight: 18 }]}>
              {`If you redirect ${r.redirect.pct}% of it (${inr(r.redirect.monthly)} a month)… it becomes ${inrShort(rd20 ? rd20.value : 0)} in 20 years.`}
            </Text>
          </View>
        </Card>
      )}

      {data && r.hasAnyData && (
        <>
          <SectionLabel>WHAT COUNTS AS A LEAK</SectionLabel>
          <Card>
            {r.categories.map(c => (
              <TouchableOpacity key={c.category} style={s.catRow} onPress={() => toggle(c.category)} accessibilityRole="checkbox" accessibilityState={{ checked: c.included }} accessibilityLabel={`${c.category}, ${inr(c.monthly)} a month`}>
                <View style={[s.box, c.included && s.boxOn]}>{c.included && <Text style={s.tick}>✓</Text>}</View>
                <Text style={[Typography.body, { flexGrow: 1, flexShrink: 1, flexBasis: 100 }]}>{c.category}</Text>
                <Text style={s.amt}>{inr(c.monthly)}</Text>
              </TouchableOpacity>
            ))}
            <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>
              {r.enoughData ? `Each category is its spend over the last ${Math.min(90, r.days)} days, scaled to a month.` : 'Only subscriptions you have tracked are counted until there are enough days of spending.'}
            </Text>
          </Card>

          <SectionLabel>ASSUMPTIONS</SectionLabel>
          <Card>
            <Segmented label="EXPECTED RETURN" value={f.rate} onChange={v => set(p => ({ ...p, rate: v }))} options={RATES.map(x => ({ id: x, label: `${x}% a year` }))} />
            <Segmented label="HOW MUCH OF THE LEAK YOU COULD REDIRECT" value={f.redirect} onChange={v => set(p => ({ ...p, redirect: v }))} options={REDIRECTS.map(x => ({ id: x, label: `${x}%` }))} />
            <Text onPress={reset} style={{ color: Colors.textMuted, fontSize: 12, fontWeight: '700' }}>Reset</Text>
          </Card>
        </>
      )}

      <Collapsible title="How this is worked out — and what it is not">
        <Bullet>Only logged expenses count; income and money you put into SIPs or savings never do. Subscriptions use the larger of your Subscription Tracker figure and what you logged, never both.</Bullet>
        <Bullet>The return is an assumption, not a promise: 12% a year is a long-run equity-like figure and markets can do much worse for years. This is an illustration of what small leaks compound into, not advice.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  big: { fontSize: 28, fontWeight: '900', color: Colors.red, marginVertical: 4 },
  small: { ...Typography.caption, fontSize: 12 },
  hz: { flexDirection: 'row', gap: Spacing.sm, marginVertical: Spacing.md },
  hzBox: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: Spacing.sm },
  hzVal: { fontSize: 16, fontWeight: '900', color: Colors.textPrimary, marginVertical: 2 },
  redirect: { padding: Spacing.md, borderRadius: 12, backgroundColor: 'rgba(34,211,166,0.10)', borderWidth: 1, borderColor: 'rgba(34,211,166,0.35)' },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.borderHi, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  tick: { color: '#000', fontWeight: '900', fontSize: 14 },
  amt: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
});
