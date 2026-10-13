import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Segmented, CheckRow, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { summarize, scenarios, MILESTONES, TYPE_META, TYPES, type Stream, type StreamType } from '@/lib/passive';
import { loadPassive, savePassive } from '@/lib/passiveStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function PassiveIncomeScreen() {
  const [streams, setStreams] = useState<Stream[] | null>(null);
  const [exp, setExp] = useState(0);
  const [seeded, setSeeded] = useState(false);
  const [expText, setExpText] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => { loadPassive().then(p => { setStreams(p.streams); setExp(p.monthlyExp); setExpText(p.monthlyExp ? String(p.monthlyExp) : ''); setSeeded(p.seeded); }); }, []));

  const monthlyExp = exp || toNum(expText);
  const sum = useMemo(() => (streams ? summarize(streams, monthlyExp) : null), [streams, monthlyExp]);
  const what = useMemo(() => (sum ? scenarios(sum.total, monthlyExp) : []), [sum, monthlyExp]);

  const commit = (next: Stream[]) => {
    setStreams(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { savePassive(next, monthlyExp).catch(() => {}); }, 400);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!streams || !sum) return <TrackerScreen title="Passive income" subtitle="Income that arrives without active work."><Card><Text style={Typography.body}>Reading your streams…</Text></Card></TrackerScreen>;

  const patch = (id: string, p: Partial<Stream>) => commit(streams.map(s => (s.id === id ? { ...s, ...p } : s)));
  const add = () => commit([...streams, { id: 's' + Date.now().toString(36), type: 'other', label: 'New stream', monthly: 0, taxable: true, note: '' }]);
  const remove = (s: Stream) => {
    const go = () => commit(streams.filter(x => x.id !== s.id));
    if (Platform.OS === 'web') { if (window.confirm(`Remove ${s.label || 'this stream'}?`)) go(); return; }
    Alert.alert('Remove stream', `Remove ${s.label || 'this stream'}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  const color = sum.coverage >= 100 ? Colors.teal : sum.coverage >= 50 ? Colors.gold : Colors.cyan;

  return (
    <TrackerScreen title="Passive income" subtitle="Dividends, interest, rent, SWP and other income that arrives without active work, and how much of your spending it covers.">
      <Card accent={color}>
        <Text style={Typography.label}>TOTAL PASSIVE INCOME</Text>
        <Text style={[s.hero, { color }]}>{inr(sum.total)}<Text style={s.per}>/month</Text></Text>
        <Bar pct={Math.min(sum.coverage, 100)} color={color} height={10} />
        <Text style={[Typography.body, { marginTop: Spacing.sm }]}>
          {sum.monthlyExp > 0 ? `Covers ${Math.round(sum.coverage)}% of your ${inrShort(sum.monthlyExp)} monthly spending · ${sum.label}` : 'Add your monthly spending below to see how much it covers.'}
        </Text>
        <View style={s.kpis}>
          <Kpi label="ANNUAL" value={inr(sum.annual)} sub="before tax" />
          <Kpi label="TAX-FREE" value={`${inr(sum.taxFree)}/mo`} sub={`${inr(sum.taxable)}/mo taxable`} />
          {sum.monthlyExp > 0 && <Kpi label={sum.total >= sum.monthlyExp ? 'SURPLUS' : 'STILL NEEDED'} value={inr(Math.abs(sum.total - sum.monthlyExp))} sub="a month" color={sum.total >= sum.monthlyExp ? Colors.teal : Colors.red} />}
        </View>
      </Card>

      {exp === 0 && (
        <Card>
          <CalcField label="YOUR MONTHLY SPENDING" prefix="₹" value={expText} onChange={setExpText} sub="Not recorded yet in Budget, so type it here for the coverage figure (not saved to your Budget)." />
        </Card>
      )}

      {seeded && <Card accent={Colors.gold}><Text style={[Typography.caption, { lineHeight: 17 }]}>The FD and SGB lines were filled in from your Deposits and Gold trackers as estimates. Change them to what you actually receive.</Text></Card>}

      <SectionLabel>YOUR STREAMS</SectionLabel>
      {streams.map(st => {
        const m = TYPE_META[st.type];
        return (
          <Card key={st.id}>
            <View style={s.head}>
              <Text style={s.icon}>{m.icon}</Text>
              <View style={{ flex: 1 }}><CalcField label="NAME" text value={st.label} onChange={v => patch(st.id, { label: v })} placeholder="Stream name" /></View>
              <TouchableOpacity onPress={() => remove(st)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${st.label || 'stream'}`}><Text style={s.del}>✕</Text></TouchableOpacity>
            </View>
            <Segmented label="TYPE" value={st.type} onChange={(v: StreamType) => patch(st.id, { type: v })} options={TYPES.map(t => ({ id: t, label: `${TYPE_META[t].icon} ${TYPE_META[t].label}` }))} />
            <CalcField label="MONTHLY AMOUNT" prefix="₹" value={st.monthly ? String(st.monthly) : ''} onChange={v => patch(st.id, { monthly: Math.max(0, toNum(v)) })} />
            <CheckRow label="Taxable" value={st.taxable} onChange={v => patch(st.id, { taxable: v })} />
            <CalcField label="NOTE" text value={st.note} onChange={v => patch(st.id, { note: v })} placeholder="e.g. HDFC Bank dividend" />
          </Card>
        );
      })}
      <TouchableOpacity style={s.add} onPress={add} accessibilityRole="button"><Text style={s.addTxt}>＋ Add a stream</Text></TouchableOpacity>

      {sum.byType.length > 0 && (
        <>
          <SectionLabel>WHERE IT COMES FROM</SectionLabel>
          <Card>
            {sum.byType.map(b => (
              <View key={b.type} style={s.row}>
                <Text style={s.rowIcon}>{TYPE_META[b.type].icon}</Text>
                <View style={{ flex: 1 }}><Text style={Typography.body}>{TYPE_META[b.type].label}</Text><Text style={Typography.caption}>{`${b.pct}% of passive income`}</Text></View>
                <Text style={[s.rowVal, { color: TYPE_META[b.type].color }]}>{`${inr(b.amount)}/mo`}</Text>
              </View>
            ))}
          </Card>
        </>
      )}

      <SectionLabel>ROAD TO FINANCIAL FREEDOM</SectionLabel>
      <Card>
        {MILESTONES.map(ms => {
          const reached = sum.coverage >= ms.pct;
          return (
            <View key={ms.pct} style={s.row}>
              <Text style={s.rowIcon}>{reached ? '✅' : '⬜'}</Text>
              <View style={{ flex: 1 }}><Text style={[Typography.body, reached && { color: Colors.teal }]}>{ms.label}</Text><Text style={Typography.caption}>{ms.desc}</Text></View>
              <Text style={[s.rowVal, { color: reached ? Colors.teal : Colors.textMuted }]}>{`${ms.pct}%`}</Text>
            </View>
          );
        })}
        {sum.additionalCorpus > 0 && (
          <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>
            {`To cover the ${inr(sum.gap)} a month still missing, you would need about ${inrShort(sum.additionalCorpus)} more invested, if it can safely pay out 4% a year.`}
          </Text>
        )}
      </Card>

      {monthlyExp > 0 && (
        <Card>
          <Text style={[Typography.label, { marginBottom: Spacing.sm }]}>IF YOU ADDED…</Text>
          {what.map(w => (
            <View key={w.extra} style={s.row}>
              <Text style={[Typography.caption, { width: 90 }]}>{`+${inr(w.extra)}/mo`}</Text>
              <View style={{ flex: 1, marginHorizontal: Spacing.sm }}><Bar pct={Math.min(w.coverage, 100)} color={Colors.teal} height={6} /></View>
              <Text style={s.rowVal}>{`${Math.round(w.coverage)}%`}</Text>
            </View>
          ))}
        </Card>
      )}

      <Collapsible title="Tax on passive income, and what this leaves out">
        <Bullet>Dividends are added to your income and taxed at your slab. FD interest is taxed at slab too, with 10% TDS once a bank pays you more than ₹40,000 a year (₹50,000 for senior citizens).</Bullet>
        <Bullet>SGB coupon is taxed at slab; gains on holding to maturity can be exempt. Equity SWP: long-term gains above ₹1.25L a year are taxed at 12.5%.</Bullet>
        <Bullet>Rent: a 30% standard deduction on net rent, then slab. The Taxable tick here is yours to set; it only splits the totals above.</Bullet>
        <Bullet>Amounts are what you type. Nothing is fetched, and the 4% figure is a rule of thumb, not a guarantee that a corpus will last.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={{ flexBasis: '30%', flexGrow: 1 }}>
      <Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted }]}>{label}</Text>
      <Text style={[s.kpiVal, color ? { color } : null]}>{value}</Text>
      {sub ? <Text style={[Typography.caption, { fontSize: 10 }]}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 34, fontWeight: '900', marginVertical: 4 },
  per: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md },
  kpiVal: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary, marginTop: 2 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  icon: { fontSize: 22, marginTop: 24 },
  del: { color: Colors.red, fontSize: 18, padding: 6, marginTop: 20 },
  add: { borderWidth: 1, borderColor: Colors.teal + '66', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: Spacing.md },
  addTxt: { color: Colors.teal, fontWeight: '800', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 7 },
  rowIcon: { fontSize: 18 },
  rowVal: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
});
