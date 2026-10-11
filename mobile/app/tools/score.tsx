import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Segmented, CheckRow, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { compute, deriveInputs, leverRanges, whatIf, trend as scoreTrend } from '@/lib/moneyScore';
import { gatherScoreData, loadSavedScore, loadScoreHistory, saveScoreResult } from '@/lib/moneyScoreStorage';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

type Form = Record<'age' | 'monthlyIncome' | 'monthlyExpenses' | 'monthlyEmi' | 'monthlyInvesting' | 'liquidSavings' | 'investedTotal' | 'termCover' | 'healthCover', string>;
const EMPTY: Form = { age: '', monthlyIncome: '', monthlyExpenses: '', monthlyEmi: '', monthlyInvesting: '', liquidSavings: '', investedTotal: '', termCover: '', healthCover: '' };

const TONE: Record<string, string> = { error: Colors.red, warn: Colors.gold, good: Colors.teal, great: Colors.cyan };
// Where each "next move" leads inside the app (the website's own links point at web pages)
const MOVE: Record<string, { route: string; cta: string }> = {
  'debt-high': { route: '/tools/prepay', cta: 'Plan the payoff' },
  debt: { route: '/tools/prepay', cta: 'Prepay or invest?' },
  emergency: { route: '/tracker/emergency', cta: 'Open the emergency fund' },
  insurance: { route: '/tracker/insurance', cta: 'Check your cover' },
  savings: { route: '/tracker/subscriptions', cta: 'Find the leaks' },
  investing: { route: '/(tabs)/portfolio', cta: 'Open your portfolio' },
  wealth: { route: '/tracker/networth', cta: 'See your net worth' },
};
const LEVERS: { key: string; label: string; unit: string }[] = [
  { key: 'spendLess', label: 'Spend less each month', unit: '/month' },
  { key: 'investMore', label: 'Invest more each month', unit: '/month' },
  { key: 'emiLess', label: 'Bring EMIs down by', unit: '/month' },
  { key: 'cashAdd', label: 'Add to emergency savings', unit: '' },
  { key: 'termAdd', label: 'Add term life cover', unit: '' },
  { key: 'healthAdd', label: 'Add health cover', unit: '' },
];
const SOURCE_TEXT = (s?: string) => (s ? `✓ From ${s}. Edit if it is off.` : undefined);

const numStr = (v: unknown) => (Number(v) > 0 ? String(Math.round(Number(v))) : '');

