import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MarketScreen, KV } from '@/components/MarketUI';
import { Card, SectionLabel, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, toNum } from '@/components/CalcUI';
import { PortfolioCone } from '@/components/PortfolioCone';
import { EmptyPortfolio, NotAdvice, usePortfolioViews, usePortfolioHistory } from '@/components/PortfolioUI';
import { simulateCone, validateCone, LIMITS, type ConeAssumptions } from '@/lib/portfolioSimulate';
import { buildRetro, riskMetrics } from '@/lib/portfolioHistory';
import { Colors, Spacing, Typography } from '@/constants/theme';

// Starting values, shown as such on screen. They are placeholders to edit, not forecasts.
const DEFAULTS = { ret: '10', vol: '15', years: '10', sip: '0', paths: '2000', seed: '2026' };

export default function PortfolioSimulate() {
  const { views, loaded, total } = usePortfolioViews();
  const [ret, setRet] = useState(DEFAULTS.ret), [vol, setVol] = useState(DEFAULTS.vol), [years, setYears] = useState(DEFAULTS.years);
  const [sip, setSip] = useState(DEFAULTS.sip), [paths, setPaths] = useState(DEFAULTS.paths), [seed, setSeed] = useState(DEFAULTS.seed);
  const [wantHist, setWantHist] = useState(false);
  const hist = usePortfolioHistory(views, wantHist);
  const retro = useMemo(() => (hist.data?.bench ? buildRetro(hist.data.series, hist.data.bench) : null), [hist.data]);
  const past = useMemo(() => (retro ? riskMetrics(retro, 6.5) : null), [retro]);

  const a: ConeAssumptions = { startValue: total, annualReturnPct: toNum(ret), annualVolPct: toNum(vol), years: toNum(years), monthlyContribution: toNum(sip), paths: toNum(paths), seed: toNum(seed) };
  const err = total > 0 ? validateCone(a) : null;
  const cone = useMemo(() => (total > 0 && !err ? simulateCone(a) : null), [total, ret, vol, years, sip, paths, seed]);  // eslint-disable-line react-hooks/exhaustive-deps
  const pct = (n: number, base: number) => `${n >= base ? '+' : '−'}${Math.abs(((n - base) / base) * 100).toFixed(0)}%`;

  return (
    <MarketScreen title="Portfolio simulation" subtitle="A range of possible futures for your portfolio's value, from assumptions you set.">
      {!views.length ? <EmptyPortfolio loaded={loaded} /> : (
        <>
          <Card accent={Colors.gold}>
            <Text style={Typography.label}>HOW TO READ THIS</Text>
            <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
              This is not a forecast. It replays thousands of random years that follow the return and volatility YOU enter, and shows where they ended. Change the assumptions and the picture changes. The same settings and seed always give the same picture. Real markets have crashes and long flat spells that a smooth model understates.
            </Text>
          </Card>

          <SectionLabel>STARTING POINT</SectionLabel>
          <Card><KV label="Your portfolio today" value={inr(total)} sub="Sum of units × last saved price; a holding without a saved market price is counted at cost. Saved prices may be stale." /></Card>
          {total <= 0 ? <Card><Text style={Typography.body}>Simulation needs a positive starting portfolio value.</Text><Text style={Typography.caption}>Add holdings with positive units and a saved price or cost in Portfolio.</Text></Card> : null}

          <SectionLabel>ASSUMPTIONS (EDIT THESE)</SectionLabel>
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <CalcField label="Return (% a year)" value={ret} onChange={setRet} />
              <CalcField label="Volatility (% a year)" value={vol} onChange={setVol} />
            </View>
            <Text style={Typography.caption}>{`Starting values ${DEFAULTS.ret}% and ${DEFAULTS.vol}% are placeholders so the screen is not blank; they are not predictions. Return is before inflation, fees and tax. Allowed: return ${LIMITS.annualReturnPct[0]} to ${LIMITS.annualReturnPct[1]}%, volatility ${LIMITS.annualVolPct[0]} to ${LIMITS.annualVolPct[1]}%.`}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: Spacing.md }}>
              <CalcField label="Years" value={years} onChange={setYears} />
              <CalcField label="Added each month (₹)" value={sip} onChange={setSip} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <CalcField label="Paths" value={paths} onChange={setPaths} />
              <CalcField label="Seed" value={seed} onChange={setSeed} />
            </View>
            <Text style={Typography.caption}>Monthly addition is 0 unless you set it. The seed fixes the random numbers: keep it to get the same result again, change it to see how much the picture depends on luck.</Text>
          </Card>

          <SectionLabel>WHAT YOUR HOLDINGS DID LAST YEAR (OPTIONAL)</SectionLabel>
          <Card>
            {!wantHist ? (
              <>
                <Text style={Typography.caption}>Work out how much your current holdings, combined at today's weights, swung over the last year, to help you choose a volatility. Downloads a year of prices for each holding.</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Measure last year's volatility of my holdings" onPress={() => setWantHist(true)} style={{ marginTop: 8 }}>
                  <Text style={{ color: Colors.cyan, fontWeight: '700' }}>Measure it ›</Text>
                </TouchableOpacity>
              </>
            ) : hist.status === 'loading' ? <Text style={Typography.caption} accessibilityRole="alert">{`Loading price history… ${Math.round(hist.progress * 100)}%`}</Text>
              : past ? (
                <>
                  <KV label="Volatility of your holdings, last year" value={`${past.volPct.toFixed(1)}% a year`} sub={`From ${past.days} daily moves, ${past.startDate} to ${past.endDate}, at today's weights${retro && retro.coveragePct < 99 ? `; covers ${retro.coveragePct.toFixed(0)}% of your portfolio's value` : ''}`} />
                  <KV label="Price return over that year" value={`${past.totalReturnPct >= 0 ? '+' : '−'}${Math.abs(past.totalReturnPct).toFixed(1)}%`} sub="Shown for context only. Past returns do not tell you the return to assume." />
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Use ${past.volPct.toFixed(1)} percent as the volatility`} onPress={() => setVol(past.volPct.toFixed(1))} style={{ marginTop: 8 }}>
                    <Text style={{ color: Colors.cyan, fontWeight: '700' }}>Use {past.volPct.toFixed(1)}% as the volatility ›</Text>
                  </TouchableOpacity>
                </>
              ) : <Text style={Typography.caption}>{hist.data?.benchError ?? 'Not enough price history came back to measure this.'} Enter a volatility yourself.</Text>}
          </Card>

          {err ? <Card><Text style={[Typography.body, { color: Colors.red }]} accessibilityRole="alert">{err}</Text></Card> : null}

          {cone ? (
            <>
              <SectionLabel>THE RANGE</SectionLabel>
              <Card>
                <PortfolioCone cone={cone} />
                <Text style={[Typography.label, { marginTop: Spacing.md }]}>{`AFTER ${a.years} YEARS`}</Text>
                <KV label="Unlucky (1 in 20 is worse)" value={inrShort(cone.final.p5)} sub={pct(cone.final.p5, cone.putIn) + ' vs money put in'} color={Colors.red} />
                <KV label="Below middle" value={inrShort(cone.final.p25)} />
                <KV label="Middle outcome" value={inrShort(cone.final.p50)} sub={pct(cone.final.p50, cone.putIn) + ' vs money put in'} />
                <KV label="Above middle" value={inrShort(cone.final.p75)} />
                <KV label="Lucky (1 in 20 is better)" value={inrShort(cone.final.p95)} sub={pct(cone.final.p95, cone.putIn) + ' vs money put in'} color={Colors.teal} />
                <KV label="Paths ending below the money put in" value={`${cone.probBelowPutInPct.toFixed(1)}%`} sub={`Money put in: ${inr(cone.putIn)} (today's value plus every monthly addition). Rupees, before inflation and tax.`} />
              </Card>
              <Card>
                <Text style={Typography.label}>ASSUMPTIONS USED</Text>
                <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
                  {`Start ${inr(a.startValue)}; expected return ${a.annualReturnPct}% a year; volatility ${a.annualVolPct}% a year; ${a.years} years; ${inr(a.monthlyContribution)} added each month; ${a.paths.toLocaleString('en-IN')} random paths; seed ${a.seed}. Monthly steps: each month's return is ${(cone.monthlyMu * 100).toFixed(3)}% on average with a ${(cone.monthlySigma * 100).toFixed(2)}% random swing, independent from month to month, so the middle outcome ends a little below the plain compounded figure. No inflation, fees, tax, withdrawals or rebalancing.`}
                </Text>
              </Card>
            </>
          ) : null}
          <NotAdvice extra="The path rule is the website's Monte Carlo (each step multiplies by 1 + average + swing × a normal random number), with a fixed seed instead of fresh randomness." />
        </>
      )}
    </MarketScreen>
  );
}
