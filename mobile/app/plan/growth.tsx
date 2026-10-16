import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, CheckRow, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { simulate, scenarios, validateSim, type SimInput } from '@/lib/growthSim';
import { loadSimSources, saveSimDraft, EMPTY_DRAFT, type SimDraft, type SimSources } from '@/lib/growthSimStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function GrowthScreen() {
  const [src, setSrc] = useState<SimSources | null>(null);
  const [d, setD] = useState<SimDraft | null>(null);

  useFocusEffect(useCallback(() => {
    loadSimSources().then(({ sources, draft }) => { setSrc(sources); setD(prev => prev ?? draft ?? EMPTY_DRAFT); });
  }, []));
  useEffect(() => { if (d) saveSimDraft(d); }, [d]);

  const set = (k: keyof SimDraft) => (v: string) => setD(x => (x ? { ...x, [k]: v } : x));

  const res = useMemo(() => {
    if (!d) return null;
    const blank = (s: string) => s.trim() === '';
    const input: SimInput = {
      startCorpus: blank(d.corpus) ? 0 : toNum(d.corpus),
      monthlySip: (blank(d.sip) ? 0 : toNum(d.sip)),
      stepUpPct: blank(d.stepUp) ? 0 : toNum(d.stepUp),
      years: blank(d.years) ? NaN : toNum(d.years),
      annualReturn: blank(d.ret) ? NaN : toNum(d.ret),
      inflationPct: blank(d.infl) ? null : toNum(d.infl),
    };
    const err = validateSim(input);
    return err ? { err, input, sc: null, main: null } : { err: null, input, sc: scenarios(input), main: simulate(input) };
  }, [d]);

  const sub = 'What your investments could grow to at a return you choose. A projection, not a forecast.';
  if (!d || !src || !res) return <TrackerScreen title="Growth projection" subtitle={sub}><Card><Text style={Typography.body}>Reading your holdings…</Text></Card></TrackerScreen>;

  const hasHold = src.holdingsCount > 0;
  const useHoldings = () => setD(x => (x ? { ...x, corpus: String(src.holdingsValue), sip: String(src.holdingsSip + (x.useTracker ? src.trackerSip : 0)) } : x));
  const main = res.main, sc = res.sc;
  const showPoints = main ? main.points.filter(p => p.year > 0 && (p.year % 5 === 0 || p.year === main.points.length - 1 || p.year <= 3)) : [];

  return (
    <TrackerScreen title="Growth projection" subtitle={sub}>
      <SectionLabel>WHAT YOU HAVE TODAY</SectionLabel>
      <Card>
        {hasHold ? (
          <>
            <Text style={Typography.body}>
              {`Your Portfolio tab holds ${src.holdingsCount} holding${src.holdingsCount === 1 ? '' : 's'} worth ${inr(src.holdingsValue)}${src.holdingsSip > 0 ? `, with SIPs of ${inr(src.holdingsSip)} a month across ${src.sipCount} fund${src.sipCount === 1 ? '' : 's'}` : ', with no SIP recorded'}.`}
            </Text>
            {src.unpriced > 0 ? <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>{`${src.unpriced === 1 ? '1 holding has' : `${src.unpriced} holdings have`} no fetched price, so ${src.unpriced === 1 ? 'it is' : 'they are'} valued at what you paid.`}</Text> : null}
            <Text style={s.link} accessibilityRole="button" onPress={useHoldings}>Use these figures</Text>
          </>
        ) : (
          <Text style={Typography.body}>No holdings recorded in the Portfolio tab. Type what you have invested below, or add holdings there and they can be used here.</Text>
        )}
        {src.trackerCount > 0 ? (
          <View style={{ marginTop: Spacing.sm }}>
            <CheckRow label={`Also count ${src.trackerCount} SIP${src.trackerCount === 1 ? '' : 's'} from the SIP tracker (${inr(src.trackerSip)} a month). Leave this off if those funds are already in your holdings.`}
              value={d.useTracker} onChange={v => setD(x => (x ? { ...x, useTracker: v, sip: String(src.holdingsSip + (v ? src.trackerSip : 0)) } : x))} />
          </View>
        ) : null}
      </Card>

      <SectionLabel>YOUR ASSUMPTIONS</SectionLabel>
      <Card>
        <CalcField label="INVESTED TODAY" prefix="₹" value={d.corpus} onChange={set('corpus')} sub="Leave blank if nothing." />
        <CalcField label="MONTHLY SIP" prefix="₹" value={d.sip} onChange={set('sip')} sub="Added at the start of every month." />
        <CalcField label="YEARLY STEP-UP OF THE SIP" suffix="%" value={d.stepUp} onChange={set('stepUp')} sub="Optional. Raises the SIP by this much every 12 months." />
        <CalcField label="FOR HOW MANY YEARS" value={d.years} onChange={set('years')} />
        <CalcField label="YEARLY RETURN YOU ASSUME" suffix="%" value={d.ret} onChange={set('ret')} sub="Your assumption, not data. Nothing is filled in: no one can know this number." />
        <CalcField label="YEARLY INFLATION (OPTIONAL)" suffix="%" value={d.infl} onChange={set('infl')} sub="Add it to also see the result in today's rupees." />
      </Card>

      {res.err || !main || !sc ? (
        <Card accent={Colors.gold}><Text style={Typography.body}>{res.err}</Text></Card>
      ) : (
        <>
          <SectionLabel>WHERE IT COULD GET TO</SectionLabel>
          <Card accent={Colors.cyan}>
            <Text style={Typography.label}>{`AFTER ${Math.round(res.input.years)} YEARS AT ${res.input.annualReturn}% A YEAR`}</Text>
            <Text style={s.big}>{inr(main.final)}</Text>
            <View style={s.grid}>
              <Mini label="YOU PUT IN" value={inrShort(main.invested)} />
              <Mini label="GROWTH" value={inrShort(main.gain)} color={Colors.teal} />
              {main.realFinal != null ? <Mini label="IN TODAY'S RUPEES" value={inrShort(main.realFinal)} color={Colors.gold} /> : null}
            </View>
            {res.input.stepUpPct > 0 ? <Text style={[Typography.caption, { marginTop: 4 }]}>{`The SIP rises to ${inr(main.lastMonthlySip)} a month in the last year.`}</Text> : null}
          </Card>

          <SectionLabel>IF RETURNS ARE DIFFERENT</SectionLabel>
          <Card>
            <Row label={`At ${sc.lowRate}% a year`} value={inr(sc.low.final)} sub={sc.lowRate === res.input.annualReturn ? '' : `${inrShort(sc.low.final - main.final)} against your assumption`} />
            <Row label={`At ${res.input.annualReturn}% a year (yours)`} value={inr(main.final)} sub="" strong />
            <Row label={`At ${sc.highRate}% a year`} value={inr(sc.high.final)} sub={`+${inrShort(sc.high.final - main.final)} against your assumption`} />
          </Card>

          <SectionLabel>YEAR BY YEAR</SectionLabel>
          <Card>
            {showPoints.map(p => (
              <View key={p.year} style={s.line}>
                <Text style={s.yr}>{`Year ${p.year}`}</Text>
                <Text style={Typography.caption}>{`put in ${inrShort(p.invested)}`}</Text>
                <Text style={s.val}>{inrShort(p.value)}</Text>
              </View>
            ))}
          </Card>
        </>
      )}

      <Collapsible title="What this is, and what it leaves out">
        <Bullet>It compounds your money monthly at the return you typed and adds the SIP at the start of each month. It is the same arithmetic as the Growth Simulator calculator.</Bullet>
        <Bullet>Real returns are not smooth and can be negative for years. The lower and higher lines show how much one assumption matters; they are not a range of likely outcomes.</Bullet>
        <Bullet>It is before tax, fund costs and exit loads, so what you keep will be less. Holdings are valued at the last price fetched on this phone.</Bullet>
        <Bullet>Only equity and mutual-fund holdings from the Portfolio tab are counted. EPF, NPS, PPF, deposits, gold and property are not, unless you add them to "invested today".</Bullet>
      </Collapsible>
      <Text style={s.link} accessibilityRole="button" onPress={() => router.push('/tools/calc/growth')}>Open the basic Growth Simulator calculator</Text>
    </TrackerScreen>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: '30%' }}>
      <Text style={[Typography.label, { fontSize: 9 }]}>{label}</Text>
      <Text style={[s.mini, color ? { color } : null]}>{value}</Text>
    </View>
  );
}
function Row({ label, value, sub, strong }: { label: string; value: string; sub: string; strong?: boolean }) {
  return (
    <View style={s.line}>
      <View style={{ flex: 1 }}>
        <Text style={[Typography.body, strong ? { fontWeight: '800' } : null]}>{label}</Text>
        {sub ? <Text style={Typography.caption}>{sub}</Text> : null}
      </View>
      <Text style={s.val}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  big: { fontSize: 30, fontWeight: '900', color: Colors.textPrimary, marginVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.sm },
  mini: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  yr: { width: 60, fontWeight: '700', color: Colors.textPrimary, fontSize: 13 },
  val: { marginLeft: 'auto', fontWeight: '800', color: Colors.textPrimary, fontSize: 14 },
  link: { color: Colors.cyan, fontWeight: '800', marginTop: Spacing.md },
});
