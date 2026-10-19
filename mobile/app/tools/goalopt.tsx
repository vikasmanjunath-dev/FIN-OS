import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { compute, badge, type GoalIn } from '@/lib/goalOptimizer';
import { loadGoalInputs, saveGoalPlan } from '@/lib/goalOptimizerStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { LinkButton } from '@/components/LinkButton';

export default function GoalOptimizerScreen() {
  const [goals, setGoals] = useState<GoalIn[] | null>(null);
  const [incomeT, setIncomeT] = useState('');
  const [rateT, setRateT] = useState('');
  const [seeded, setSeeded] = useState({ income: false, rate: false });
  const [now, setNow] = useState(() => new Date());

  useFocusEffect(useCallback(() => {
    setNow(new Date());
    loadGoalInputs().then(d => {
      setGoals(d.goals);
      setIncomeT(d.income ? String(d.income) : ''); setRateT(d.savingsRate ? String(d.savingsRate) : '');
      setSeeded({ income: d.income > 0, rate: d.savingsRate > 0 });
    });
  }, []));

  const income = toNum(incomeT), rate = Math.min(100, toNum(rateT));
  const r = useMemo(() => (goals ? compute(goals, { income, savingsRate: rate }, now) : null), [goals, income, rate, now]);
  useEffect(() => { if (r && r.goals.length) saveGoalPlan(r).catch(() => {}); }, [r]);

  if (!goals || !r) return <TrackerScreen title="Goal optimizer" subtitle="Which goal first, and what each needs every month."><Card><Text style={Typography.body}>Reading your goals…</Text></Card></TrackerScreen>;

  if (goals.length === 0) {
    return (
      <TrackerScreen title="Goal optimizer" subtitle="Which goal first, and what each needs every month.">
        <Card><Text style={Typography.body}>You have no goals yet. Add a few in Goals, each with a target amount and a target month, and this works out the monthly SIP each one needs and which to fund first.</Text>
          <LinkButton onPress={() => router.push('/tracker/goals')} textStyle={s.link}>Open Goals</LinkButton></Card>
      </TrackerScreen>
    );
  }

  const known = income > 0 && rate > 0;
  const fz = r.feasibility;
  const tone = !known ? Colors.textMuted : fz >= 90 ? Colors.teal : fz >= 60 ? Colors.gold : Colors.red;

  return (
    <TrackerScreen title="Goal optimizer" subtitle="For each goal: what it will really cost after inflation, the monthly SIP that gets you there, and which goals to fund first.">
      <Card accent={tone}>
        <View style={s.grid}>
          <Big label="SIP NEEDED A MONTH" value={inr(r.totalSIPNeeded)} />
          <Big label="YOU CAN SET ASIDE" value={known ? inr(r.availableSIP) : '—'} color={Colors.cyan} />
          <Big label="FEASIBILITY" value={known ? `${fz}%` : '—'} color={tone} />
        </View>
        {known ? (
          <>
            <View style={{ marginTop: Spacing.md }}><Bar pct={fz} color={tone} height={8} /></View>
            <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>
              {fz >= 100 ? 'What you can set aside covers every goal on these assumptions.'
                : `You can cover about ${fz}% of what all your goals need. Moving a deadline later, trimming a target or raising the amount you invest each month closes the gap of ${inr(Math.max(0, r.totalSIPNeeded - r.availableSIP))}.`}
            </Text>
          </>
        ) : <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>Add your monthly income and the share you can invest below to see whether the goals are affordable.</Text>}
      </Card>

      <SectionLabel>YOUR ASSUMPTIONS</SectionLabel>
      <Card>
        <CalcField label="MONTHLY INCOME" prefix="₹" value={incomeT} onChange={setIncomeT} sub={seeded.income ? 'From your profile; change it if it is wrong.' : 'Take-home pay.'} />
        <CalcField label="SHARE OF INCOME YOU CAN INVEST" suffix="%" value={rateT} onChange={setRateT}
          sub={seeded.rate ? 'Worked out from your income and spending; change it to test a different plan.' : 'For example 20 means one rupee in five.'} />
      </Card>

      <SectionLabel>GOALS, MOST URGENT FIRST</SectionLabel>
      {r.goals.map(g => {
        const b = badge(g.priority);
        const bc = b.tone === 'bad' ? Colors.red : b.tone === 'warn' ? Colors.gold : b.tone === 'good' ? Colors.teal : Colors.textMuted;
        return (
          <Card key={g.id}>
            <View style={s.head}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{g.name || g.goal || 'Goal'}</Text>
                <Text style={Typography.caption}>
                  {g.targetDate ? `${g.monthsLeft} months to go (${g.targetDate})` : 'No date set: planned over 10 years'}
                </Text>
              </View>
              <Text style={[s.badge, { color: bc, borderColor: bc }]}>{`${b.icon} ${b.label}`}</Text>
            </View>
            <View style={s.grid}>
              <Big label="TARGET TODAY" value={inrShort(Number(g.target) || Number(g.amount) || 0)} small />
              <Big label="AFTER INFLATION" value={inrShort(g.targetInflated)} small />
              <Big label="SAVED" value={`${g.progress}%`} small />
              <Big label="SIP NEEDED" value={inr(g.sipNeeded)} color={Colors.cyan} small />
            </View>
            <Bar pct={Math.min(100, g.progress)} color={g.onTrack ? Colors.teal : Colors.gold} />
            <Text style={[Typography.caption, { marginTop: 6 }]}>{`${g.onTrack ? 'On track' : 'Behind where you would like to be'} · assumes ${(g.annualR * 100).toFixed(1)}% a year`}</Text>
          </Card>
        );
      })}

      {r.conflicts.length > 0 && (
        <>
          <SectionLabel>GOALS THAT COMPETE FOR THE SAME MONEY</SectionLabel>
          {r.conflicts.map((c, i) => (
            <Card key={i} accent={Colors.gold}>
              <Text style={[Typography.body, { fontWeight: '800' }]}>{`${c.a} and ${c.b}`}</Text>
              <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
                {`They fall due within ${c.diff} month${c.diff === 1 ? '' : 's'} of each other and together need ${inr(c.combined)} a month, more than 80% of what you can set aside. Moving one of them earlier or later spreads the load.`}
              </Text>
            </Card>
          ))}
        </>
      )}

      <Collapsible title="How this is worked out, and what it leaves out">
        <Bullet>Each target is raised by 6% a year for the months left. What you have already saved grows at the goal's assumed return and is taken off before the SIP is worked out.</Bullet>
        <Bullet>Assumed returns by goal: retirement and education 10%, home and wedding 8%, car and travel 7%, emergency 6.5%, anything else 10%. These are assumptions, not forecasts, and a shorter goal should not really sit in equity.</Bullet>
        <Bullet>Priority mixes urgency (50%), how unfunded the goal is (30%) and how heavy its SIP is against your income (20%). It is a ranking aid, not a rule.</Bullet>
        <Bullet>Feasibility compares the total SIP needed with the share of income you said you can invest. It ignores that some goals end and free up money for others.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

function Big({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: small ? '22%' : '30%' }}>
      <Text style={[Typography.label, { fontSize: 9, color: Colors.textMuted }]}>{label}</Text>
      <Text style={[small ? s.small : s.big, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.sm },
  big: { fontSize: 19, fontWeight: '900', color: Colors.textPrimary, marginTop: 2 },
  small: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  name: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  badge: { fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  link: { color: Colors.cyan, fontWeight: '800', marginTop: Spacing.md },
});
