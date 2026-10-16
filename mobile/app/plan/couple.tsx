import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar, inr } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { overview, splitShared, goalView, EMPTY_COUPLE, type CoupleState, type Payer, type GoalStatus } from '@/lib/couple';
import { loadCouple, saveCouple, clearCouple } from '@/lib/coupleStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const numOrNull = (t: string): number | null => (t.trim() === '' ? null : Math.max(0, toNum(t)));
const show = (n: number | null) => (n === null ? '' : String(Math.round(n * 100) / 100));
const money = (n: number | null) => (n === null ? 'Not recorded' : inr(n));
const newId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const STATUS: Record<GoalStatus, { text: string; color: string }> = {
  done: { text: 'Fully funded', color: Colors.teal },
  'on-track': { text: 'On track at this pace', color: Colors.teal },
  short: { text: 'Short of the pace needed', color: Colors.gold },
  'no-contribution': { text: 'No monthly contribution yet', color: Colors.red },
  'past-date': { text: 'The target date has passed', color: Colors.red },
  'no-date': { text: 'No target date set', color: Colors.textMuted },
};

export default function CoupleScreen() {
  const [st, setSt] = useState<CoupleState | null>(null);
  const [rec, setRec] = useState<{ income: number | null; expense: number | null }>({ income: null, expense: null });
  const [now, setNow] = useState(() => new Date());

  useFocusEffect(useCallback(() => { setNow(new Date()); loadCouple().then(r => { setSt(r.state); setRec(r.recorded); }); }, []));
  useEffect(() => { if (st) saveCouple(st); }, [st]);

  const ov = useMemo(() => (st ? overview(st.a, st.b) : null), [st]);
  const split = useMemo(() => (st ? splitShared(st.shared, st.a, st.b) : null), [st]);
  const upd = (fn: (s: CoupleState) => CoupleState) => setSt(s => (s ? fn(s) : s));

  const sub = 'Two incomes, shared bills and joint goals, worked out on this phone. Your partner\'s figures never leave it.';
  if (!st || !ov || !split) return <TrackerScreen title="Couple finance" subtitle={sub}><Card><Text style={Typography.body}>Opening…</Text></Card></TrackerScreen>;

  const nameA = st.a.name.trim() || 'You', nameB = st.b.name.trim() || 'Partner';
  const rate = ov.savingsRate;

  return (
    <TrackerScreen title="Couple finance" subtitle={sub}>
      <Card accent={Colors.cyan}>
        <Text style={[Typography.caption, { lineHeight: 18, color: Colors.textPrimary }]}>
          Everything here is typed by you and kept only on this phone. It is not uploaded and not included in cloud sync, so your partner needs their own copy of the app to see the same picture. Only enter figures your partner is happy for you to hold.
        </Text>
      </Card>

      <SectionLabel>THE TWO OF YOU, EACH MONTH</SectionLabel>
      <Card>
        <CalcField label="YOUR NAME (OPTIONAL)" text value={st.a.name} onChange={v => upd(s => ({ ...s, a: { ...s.a, name: v } }))} placeholder="You" maxLength={40} />
        <CalcField label={`${nameA.toUpperCase()}: TAKE-HOME INCOME`} prefix="₹" value={show(st.a.income)} onChange={v => upd(s => ({ ...s, a: { ...s.a, income: numOrNull(v) } }))}
          sub={rec.income && st.a.income !== rec.income ? `Recorded in your profile: ${inr(rec.income)}. Tap "Use recorded figures" below.` : undefined} />
        <CalcField label={`${nameA.toUpperCase()}: SPENDING (BILLS, EMIS, EVERYTHING)`} prefix="₹" value={show(st.a.expense)} onChange={v => upd(s => ({ ...s, a: { ...s.a, expense: numOrNull(v) } }))}
          sub={rec.expense && st.a.expense !== rec.expense ? `Recorded in your Budget: ${inr(rec.expense)}.` : undefined} />
        {(rec.income && st.a.income !== rec.income) || (rec.expense && st.a.expense !== rec.expense) ? (
          <Text style={s.link} accessibilityRole="button"
            onPress={() => upd(x => ({ ...x, a: { ...x.a, income: rec.income ?? x.a.income, expense: rec.expense ?? x.a.expense } }))}>Use recorded figures</Text>
        ) : null}
      </Card>
      <Card>
        <CalcField label="PARTNER'S NAME (OPTIONAL)" text value={st.b.name} onChange={v => upd(s => ({ ...s, b: { ...s.b, name: v } }))} placeholder="Partner" maxLength={40} />
        <CalcField label={`${nameB.toUpperCase()}: TAKE-HOME INCOME`} prefix="₹" value={show(st.b.income)} onChange={v => upd(s => ({ ...s, b: { ...s.b, income: numOrNull(v) } }))} />
        <CalcField label={`${nameB.toUpperCase()}: SPENDING`} prefix="₹" value={show(st.b.expense)} onChange={v => upd(s => ({ ...s, b: { ...s.b, expense: numOrNull(v) } }))} />
      </Card>

      <SectionLabel>TOGETHER</SectionLabel>
      <Card accent={rate === null ? Colors.textMuted : rate >= 0.2 ? Colors.teal : rate >= 0 ? Colors.gold : Colors.red}>
        <View style={s.grid}>
          <Big label="JOINT INCOME" value={money(ov.jointIncome)} />
          <Big label="JOINT SPENDING" value={money(ov.jointExpense)} />
          <Big label="LEFT TO SAVE" value={money(ov.jointSavings)} color={Colors.cyan} />
        </View>
        <Text style={[Typography.caption, { lineHeight: 18, marginTop: 4 }]}>
          {rate === null ? 'Enter both incomes and both spending figures to see your joint savings rate.' : `Together you keep ${Math.round(rate * 100)}% of what you earn.`}
        </Text>
        {ov.shareA !== null && ov.shareB !== null ? (
          <View style={{ marginTop: Spacing.md }}>
            <Text style={Typography.caption}>{`Share of joint income: ${nameA} ${Math.round(ov.shareA * 100)}%, ${nameB} ${Math.round(ov.shareB * 100)}%`}</Text>
            <Bar pct={ov.shareA * 100} color={Colors.cyan} height={10} />
          </View>
        ) : null}
        <View style={[s.grid, { marginTop: Spacing.md }]}>
          <Big small label={`SAVED BY ${nameA.toUpperCase()}`} value={money(ov.savingsA)} />
          <Big small label={`SAVED BY ${nameB.toUpperCase()}`} value={money(ov.savingsB)} />
        </View>
      </Card>

      <SectionLabel>SHARED BILLS</SectionLabel>
      {st.shared.map(b => (
        <Card key={b.id}>
          <CalcField label="BILL" text value={b.label} onChange={v => upd(s => ({ ...s, shared: s.shared.map(x => (x.id === b.id ? { ...x, label: v } : x)) }))} placeholder="e.g. Rent" maxLength={60} />
          <CalcField label="A MONTH" prefix="₹" value={show(b.amount || null)} onChange={v => upd(s => ({ ...s, shared: s.shared.map(x => (x.id === b.id ? { ...x, amount: toNum(v) } : x)) }))} />
          <View style={s.chips}>
            {([['a', nameA], ['b', nameB], ['joint', 'Joint account']] as [Payer, string][]).map(([id, label]) => (
              <TouchableOpacity key={id} style={[s.chip, b.paidBy === id && s.chipOn]} accessibilityRole="button" accessibilityLabel={`${b.label || 'Bill'} paid by ${label}`}
                accessibilityState={{ selected: b.paidBy === id }} onPress={() => upd(s => ({ ...s, shared: s.shared.map(x => (x.id === b.id ? { ...x, paidBy: id } : x)) }))}>
                <Text style={[s.chipTxt, b.paidBy === id && s.chipTxtOn]}>{`Paid by ${label}`}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.remove} accessibilityRole="button" onPress={() => upd(s => ({ ...s, shared: s.shared.filter(x => x.id !== b.id) }))}>Remove this bill</Text>
        </Card>
      ))}
      <TouchableOpacity style={s.add} accessibilityRole="button" accessibilityLabel="Add a shared bill"
        onPress={() => upd(x => ({ ...x, shared: [...x.shared, { id: newId(), label: '', amount: 0, paidBy: 'a' }] }))}>
        <Text style={s.addTxt}>＋ Add a shared bill</Text>
      </TouchableOpacity>

      {split.total > 0 ? (
        <Card accent={Colors.purpleInk}>
          <Text style={[Typography.body, { fontWeight: '800' }]}>Splitting by income</Text>
          {split.fairA !== null && split.fairB !== null && split.settle !== null ? (
            <>
              <Text style={[Typography.caption, { marginTop: 4, lineHeight: 18 }]}>
                {`Shared bills paid by either of you come to ${inr(split.total)} a month. By income, ${nameA} would cover ${inr(split.fairA)} and ${nameB} ${inr(split.fairB)}. ${nameA} paid ${inr(split.paidA)} and ${nameB} paid ${inr(split.paidB)}.`}
              </Text>
              <Text style={[Typography.body, { marginTop: Spacing.sm }]}>
                {Math.abs(split.settle) < 1 ? 'You are already even.' : split.settle > 0 ? `${nameB} sends ${nameA} ${inr(split.settle)} to even it out.` : `${nameA} sends ${nameB} ${inr(-split.settle)} to even it out.`}
              </Text>
              <Text style={[Typography.caption, { marginTop: 4 }]}>
                {`A 50:50 split would instead be ${inr(split.equalA)} each${Math.abs(split.settleEqual) < 1 ? '' : split.settleEqual > 0 ? `, with ${nameB} sending ${nameA} ${inr(split.settleEqual)}` : `, with ${nameA} sending ${nameB} ${inr(-split.settleEqual)}`}.`}
              </Text>
            </>
          ) : (
            <Text style={[Typography.caption, { marginTop: 4, lineHeight: 18 }]}>{`Enter both incomes to split ${inr(split.total)} of shared bills in proportion to what each of you earns. A 50:50 split would be ${inr(split.equalA)} each.`}</Text>
          )}
          {split.jointAccount > 0 ? <Text style={[Typography.caption, { marginTop: 4 }]}>{`${inr(split.jointAccount)} a month is paid from a joint account and is left out of the settlement.`}</Text> : null}
          {split.largeItems.length > 0 ? (
            <Text style={[Typography.caption, { marginTop: 6, color: Colors.gold, lineHeight: 17 }]}>
              {`${split.largeItems.map(x => `${x.label || 'A bill'} is ${Math.round(x.share * 100)}% of your joint income`).join('; ')}. Anything above 15% is worth a conversation (the website uses the same 15% flag).`}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <SectionLabel>JOINT GOALS</SectionLabel>
      {st.goals.map(g => {
        const v = goalView(g, st.a, st.b, now);
        const status = STATUS[v.status];
        const set = (patch: Partial<typeof g>) => upd(s => ({ ...s, goals: s.goals.map(x => (x.id === g.id ? { ...x, ...patch } : x)) }));
        return (
          <Card key={g.id}>
            <CalcField label="GOAL" text value={g.title} onChange={v2 => set({ title: v2 })} placeholder="e.g. Home down payment" maxLength={60} />
            <View style={{ flexDirection: 'row', gap: Spacing.md }}>
              <CalcField label="TARGET" prefix="₹" value={show(g.target || null)} onChange={v2 => set({ target: toNum(v2) })} />
              <CalcField label="SAVED SO FAR" prefix="₹" value={show(g.current || null)} onChange={v2 => set({ current: toNum(v2) })} />
            </View>
            <CalcField label="TARGET DATE (YYYY-MM-DD, OPTIONAL)" text value={g.targetDate ?? ''} onChange={v2 => set({ targetDate: v2.trim() === '' ? null : v2.trim() })} placeholder="2028-03-31" maxLength={10} />
            <View style={{ flexDirection: 'row', gap: Spacing.md }}>
              <CalcField label={`${nameA.toUpperCase()} A MONTH`} prefix="₹" value={show(g.contribA || null)} onChange={v2 => set({ contribA: toNum(v2) })} />
              <CalcField label={`${nameB.toUpperCase()} A MONTH`} prefix="₹" value={show(g.contribB || null)} onChange={v2 => set({ contribB: toNum(v2) })} />
            </View>
            <Bar pct={v.pct} color={status.color} />
            <Text style={[Typography.caption, { marginTop: 6, color: status.color, fontWeight: '700' }]}>{`${v.pct}% · ${status.text}`}</Text>
            {v.remaining > 0 ? (
              <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
                {`${inr(v.remaining)} to go.${v.monthsToFinish !== null ? ` At ${inr(v.monthly)} a month that takes about ${v.monthsToFinish} month${v.monthsToFinish === 1 ? '' : 's'}.` : ''}`}
                {v.requiredMonthly !== null ? ` To finish by the date you would need ${inr(v.requiredMonthly)} a month${v.suggestedA !== null && v.suggestedB !== null ? `, which by income is ${inr(v.suggestedA)} from ${nameA} and ${inr(v.suggestedB)} from ${nameB}` : ''}.` : ''}
              </Text>
            ) : null}
            {g.target > 0 && g.targetDate && Number.isNaN(Date.parse(g.targetDate)) ? <Text style={[Typography.caption, { color: Colors.red }]}>That date is not valid. Use the form 2028-03-31.</Text> : null}
            <Text style={s.remove} accessibilityRole="button" onPress={() => upd(s => ({ ...s, goals: s.goals.filter(x => x.id !== g.id) }))}>Remove this goal</Text>
          </Card>
        );
      })}
      <TouchableOpacity style={s.add} accessibilityRole="button" accessibilityLabel="Add a joint goal"
        onPress={() => upd(x => ({ ...x, goals: [...x.goals, { id: newId(), title: '', target: 0, current: 0, targetDate: null, contribA: 0, contribB: 0 }] }))}>
        <Text style={s.addTxt}>＋ Add a joint goal</Text>
      </TouchableOpacity>

      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Delete all couple data from this phone" onPress={() => { clearCouple().then(() => setSt(EMPTY_COUPLE)); }}>
        <Text style={[s.remove, { marginTop: Spacing.lg }]}>Delete all couple data from this phone</Text>
      </TouchableOpacity>

      <Collapsible title="What this is, and what it leaves out">
        <Bullet>It is arithmetic on figures you type. It does not link two accounts, so the website's invite code and the Family plan are not needed.</Bullet>
        <Bullet>Goal progress adds contributions with no interest, so it is a savings pace and not an investment projection.</Bullet>
        <Bullet>The website's "top 20% of couples" message is not here: there is no data behind it.</Bullet>
        <Bullet>Splitting bills in proportion to income is one fair way to do it, not the only one. Estimates for planning, not advice.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Big({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: small ? '45%' : '30%' }}>
      <Text style={[Typography.label, { fontSize: 9 }]}>{label}</Text>
      <Text style={[small ? s.small : s.big, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  big: { fontSize: 17, fontWeight: '900', color: Colors.textPrimary, marginTop: 2 },
  small: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: Colors.bg },
  chipOn: { borderColor: Colors.cyan, backgroundColor: Colors.surfaceAlt },
  chipTxt: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  chipTxtOn: { color: Colors.cyan },
  add: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: Spacing.md },
  addTxt: { color: Colors.cyan, fontWeight: '800' },
  remove: { color: Colors.red, fontWeight: '700', fontSize: 12 },
  link: { color: Colors.cyan, fontWeight: '800', marginTop: 4 },
});