export default function MoneyScoreScreen() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [dependents, setDependents] = useState<'0' | '1' | '2' | '3'>('0');
  const [highDebt, setHighDebt] = useState(false);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const [ctx, setCtx] = useState<{ leakMonthly: number }>({ leakMonthly: 0 });
  const [levers, setLevers] = useState<Record<string, number>>({});
  const [delta, setDelta] = useState<{ delta: number; since: string } | null>(null);

  const fillFrom = (v: Record<string, any>) => {
    setForm({
      age: numStr(v.age), monthlyIncome: numStr(v.monthlyIncome), monthlyExpenses: numStr(v.monthlyExpenses), monthlyEmi: numStr(v.monthlyEmi),
      monthlyInvesting: numStr(v.monthlyInvesting), liquidSavings: numStr(v.liquidSavings), investedTotal: numStr(v.investedTotal),
      termCover: numStr(v.termCover), healthCover: numStr(v.healthCover),
    });
    const d = String(Math.min(3, Math.max(0, Math.round(Number(v.dependents) || 0)))) as '0' | '1' | '2' | '3';
    setDependents(d);
    setHighDebt(!!v.highInterestDebt);
  };

  useEffect(() => {
    (async () => {
      const [saved, hist, g] = await Promise.all([loadSavedScore(), loadScoreHistory(), gatherScoreData()]);
      const c = { leakMonthly: g.leakMonthly || 0 };
      setCtx(c);
      if (saved && saved.inputs) {
        const r: any = compute(saved.inputs, c);
        if (r.ok) { fillFrom(saved.inputs); setResult(r); setDelta(scoreTrend(hist)); setReady(true); return; }
      }
      // First time: fill in what the app already knows, and say where each answer came from
      const d = deriveInputs(g.data);
      const values: Record<string, any> = { ...d.values };
      const src: Record<string, string> = { ...d.sources };
      if (!values.healthCover && g.healthCover > 0) { values.healthCover = g.healthCover; src.healthCover = 'your insurance tracker'; }
      if (!values.monthlyExpenses && g.budgetExpense > 0) { values.monthlyExpenses = g.budgetExpense; src.monthlyExpenses = 'your budget'; }
      fillFrom(values);
      setSources(src);
      setEditing(true);
      setReady(true);
    })();
  }, []);

  const raw = useMemo(() => ({
    age: toNum(form.age), dependents: Number(dependents), monthlyIncome: toNum(form.monthlyIncome), monthlyExpenses: toNum(form.monthlyExpenses),
    monthlyEmi: toNum(form.monthlyEmi), monthlyInvesting: toNum(form.monthlyInvesting), liquidSavings: toNum(form.liquidSavings),
    investedTotal: toNum(form.investedTotal), termCover: toNum(form.termCover), healthCover: toNum(form.healthCover), highInterestDebt: highDebt,
  }), [form, dependents, highDebt]);

  const set = (k: keyof Form) => (v: string) => { setForm(f => ({ ...f, [k]: v })); setSources(s => { const { [k]: _, ...rest } = s; return rest; }); };

  const calculate = async () => {
    const r: any = compute(raw, ctx);
    if (!r.ok) { setErrors(r.errors ?? []); return; }
    setErrors([]);
    const { history } = await saveScoreResult(r);
    setResult(r);
    setDelta(scoreTrend(history));
    setLevers({});
    setEditing(false);
  };

  const what: any = useMemo(() => (result ? whatIf(result.inputs, levers, ctx) : null), [result, levers, ctx]);
  const ranges = useMemo(() => (result ? leverRanges(result.inputs) : null), [result]);
  const moved = Object.values(levers).some(v => v > 0);

  const bump = (key: string, dir: 1 | -1) => {
    if (!ranges) return;
    const { step, max } = ranges[key];
    setLevers(l => ({ ...l, [key]: Math.min(max, Math.max(0, (l[key] ?? 0) + dir * step)) }));
  };

  const share = async () => {
    if (!result) return;
    const parts = result.pillars.map((p: any) => `${p.label} ${p.score}`).join(' · ');
    try {
      await Share.share({ message: `My FIN·OS Money Score is ${result.score}/100 — ${result.band.label}.\n${parts}\nWorked out privately on my phone.` });
    } catch { /* cancelled */ }
  };

  if (!ready) {
    return <TrackerScreen title="Money Score" subtitle="Loading what you already track…"><View /></TrackerScreen>;
  }

  return (
    <TrackerScreen title="Money Score" subtitle="A 60-second check of your whole money picture: one number, why, and the three moves that would raise it most. Worked out on this phone — nothing is uploaded.">
      {result && !editing && (
        <>
          <Card accent={TONE[result.band.tone] ?? Colors.cyan}>
            <View style={s.scoreRow}>
              <Text style={[s.score, { color: TONE[result.band.tone] ?? Colors.cyan }]}>{result.score}</Text>
              <View style={{ flex: 1, paddingLeft: Spacing.md }}>
                <Text style={[Typography.body, { fontWeight: '900', fontSize: 18 }]}>{result.band.label}</Text>
                <Text style={Typography.caption}>out of 100</Text>
                {delta && delta.delta !== 0 && (
                  <Text style={[Typography.caption, { color: delta.delta > 0 ? Colors.teal : Colors.red, marginTop: 2 }]}>
                    {delta.delta > 0 ? '▲' : '▼'} {Math.abs(delta.delta)} since {delta.since}
                  </Text>
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.md }}>
              <TouchableOpacity onPress={() => setEditing(true)} accessibilityRole="button"><Text style={s.link}>Edit my answers</Text></TouchableOpacity>
              <TouchableOpacity onPress={share} accessibilityRole="button"><Text style={s.link}>Share my score</Text></TouchableOpacity>
            </View>
          </Card>

          <SectionLabel>WHY THIS SCORE</SectionLabel>
          <Card>
            {result.pillars.map((p: any, i: number) => (
              <View key={p.id} style={[i > 0 && { marginTop: Spacing.md }]}>
                <View style={s.pillarHead}>
                  <Text style={s.pillarName}>{p.label} <Text style={Typography.caption}>· worth {p.weight}</Text></Text>
                  <Text style={[s.pillarScore, { color: p.score >= 70 ? Colors.teal : p.score >= 40 ? Colors.gold : Colors.red }]}>{p.score}</Text>
                </View>
                <Bar pct={p.score} color={p.score >= 70 ? Colors.teal : p.score >= 40 ? Colors.gold : Colors.red} height={6} />
                <Text style={[Typography.caption, { marginTop: 4, lineHeight: 16 }]}>{p.detail}</Text>
              </View>
            ))}
          </Card>

          {result.actions.length > 0 && (
            <>
              <SectionLabel>YOUR NEXT MOVES</SectionLabel>
              {result.actions.map((a: any, i: number) => {
                const m = MOVE[a.id];
                return (
                  <Card key={a.id} accent={a.urgent ? Colors.red : Colors.cyan}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={[Typography.body, { fontWeight: '800', flex: 1, paddingRight: Spacing.sm }]}>{i + 1}. {a.title}</Text>
                      <Text style={[s.gain, a.urgent && { color: Colors.red }]}>+{a.gain} pts</Text>
                    </View>
                    <Text style={[Typography.caption, { marginTop: 6, lineHeight: 17 }]}>{a.detail}</Text>
                    {m && (
                      <TouchableOpacity onPress={() => router.push(m.route as any)} style={{ marginTop: Spacing.md }} accessibilityRole="button">
                        <Text style={s.link}>{m.cta} →</Text>
                      </TouchableOpacity>
                    )}
                  </Card>
                );
              })}
            </>
          )}

          {ranges && LEVERS.some(l => ranges[l.key].max > 0) && (
            <>
              <SectionLabel>WHAT IF…</SectionLabel>
              <Card>
                {LEVERS.filter(l => ranges[l.key].max > 0).map(l => {
                  const v = levers[l.key] ?? 0;
                  return (
                    <View key={l.key} style={s.leverRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={Typography.body}>{l.label}</Text>
                        <Text style={Typography.caption}>{v > 0 ? `${inr(v)}${l.unit}` : `up to ${inrShort(ranges[l.key].max)}${l.unit}`}</Text>
                      </View>
                      <TouchableOpacity style={[s.step, v <= 0 && { opacity: 0.4 }]} onPress={() => bump(l.key, -1)} disabled={v <= 0} accessibilityRole="button" accessibilityLabel={`Less: ${l.label}`}>
                        <Text style={s.stepTxt}>−</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.step, v >= ranges[l.key].max && { opacity: 0.4 }]} onPress={() => bump(l.key, 1)} disabled={v >= ranges[l.key].max} accessibilityRole="button" accessibilityLabel={`More: ${l.label}`}>
                        <Text style={s.stepTxt}>+</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
                <Text style={[Typography.body, { marginTop: Spacing.md, lineHeight: 21 }]}>
                  {moved && what?.ok
                    ? <>Your score would be <Text style={{ fontWeight: '900', color: Colors.cyan }}>{what.after}</Text> ({what.delta >= 0 ? '+' : ''}{what.delta}){what.bandAfter.id !== what.bandBefore.id ? ` — ${what.bandAfter.label}` : ''}.{what.surplusAfter < 0 ? ' Heads up: this plan spends more than you earn.' : ''}</>
                    : `Your score is ${result.score}. Tap + to see the effect.`}
                </Text>
                {moved && <TouchableOpacity onPress={() => setLevers({})} style={{ marginTop: Spacing.sm }}><Text style={s.linkMuted}>Reset</Text></TouchableOpacity>}
              </Card>
            </>
          )}

          <Collapsible title="How the score is worked out">
            <Bullet>Six parts, each 0–100, weighted: savings rate 20, emergency fund 20, insurance 20, debt load 15, investing habit 15, wealth for your age 10.</Bullet>
            <Bullet>Full marks need: keeping 20% of income, six months of spending in savings, term cover of 10× annual income if people depend on you plus health cover, EMIs under 10% of income, investing 15% of income, and invested assets in line with your age.</Bullet>
            <Bullet>Each next move's "+points" is found by re-scoring with that fix applied. High-interest debt and a nearly empty emergency fund always come first.</Bullet>
            <Bullet>Rules of thumb for learning, not personalised investment advice.</Bullet>
          </Collapsible>
        </>
      )}

      {(editing || !result) && (
        <>
          <SectionLabel>ABOUT YOU</SectionLabel>
          <Card>
            <CalcField label="YOUR AGE" value={form.age} onChange={set('age')} placeholder="30" sub={SOURCE_TEXT(sources.age)} />
            <Segmented label="PEOPLE WHO DEPEND ON YOUR INCOME (SPOUSE, CHILDREN, PARENTS)" value={dependents} onChange={setDependents}
              options={[{ id: '0', label: 'None' }, { id: '1', label: '1' }, { id: '2', label: '2' }, { id: '3', label: '3 or more' }]} />
          </Card>

          <SectionLabel>EVERY MONTH</SectionLabel>
          <Card>
            <CalcField label="TAKE-HOME INCOME" prefix="₹" value={form.monthlyIncome} onChange={set('monthlyIncome')} placeholder="75000" sub={SOURCE_TEXT(sources.monthlyIncome) ?? 'After tax and PF'} />
            <CalcField label="SPENDING (RENT, FOOD, BILLS, FUN)" prefix="₹" value={form.monthlyExpenses} onChange={set('monthlyExpenses')} placeholder="35000" sub={SOURCE_TEXT(sources.monthlyExpenses) ?? 'Required — not counting EMIs'} />
            <CalcField label="LOAN EMIs" prefix="₹" value={form.monthlyEmi} onChange={set('monthlyEmi')} placeholder="0" sub={SOURCE_TEXT(sources.monthlyEmi) ?? 'Home, car, personal, education'} />
            <CalcField label="YOU INVEST" prefix="₹" value={form.monthlyInvesting} onChange={set('monthlyInvesting')} placeholder="10000" sub={SOURCE_TEXT(sources.monthlyInvesting) ?? 'SIPs, PPF, NPS, EPF top-ups'} />
          </Card>

          <SectionLabel>WHAT YOU HAVE</SectionLabel>
          <Card>
            <CalcField label="SAVINGS YOU CAN REACH IN A DAY" prefix="₹" value={form.liquidSavings} onChange={set('liquidSavings')} placeholder="150000" sub={SOURCE_TEXT(sources.liquidSavings) ?? 'Savings account, liquid funds, FDs'} />
            <CalcField label="TOTAL INVESTED SO FAR" prefix="₹" value={form.investedTotal} onChange={set('investedTotal')} placeholder="500000" sub={SOURCE_TEXT(sources.investedTotal) ?? 'Mutual funds, stocks, EPF, PPF, NPS, gold'} />
            <CalcField label="TERM LIFE COVER" prefix="₹" value={form.termCover} onChange={set('termCover')} placeholder="0" sub={SOURCE_TEXT(sources.termCover) ?? 'Sum assured — skip employer cover'} />
            <CalcField label="HEALTH INSURANCE COVER" prefix="₹" value={form.healthCover} onChange={set('healthCover')} placeholder="0" sub={SOURCE_TEXT(sources.healthCover) ?? 'Personal or family floater'} />
            <CheckRow label="I carry credit-card or personal-loan debt at 24% a year or more." value={highDebt} onChange={setHighDebt} />
          </Card>

          {errors.length > 0 && (
            <View style={s.errBox} accessibilityLiveRegion="polite">
              {errors.map((e, i) => <Text key={i} style={s.errTxt}>• {e}</Text>)}
            </View>
          )}
          <TouchableOpacity style={s.primary} onPress={calculate} accessibilityRole="button">
            <Text style={s.primaryTxt}>{result ? 'Update my score' : 'Calculate my score'}</Text>
          </TouchableOpacity>
          {result && <TouchableOpacity onPress={() => { setEditing(false); setErrors([]); }} style={{ alignItems: 'center', padding: Spacing.md }}><Text style={s.linkMuted}>Cancel</Text></TouchableOpacity>}
        </>
      )}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  score: { fontSize: 64, fontWeight: '900', letterSpacing: -2, lineHeight: 70 },
  link: { color: Colors.cyan, fontWeight: '800', fontSize: 13 },
  linkMuted: { color: Colors.textMuted, fontWeight: '700', fontSize: 12 },
  pillarHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  pillarName: { ...Typography.body, fontWeight: '700' },
  pillarScore: { fontSize: 15, fontWeight: '900' },
  gain: { color: Colors.teal, fontWeight: '900', fontSize: 14 },
  leverRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  step: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: Colors.borderMed, alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.sm, backgroundColor: Colors.bg },
  stepTxt: { color: Colors.cyan, fontSize: 20, fontWeight: '800', lineHeight: 22 },
  primary: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm },
  primaryTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
  errBox: { borderWidth: 1, borderColor: Colors.red + '55', backgroundColor: Colors.red + '10', borderRadius: Radii.md, padding: Spacing.md, marginBottom: Spacing.sm },
  errTxt: { color: Colors.red, fontSize: 12, lineHeight: 18 },
});
