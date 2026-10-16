import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { plan, roadmap, validateProfile, validateGoals, type PlanInput } from '@/lib/lifeGoals';
import { loadPlanner, saveDraft, clearDraft, savePlanTotals, BLANK_GOAL, type PlannerForm, type Prefilled } from '@/lib/lifeGoalsStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const KIND_COLOR = { figure: Colors.textPrimary, assumption: Colors.gold, pointer: Colors.cyan } as const;

export default function LifeGoalsScreen() {
  const [form, setForm] = useState<PlannerForm | null>(null);
  const [pre, setPre] = useState<Prefilled | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback((useDraft: boolean) => {
    loadPlanner().then(r => { setPre(r); setForm(useDraft && r.draft ? r.draft : r.form); setSaved(false); });
  }, []);
  useFocusEffect(useCallback(() => { load(true); }, [load]));
  useEffect(() => { if (form) saveDraft(form); }, [form]);

  const set = (k: keyof Omit<PlannerForm, 'goals'>) => (v: string) => { setSaved(false); setForm(f => (f ? { ...f, [k]: v } : f)); };
  const setGoal = (i: number, k: 'name' | 'amount' | 'years' | 'inflation', v: string) => {
    setSaved(false);
    setForm(f => (f ? { ...f, goals: f.goals.map((g, j) => (j === i ? { ...g, [k]: v } : g)) } : f));
  };

  const calc = useMemo(() => {
    if (!form) return null;
    const age = toNum(form.age), income = toNum(form.income), surplus = toNum(form.surplus), retireAge = toNum(form.retireAge);
    const returnRate = form.returnPct.trim() === '' ? NaN : toNum(form.returnPct) / 100;
    const profileErr = validateProfile({ age, income, surplus, retireAge, returnRate });
    const g = validateGoals(form.goals.map(x => ({ name: x.name, amount: toNum(x.amount), years: toNum(x.years), inflation: x.inflation.trim() === '' ? NaN : toNum(x.inflation) / 100 })));
    const err = profileErr || g.error;
    if (err) return { err, p: null, ph: null, input: null as PlanInput | null };
    const input: PlanInput = { age, income, surplus, retireAge, returnRate, savings: toNum(form.efSaved) + toNum(form.otherSavings), goals: g.goals };
    const p = plan(input);
    return { err: null, p, input, ph: roadmap(input, p, { dependents: pre?.dependents ?? null, termCover: pre?.termCover ?? null }) };
  }, [form, pre]);

  const sub = 'Your goals in order, what each will really cost, and the monthly amount that gets you there. Worked out on this phone.';
  if (!form || !calc) return <TrackerScreen title="Life goals planner" subtitle={sub}><Card><Text style={Typography.body}>Reading what you have recorded…</Text></Card></TrackerScreen>;

  const p = calc.p;
  const tone = !p ? Colors.textMuted : p.feasPct >= 90 ? Colors.teal : p.feasPct >= 60 ? Colors.gold : Colors.red;
  const hint = (k: keyof PlannerForm, fallback: string) => (pre?.from[k] ? `From ${pre.from[k]}. Change it if it is wrong.` : fallback);

  return (
    <TrackerScreen title="Life goals planner" subtitle={sub}>
      <SectionLabel>ABOUT YOU</SectionLabel>
      <Card>
        <CalcField label="YOUR AGE" value={form.age} onChange={set('age')} sub={hint('age', 'Not recorded. Add it here or in your profile.')} />
        <CalcField label="MONTHLY INCOME (TAKE-HOME)" prefix="₹" value={form.income} onChange={set('income')} sub={hint('income', 'Not recorded.')} />
        <CalcField label="YOU CAN INVEST EACH MONTH" prefix="₹" value={form.surplus} onChange={set('surplus')}
          sub={hint('surplus', 'Not recorded. Whatever you do not invest is treated as spending, which sets the emergency fund.')} />
        <CalcField label="EMERGENCY FUND YOU HAVE" prefix="₹" value={form.efSaved} onChange={set('efSaved')} sub={hint('efSaved', 'Not recorded. Leave blank if you have none.')} />
        <CalcField label="OTHER SAVINGS TO PUT TOWARD GOALS" prefix="₹" value={form.otherSavings} onChange={set('otherSavings')}
          sub={pre?.from.otherSavings
            ? `From ${pre.from.otherSavings}. Investments and retirement accounts are not included; add what you want to count. Do not count your emergency fund twice.`
            : 'Not recorded. Add savings you could put toward goals, apart from the emergency fund.'} />
        <CalcField label="RETIREMENT AGE" value={form.retireAge} onChange={set('retireAge')} sub="Needed for the retirement line. Not filled in for you." />
        <CalcField label="YEARLY RETURN YOU ASSUME" suffix="%" value={form.returnPct} onChange={set('returnPct')}
          sub="An assumption, not data and not a promise. Try a few values to see how much the plan depends on it." />
      </Card>

      <SectionLabel>YOUR GOALS</SectionLabel>
      {pre && pre.goalsNote > 0 ? (
        <Text style={[Typography.caption, { marginBottom: Spacing.sm, lineHeight: 17 }]}>
          {`${pre.goalsNote} of your goals already has money saved in the Goals tracker. That is not subtracted here; add it to "other savings" above if it is not already there.`}
        </Text>
      ) : null}
      {form.goals.map((g, i) => (
        <Card key={i}>
          <CalcField label="GOAL" text value={g.name} onChange={v => setGoal(i, 'name', v)} placeholder="e.g. Home down payment" maxLength={60} />
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <CalcField label="TARGET, TODAY'S ₹" prefix="₹" value={g.amount} onChange={v => setGoal(i, 'amount', v)} />
            <CalcField label="IN YEARS" value={g.years} onChange={v => setGoal(i, 'years', v)} />
          </View>
          <CalcField label="INFLATION A YEAR (ASSUMPTION)" suffix="%" value={g.inflation} onChange={v => setGoal(i, 'inflation', v)} />
          {form.goals.length > 1 ? (
            <Text style={s.remove} accessibilityRole="button" onPress={() => { setSaved(false); setForm(f => (f ? { ...f, goals: f.goals.filter((_, j) => j !== i) } : f)); }}>Remove this goal</Text>
          ) : null}
        </Card>
      ))}
      <TouchableOpacity style={s.add} accessibilityRole="button" accessibilityLabel="Add a goal"
        onPress={() => setForm(f => (f ? { ...f, goals: [...f.goals, { ...BLANK_GOAL }] } : f))}>
        <Text style={s.addTxt}>＋ Add a goal</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Start again from what is recorded" onPress={() => { clearDraft().then(() => load(false)); }}>
        <Text style={[Typography.caption, { color: Colors.cyan, marginBottom: Spacing.lg }]}>Start again from what you have recorded</Text>
      </TouchableOpacity>

      {calc.err || !p || !calc.ph ? (
        <Card accent={Colors.gold}>
          <Text style={[Typography.body, { fontWeight: '800' }]}>Almost there</Text>
          <Text style={[Typography.caption, { marginTop: 4, lineHeight: 18 }]}>{calc.err}</Text>
        </Card>
      ) : (
        <>
          <SectionLabel>YOUR PLAN</SectionLabel>
          <Card accent={tone}>
            <View style={s.grid}>
              <Big label="GOALS NEED A MONTH" value={inr(p.totalSIPNeeded)} />
              <Big label="AVAILABLE FOR GOALS" value={inr(p.sipAvail)} color={Colors.cyan} />
              <Big label="COVERED" value={`${p.feasPct}%`} color={tone} />
            </View>
            <View style={{ marginTop: Spacing.md }}><Bar pct={Math.min(100, p.feasPct)} color={tone} height={8} /></View>
            <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>
              {p.totalSIPNeeded === 0
                ? 'Your savings cover every goal on these assumptions, so no monthly SIP is needed.'
                : p.feasPct >= 100
                  ? `What you can set aside covers all your goals on these assumptions (${inr(p.sipAvail)} against ${inr(p.totalSIPNeeded)}).`
                  : `What you can set aside covers about ${p.feasPct}% of what the goals need, a gap of ${inr(p.totalSIPNeeded - p.sipAvail)} a month. Moving a deadline later, trimming a target or investing more closes it.`}
            </Text>
            {p.efAlloc > 0 ? <Text style={[Typography.caption, { marginTop: 4 }]}>{`${inr(p.efAlloc)} a month of your investable amount goes to the emergency fund first.`}</Text> : null}
          </Card>

          <SectionLabel>EACH GOAL</SectionLabel>
          {p.processed.map((g, i) => {
            const share = p.totalSIPNeeded > 0 ? Math.round((g.sipNeeded / p.totalSIPNeeded) * 100) : 0;
            return (
              <Card key={i}>
                <Text style={s.name}>{g.name}</Text>
                <Text style={Typography.caption}>{`${inrShort(g.amount)} today becomes ${inrShort(g.inflatedTarget)} in ${g.years} year${g.years === 1 ? '' : 's'}`}</Text>
                <View style={[s.grid, { marginTop: Spacing.sm }]}>
                  <Big small label="SIP NEEDED" value={inr(g.sipNeeded)} color={Colors.cyan} />
                  <Big small label="FROM YOUR SAVINGS" value={inrShort(g.fromSavings)} />
                  <Big small label="SHARE OF SIP" value={`${share}%`} />
                </View>
                <Bar pct={share} color={Colors.cyan} />
              </Card>
            );
          })}

          <SectionLabel>ROADMAP</SectionLabel>
          {calc.ph.map(ph => (
            <Card key={ph.id}>
              <Text style={s.name}>{ph.title}</Text>
              <Text style={[Typography.caption, { color: Colors.cyan }]}>{ph.when}</Text>
              <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>{ph.summary}</Text>
              {ph.items.map((it, k) => (
                <View key={k} style={{ marginTop: Spacing.sm }}>
                  <Text style={[Typography.body, { lineHeight: 20, color: KIND_COLOR[it.kind] }]}>{it.text}</Text>
                  {it.href ? <Text style={s.link} accessibilityRole="button" onPress={() => router.push(it.href as never)}>Open</Text> : null}
                </View>
              ))}
            </Card>
          ))}

          <Card>
            <Text style={[Typography.caption, { lineHeight: 17 }]}>Save the totals so the Dashboard and Arya can use them. The monthly SIP, the target total and the number of goals are stored on this phone.</Text>
            <TouchableOpacity style={s.save} accessibilityRole="button" accessibilityLabel="Save plan totals" onPress={() => { savePlanTotals(p).then(() => setSaved(true)); }}>
              <Text style={s.saveTxt}>{saved ? 'Saved' : 'Save plan totals'}</Text>
            </TouchableOpacity>
          </Card>
        </>
      )}

      <Collapsible title="How this is worked out, and what it leaves out">
        <Bullet>The emergency fund comes first: 6 months of spending, taking everything you do not invest as spending. Savings above it are shared out once, nearest goal first. Up to half of what you can invest goes to filling the fund, spread over about 6 months.</Bullet>
        <Bullet>Each goal is raised by the inflation you set for the years until it is due. The SIP is the smallest monthly amount, rounded up to the next ₹500, that grows to what is left after your savings at the single yearly return you assume.</Bullet>
        <Bullet>Colour in the roadmap: white lines are worked out from your numbers, amber lines depend on an assumption you set or a common rule of thumb, cyan lines point to another screen.</Bullet>
        <Bullet>It ignores tax on gains, salary growth, goals that end and free up money, and the chance that markets deliver less than assumed. These are estimates for planning, not advice.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Big({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: small ? '30%' : '30%' }}>
      <Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted }]}>{label}</Text>
      <Text style={[small ? s.small : s.big, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.sm },
  big: { fontSize: 19, fontWeight: '900', color: Colors.textPrimary, marginTop: 2 },
  small: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  name: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  link: { color: Colors.cyan, fontWeight: '800', marginTop: 4, fontSize: 12 },
  remove: { color: Colors.red, fontWeight: '700', fontSize: 12 },
  add: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: Spacing.md },
  addTxt: { color: Colors.cyan, fontWeight: '800' },
  save: { marginTop: Spacing.md, backgroundColor: Colors.cyan, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveTxt: { color: Colors.bg, fontWeight: '900' },
});
