import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { TrackerScreen, Card, SectionLabel, Bar, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet } from '@/components/CalcUI';
import { FanChart } from '@/components/FanChart';
import { simulate, solveContribution } from '@/lib/montecarlo';
import { computePlan, mcConfig, verdictFor, type Plan } from '@/lib/retirementPlan';
import { loadRetirementStore, saveRetirementInput, persistRetirementOutputs } from '@/lib/retirementStorage';
import { Colors, Spacing, Radii, Typography, Btn } from '@/constants/theme';

const TONE = { good: Colors.teal, warn: Colors.gold, bad: Colors.red } as const;

const FIELDS: { key: string; label: string; suffix?: string; prefix?: string; sub?: string; ph: string }[] = [
  { key: 'finos_retire_age', label: 'RETIRE AT AGE', ph: '60' },
  { key: 'finos_retire_exp_mo', label: 'MONTHLY SPENDING IN RETIREMENT (TODAY\'S ₹)', prefix: '₹', ph: '' },
  { key: 'finos_retire_current_age', label: 'YOUR AGE', sub: 'Required if EPF/NPS has no valid date of birth. No age is assumed.', ph: '' },
  { key: 'finos_retire_inflation', label: 'INFLATION', suffix: '% a year', ph: '6' },
  { key: 'finos_retire_return', label: 'RETURN BEFORE RETIREMENT', suffix: '% a year', ph: '10' },
  { key: 'finos_retire_monthly_invest', label: 'YOU INVEST EACH MONTH', prefix: '₹', ph: '0' },
  { key: 'finos_retire_stepup', label: 'YEARLY STEP-UP', suffix: '%', ph: '0' },
  { key: 'finos_retire_end_age', label: 'PLAN TO AGE', ph: '90' },
  { key: 'finos_retire_eq_return', label: 'EQUITY RETURN', suffix: '% a year', ph: '12' },
];

interface Odds { pct: number; atRet: { p10: number; p50: number; p90: number }; depletion: { medianAge: number; p10Age: number } | null; real: any[]; nominal: any[]; runs: number }

