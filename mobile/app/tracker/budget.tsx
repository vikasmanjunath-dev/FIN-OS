import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useTrackers } from '@/hooks/useTrackers';
import { TrackerScreen, Card, SectionLabel, Bar, Stat, MoneyField, inr } from '@/components/TrackerUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { CATEGORIES, suggestLimits } from '@/lib/budget';

const STATE_COLOR = { ok: Colors.teal, warn: Colors.gold, over: Colors.red } as const;

export default function BudgetScreen() {
  const { data, computed, save } = useTrackers();
  const b = computed.budget;
  const sp = computed.spending;
  const t30 = sp.trailing30;
  // A month's spend needs a month's worth of logging before it can stand in for your monthly figure
  const reliable = t30.count >= 10 && t30.days >= 14;
  const limits = data.budgetLimits;
  const rowsByCat = new Map(sp.budget.rows.map(r => [r.category, r]));
  const shown = [...new Set([...Object.keys(limits), ...sp.budget.rows.map(r => r.category)])];
  const addable = CATEGORIES.filter(c => !shown.includes(c) && c !== 'Other');
  const setLimit = (cat: string, v: number) => {
    const next = { ...limits };
    if (v > 0) next[cat] = Math.round(v); else delete next[cat];
    save({ budgetLimits: next });
  };
  const suggested = suggestLimits(data.transactions, b.income);
  const missing = Object.entries(suggested).filter(([c]) => !(c in limits));
  const rateColor = b.savingsRate >= 25 ? Colors.teal : b.savingsRate >= 15 ? Colors.gold : Colors.red;
  const hasFlow = b.known;

  return (
    <TrackerScreen title="Budget" subtitle="Your monthly income and spending. This sets your savings rate, emergency-fund target and FIRE number.">
      <Card accent={rateColor}>
        <Text style={Typography.label}>SAVINGS RATE</Text>
        <View style={s.row}>
          <Text style={[s.big, { color: hasFlow ? rateColor : Colors.textDim }]}>{hasFlow ? `${b.savingsRate}%` : '—'}</Text>
          <Text style={Typography.caption}>of income · target 25%</Text>
        </View>
        <Bar pct={hasFlow ? Math.max(b.savingsRate, 0) : 0} color={rateColor} height={10} />
        <View style={{ flexDirection: 'row', marginTop: Spacing.md }}>
          <Stat label="Income / month" value={b.income > 0 ? inr(b.income) : '—'} color={Colors.teal} />
          <Stat label="Spend / month" value={b.expense > 0 ? inr(b.expense) : '—'} color={Colors.gold} />
          <Stat label={b.saving >= 0 ? 'Saved / month' : 'Overspend'} value={hasFlow ? inr(Math.abs(b.saving)) : '—'} color={b.saving >= 0 ? Colors.cyan : Colors.red} />
        </View>
        {b.saving < 0 && hasFlow && (
          <Text style={s.warn}>You are spending more than you earn. Trimming even 10% of spend moves your savings rate fastest.</Text>
        )}
      </Card>

      <SectionLabel>MONTHLY</SectionLabel>
      <Card>
        <MoneyField icon="💰" label="Monthly income" sub={data.aaIncome > 0 && !data.income ? `Using ₹${Math.round(data.aaIncome).toLocaleString('en-IN')} from your linked accounts` : 'Take-home, after tax'} value={data.income} onCommit={v => save({ income: v })} />
        <MoneyField icon="💸" label="Monthly spend" sub={data.aaExpense > 0 && !data.expense ? `Using ₹${Math.round(data.aaExpense).toLocaleString('en-IN')} from your linked accounts` : 'Rent, bills, food, EMIs — everything'} value={data.expense} onCommit={v => save({ expense: v })} />
      </Card>

      <TouchableOpacity activeOpacity={0.85} style={st.logCard} onPress={() => router.push('/tracker/transactions')} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={st.logTitle}>Log transactions</Text>
          <Text style={Typography.caption}>
            {sp.totals.count > 0 ? `${sp.totals.count} logged this month · ${inr(sp.totals.spent)} spent` : 'Track every rupee to see where your money goes'}
          </Text>
        </View>
        <Text style={{ color: Colors.cyan, fontSize: 20 }}>›</Text>
      </TouchableOpacity>

      {t30.count > 0 && (
        <Card>
          <Text style={Typography.label}>LOGGED SPEND · LAST 30 DAYS</Text>
          <Text style={st.t30}>{inr(t30.total)}</Text>
          <Text style={[Typography.caption, { lineHeight: 17 }]}>
            From {t30.count} expense{t30.count === 1 ? '' : 's'} over {t30.days} day{t30.days === 1 ? '' : 's'}.
            {data.expense > 0 && Math.abs(t30.total - data.expense) / data.expense > 0.15 ? ` Your monthly spend above is ${inr(data.expense)}.` : ''}
          </Text>
          {reliable && Math.round(t30.total) !== Math.round(data.expense) ? (
            <TouchableOpacity style={st.useBtn} onPress={() => save({ expense: Math.round(t30.total) })} accessibilityRole="button">
              <Text style={st.useTxt}>Use {inr(t30.total)} as my monthly spend</Text>
            </TouchableOpacity>
          ) : !reliable ? (
            <Text style={[Typography.caption, { marginTop: Spacing.sm, color: Colors.textDim }]}>Keep logging for about two weeks (10+ entries) before this can stand in for your monthly spend.</Text>
          ) : null}
        </Card>
      )}

      <SectionLabel>CATEGORY BUDGETS · THIS MONTH</SectionLabel>
      <Card>
        {shown.length === 0 && (
          <Text style={[Typography.caption, { lineHeight: 18 }]}>
            Set a monthly limit per category and FIN·OS tracks it against what you log — and warns you if your pace will overshoot.
          </Text>
        )}
        {shown.map(c => {
          const r = rowsByCat.get(c);
          const limit = limits[c] ?? 0;
          const color = r ? STATE_COLOR[r.state] : Colors.teal;
          return (
            <View key={c} style={{ paddingTop: Spacing.sm }}>
              <MoneyField label={c} sub={r ? `${inr(r.spent)} spent${limit ? ` · ${r.pct}% used` : ''}${r.state === 'over' ? ' · over budget' : r.state === 'warn' ? (r.pct! >= 80 ? ' · nearly there' : ' · on pace to overshoot') : ''}` : 'No spend yet'} value={limit} onCommit={v => setLimit(c, v)} />
              {limit > 0 && r && <View style={{ paddingTop: 6 }}><Bar pct={r.pct ?? 0} color={color} height={6} /></View>}
            </View>
          );
        })}
        {sp.budget.total.limit > 0 && (
          <Text style={[Typography.caption, { marginTop: Spacing.md }]}>
            Total: {inr(sp.budget.total.spent)} of {inr(sp.budget.total.limit)} budgeted ({sp.budget.total.pct}%) · {sp.budget.daysLeft} days left
          </Text>
        )}
        {addable.length > 0 && (
          <View style={{ marginTop: Spacing.md }}>
            <Text style={st.addLabel}>ADD A BUDGET</Text>
            <View style={st.chips}>
              {addable.map(c => (
                <TouchableOpacity key={c} style={st.chip} onPress={() => setLimit(c, suggested[c] ?? (b.income > 0 ? Math.max(500, Math.ceil((b.income * 0.05) / 500) * 500) : 5000))} accessibilityRole="button" accessibilityLabel={`Add ${c} budget`}>
                  <Text style={st.chipTxt}>＋ {c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {missing.length > 0 && (
          <TouchableOpacity style={st.useBtn} onPress={() => save({ budgetLimits: { ...suggested, ...limits } })} accessibilityRole="button">
            <Text style={st.useTxt}>Suggest limits for {missing.length} categor{missing.length === 1 ? 'y' : 'ies'}</Text>
          </TouchableOpacity>
        )}
      </Card>

      <SectionLabel>TAX SAVING</SectionLabel>
      <Card>
        <MoneyField icon="🧾" label="80C invested this year" sub="ELSS, PPF, EPF, life insurance — limit ₹1.5L (old regime)" value={data.used80c} onCommit={v => save({ used80c: v })} />
        {computed.retirement.suggested80c > 0 && Math.round(computed.retirement.suggested80c) !== Math.round(data.used80c) && (
          <TouchableOpacity style={st.useBtn} onPress={() => save({ used80c: Math.round(computed.retirement.suggested80c) })} accessibilityRole="button">
            <Text style={st.useTxt}>Use {inr(computed.retirement.suggested80c)} from my trackers</Text>
          </TouchableOpacity>
        )}
        {computed.retirement.suggested80c > 0 && (
          <Text style={[Typography.caption, { marginTop: 6, lineHeight: 16 }]}>Estimated from your PPF-type deposits and employee EPF share. ELSS, life insurance and tuition fees also count — add those on top.</Text>
        )}
        <View style={{ paddingTop: Spacing.sm }}>
          <Bar pct={(data.used80c / 150000) * 100} color={Colors.purple} />
          <Text style={[Typography.caption, { marginTop: 6 }]}>
            {data.used80c >= 150000 ? '80C limit fully used ✓' : `₹${Math.round(150000 - data.used80c).toLocaleString('en-IN')} of the ₹1.5L limit still unused`}
          </Text>
        </View>
      </Card>
    </TrackerScreen>
  );
}

const st = StyleSheet.create({
  logCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,212,255,0.06)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.25)', borderRadius: Radii.lg, padding: Spacing.md, marginBottom: Spacing.md },
  logTitle: { ...Typography.body, fontWeight: '700', marginBottom: 2 },
  t30: { fontSize: 26, fontWeight: '900', color: Colors.gold, marginVertical: 4 },
  useBtn: { marginTop: Spacing.md, borderWidth: 1, borderColor: 'rgba(0,212,255,0.4)', backgroundColor: 'rgba(0,212,255,0.08)', borderRadius: Radii.md, paddingVertical: 11, alignItems: 'center' },
  useTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 13 },
  addLabel: { ...Typography.label, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 11, paddingVertical: 6, backgroundColor: Colors.bg },
  chipTxt: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
});

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginVertical: 6 },
  big: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  warn: { color: Colors.gold, fontSize: 12, marginTop: Spacing.md, lineHeight: 17 },
});