export default function RetirementScreen() {
  const [store, setStore] = useState<Record<string, string> | null>(null);
  const [odds, setOdds] = useState<Odds | null>(null);
  const [running, setRunning] = useState(false);
  const [basis, setBasis] = useState<'real' | 'nominal'>('real');
  const [solved, setSolved] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadRetirementStore().then(setStore); }, []);

  const read = (k: string) => (store ? store[k] ?? null : null);
  const plan: Plan | null = useMemo(() => (store ? computePlan(read) : null), [store]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cfg = useMemo(() => (plan?.ready && store ? mcConfig(plan, read) : null), [plan, store]);   // eslint-disable-line react-hooks/exhaustive-deps
  const hasMoney = !!cfg && (cfg.assets.some((a: any) => a.value > 0) || cfg.monthlyContribution > 0);

  useEffect(() => { if (plan) persistRetirementOutputs(plan).catch(() => {}); }, [plan]);

  // Run the simulation shortly after the inputs settle, so typing never waits on 4,000 futures
  useEffect(() => {
    if (!cfg || !hasMoney) { setOdds(null); return; }
    setRunning(true); setSolved(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const r: any = simulate(cfg);
        const atRet = r.realBands.find((b: any) => b.age === cfg.retireAge) || r.realBands[r.realBands.length - 1];
        setOdds({ pct: Math.round(r.successRate * 100), atRet, depletion: r.depletion, real: r.realBands, nominal: r.bands, runs: r.runs });
      } catch { setOdds(null); }
      setRunning(false);
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [cfg, hasMoney]);

  const edit = (key: string) => (v: string) => {
    const clean = v.replace(/,/g, '');
    setStore(s => ({ ...(s ?? {}), [key]: clean }));
    saveRetirementInput(key, clean);
  };

  const solve = () => {
    if (!cfg) return;
    setSolved('Solving…');
    setTimeout(() => {
      const sip: number | null = (solveContribution as any)(cfg, 0.85);
      setSolved(sip === null
        ? 'Not reachable by investing more alone — try a later retirement age or lower spending.'
        : `${inr(sip)} a month${cfg.stepUp ? ` (with your ${Math.round(cfg.stepUp * 100)}% yearly step-up)` : ''}`);
    }, 30);
  };

  if (!store || !plan) return <TrackerScreen title="Retirement planner" subtitle="Loading what you already track…"><ActivityIndicator color={Colors.cyan} /></TrackerScreen>;

  const surplus = plan.corpusGap <= 0;
  const covered = Math.max(0, Math.min(100, plan.requiredCorpus > 0 ? (plan.totalCorpus / plan.requiredCorpus) * 100 : 0));
  const sources: [string, number][] = [
    ['EPF', plan.epfProjected], ['NPS lump sum', plan.npsLumpSum], ['NPS Tier 2', plan.npsTier2Projected], ['PPF', plan.ppfProjected],
    ['Mutual-fund SIPs', plan.sipProjected], ['Stocks & MF holdings', plan.equityProj], ['Fixed deposits', plan.fdProjected],
    ['Gold', plan.goldProjected], ['Other savings', plan.manualCorpus],
  ];
  const verdict = odds ? verdictFor(odds.pct) : null;

  return (
    <TrackerScreen title="Retirement planner" subtitle="What your EPF, NPS, PPF, SIPs and savings add up to by retirement, whether it covers your spending, and the odds it lasts. Uses what you already track; nothing is uploaded.">
      <Card accent={!plan.ready ? Colors.gold : surplus ? Colors.teal : Colors.orange}>
        {!plan.ready ? (
          <Text accessibilityRole="alert" style={[Typography.body, { color: Colors.gold, lineHeight: 20 }]}>{plan.ageNow <= 0 ? 'Add your current age below, or record a valid date of birth in your EPF or NPS tracker.' : 'Enter your expected monthly retirement spending below, in today’s rupees.'} Projections and simulations stay hidden until both are recorded.</Text>
        ) : <>
        <Text style={Typography.label}>PROJECTED CORPUS AT {plan.retireAge}</Text>
        <Text style={s.big}>{inrShort(plan.totalCorpus)}</Text>
        <Bar pct={covered} color={surplus ? Colors.teal : Colors.orange} height={8} />
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 16 }]}>
          This counts what you hold today, grown to {plan.retireAge}. It leaves out what you will keep investing — the odds below include that.
        </Text>
        <Text style={[Typography.caption, { marginTop: 6, lineHeight: 17 }]}>
          Needed: {inrShort(plan.requiredCorpus)} (25× your yearly spending of {inrShort(plan.inflatedAnnualExp)} at {plan.retireAge}, a 4% safe withdrawal).
        </Text>
        <Text style={[Typography.body, { marginTop: Spacing.sm, fontWeight: '800', color: surplus ? Colors.teal : Colors.orange }]}>
          {surplus ? `Surplus of ${inrShort(-plan.corpusGap)}` : `Gap of ${inrShort(plan.corpusGap)}`}
        </Text>
        <View style={s.two}>
          <View style={{ flex: 1 }}>
            <Text style={Typography.label}>MONTHLY INCOME THEN</Text>
            <Text style={s.mid}>{inr(plan.totalMonthlyIncome)}</Text>
            <Text style={Typography.caption}>covers {Math.round(plan.expCoverage)}% of {inr(plan.inflatedMonthlyExp)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={Typography.label}>YEARS LEFT / RUNWAY</Text>
            <Text style={s.mid}>{plan.yearsLeft} yrs</Text>
            <Text style={Typography.caption}>corpus = {plan.runwayYears.toFixed(1)} yrs of spending</Text>
          </View>
        </View>
        </>}
      </Card>

      <SectionLabel>WILL IT LAST? (4,000 SIMULATED FUTURES)</SectionLabel>
      <Card accent={verdict ? TONE[verdict.tone] : undefined}>
        {!hasMoney && <Text style={Typography.body}>{!plan.ready ? (plan.ageNow <= 0 ? 'Record your age in the assumptions below (or a date of birth in EPF/NPS) before running the simulation.' : 'Enter monthly spending in the assumptions below before running the simulation.') : 'Add your EPF, NPS, PPF or investments in their trackers, or enter what you invest each month below, to see the odds.'}</Text>}
        {hasMoney && running && !odds && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><ActivityIndicator color={Colors.cyan} /><Text style={Typography.caption}>Running 4,000 simulated futures…</Text></View>}
        {odds && verdict && cfg && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[s.pct, { color: TONE[verdict.tone] }]}>{odds.pct}%</Text>
              <Text style={[Typography.caption, { flex: 1, marginLeft: Spacing.md, lineHeight: 17 }]}>chance your money lasts to age {cfg.endAge}{running ? ' · updating…' : ''}</Text>
            </View>
            <Text style={[Typography.body, { fontWeight: '700', marginTop: Spacing.sm }]}>{verdict.label}</Text>
            <Text style={[Typography.caption, { marginTop: 6, lineHeight: 18 }]}>
              {odds.depletion
                ? `In the runs that fail, money typically runs out around age ${Math.round(odds.depletion.medianAge)} (worst 10%: ${Math.round(odds.depletion.p10Age)}). `
                : 'No simulated run ran out of money. '}
              At {cfg.retireAge} your corpus is most likely {inrShort(odds.atRet.p50)} in today's ₹ — range {inrShort(odds.atRet.p10)} to {inrShort(odds.atRet.p90)}.
            </Text>
            <TouchableOpacity style={s.secondary} onPress={solve} accessibilityRole="button"><Text style={s.secondaryTxt}>What monthly SIP gets me to 85%?</Text></TouchableOpacity>
            {solved && <Text style={[Typography.body, { marginTop: Spacing.sm, fontWeight: '800', color: Colors.teal }]}>{solved}</Text>}
          </>
        )}
      </Card>

      {odds && cfg && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
            <Text style={Typography.label}>CORPUS BY AGE</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['real', 'nominal'] as const).map(b => (
                <TouchableOpacity key={b} onPress={() => setBasis(b)} style={[s.chip, basis === b && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: basis === b }}>
                  <Text style={[s.chipTxt, basis === b && { color: Colors.cyan }]}>{b === 'real' ? "Today's ₹" : 'Future ₹'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <FanChart bands={basis === 'real' ? odds.real : odds.nominal} retireAge={cfg.retireAge} />
          <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 16 }]}>
            {odds.runs.toLocaleString('en-IN')} simulated futures: equity {(cfg.assets[0].mean * 100).toFixed(0)}% ± 18, debt 7.5% ± 3.5, gold 8% ± 14; inflation {(cfg.inflation * 100).toFixed(0)}% ± 1.5. Your holdings: equity {inrShort(cfg.assets[0].value)} · debt {inrShort(cfg.assets[1].value)} · gold {inrShort(cfg.assets[2].value)}.
          </Text>
        </Card>
      )}

      <SectionLabel>WHERE THE CORPUS COMES FROM</SectionLabel>
      <Card>
        {!plan.ready ? <Text style={Typography.caption}>Corpus projections appear after you record your age and expected monthly spending.</Text> : sources.filter(([, v]) => v > 0).map(([label, v]) => (
          <View key={label} style={s.row}>
            <Text style={Typography.body}>{label}</Text>
            <Text style={[Typography.body, { fontWeight: '800' }]}>{inrShort(v)}</Text>
          </View>
        ))}
        {sources.every(([, v]) => v <= 0) && <Text style={Typography.caption}>Nothing tracked yet — add EPF, NPS, PPF, SIPs or net-worth assets and they appear here.</Text>}
        {plan.epsPension > 0 || plan.npsAnnuityMo > 0 ? (
          <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>Plus a monthly pension of {inr(plan.epsPension + plan.npsAnnuityMo)} (EPS {inr(plan.epsPension)}, NPS annuity {inr(plan.npsAnnuityMo)}).</Text>
        ) : null}
      </Card>

      <SectionLabel>YOUR ASSUMPTIONS</SectionLabel>
      <Card>
        {FIELDS.map(f => (
          <CalcField key={f.key} label={f.label} prefix={f.prefix} suffix={f.suffix} sub={f.sub} placeholder={f.ph}
            value={store[f.key] ?? ''} onChange={edit(f.key)} />
        ))}
      </Card>

      <Collapsible title="How this is worked out">
        <Bullet>Projected corpus: each tracked pot grows to your retirement age — EPF 8.25%, PPF 7.1%, NPS 8.5%, fixed deposits 7%, gold 8%, SIPs and holdings at your portfolio return. NPS is split into the lump sum you can take and the part that becomes a pension (annuity at about 7%).</Bullet>
        <Bullet>Needed corpus: today's monthly spending inflated to your retirement year, times 12, times 25 (the 4% rule).</Bullet>
        <Bullet>The odds: each simulated future draws a different return for equity, debt and gold every year and a different inflation path, adds your contributions until retirement, then withdraws your inflated spending (less pension). A run fails the first year the money can't cover it.</Bullet>
        <Bullet>An illustration based on assumptions, not a promise or personal advice. Real returns, tax, health costs and your own plans will differ.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  big: { fontSize: 34, fontWeight: '900', color: Colors.textPrimary, marginVertical: 6 },
  mid: { fontSize: 17, fontWeight: '900', color: Colors.textPrimary, marginTop: 4 },
  pct: { fontSize: 52, fontWeight: '900', letterSpacing: -1 },
  two: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  secondary: { ...Btn.base, borderWidth: 1, borderColor: Colors.cyan + '66', marginTop: Spacing.md },
  secondaryTxt: { ...Btn.text, color: Colors.cyan },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 10, paddingVertical: 5 },
  chipOn: { borderColor: Colors.cyan + 'AA', backgroundColor: Colors.cyan + '18' },
  chipTxt: { fontSize: 11, color: Colors.textMuted, fontWeight: '700' },
});
