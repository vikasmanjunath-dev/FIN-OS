import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';
import { MarketScreen, Freshness, KV, Chip } from '@/components/MarketUI';
import { Card, SectionLabel, inr } from '@/components/TrackerUI';
import { CalcField, toNum } from '@/components/CalcUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadOverview } from '@/lib/marketDataApi';
import { greeks, STRATEGIES, summarisePayoff, payoffCurve, payoffAt, validateLegs, DEFAULT_RISK_FREE, type OptionType, type StrategyDef, type Leg } from '@/lib/marketDataOptions';
import { FRESH_MS, fmtPrice } from '@/lib/marketData';
import { useThemed } from '@/lib/theme';
import { Colors, Spacing, Typography } from '@/constants/theme';

function PayoffChart({ legs, height = 170 }: { legs: Leg[]; height?: number }) {
  const T = useThemed();
  const [w, setW] = useState(0);
  const ks = legs.map(l => l.strike);
  const from = Math.max(0, Math.min(...ks) * 0.85), to = Math.max(...ks) * 1.15;
  const pts = useMemo(() => payoffCurve(legs, from, to, 80), [legs, from, to]);
  const lo = Math.min(...pts.map(p => p.pl), 0), hi = Math.max(...pts.map(p => p.pl), 0), span = hi - lo || 1;
  const pl = 6, pt = 10, pb = 22;
  const x = (s: number) => pl + ((s - from) / (to - from)) * (w - 2 * pl);
  const y = (v: number) => pt + (1 - (v - lo) / span) * (height - pt - pb);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.s).toFixed(1)} ${y(p.pl).toFixed(1)}`).join(' ');
  return (
    <View style={{ height }} onLayout={e => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel="Profit or loss at expiry for each possible final price of the underlying">
      {w > 0 && (
        <Svg width={w} height={height}>
          <Line x1={pl} x2={w - pl} y1={y(0)} y2={y(0)} stroke={T(Colors.borderHi)} strokeDasharray="3 4" />
          <Path d={d} fill="none" stroke={T(Colors.cyan)} strokeWidth={2} strokeLinejoin="round" />
          <SvgText x={pl} y={height - 6} fill={T(Colors.textMuted)} fontSize={10}>{fmtPrice(from)}</SvgText>
          <SvgText x={w - pl} y={height - 6} fill={T(Colors.textMuted)} fontSize={10} textAnchor="end">{fmtPrice(to)}</SvgText>
        </Svg>
      )}
    </View>
  );
}

export default function OptionsScreen() {
  const ov = useMarketResource(() => loadOverview(), [], 0);
  const nifty = ov.data?.indices['NIFTY 50'], vix = ov.data?.indices['INDIA VIX'];
  const [spot, setSpot] = useState(''), [strike, setStrike] = useState(''), [days, setDays] = useState(''), [iv, setIv] = useState(''), [rf, setRf] = useState(String(DEFAULT_RISK_FREE * 100));
  const [type, setType] = useState<OptionType>('call');
  const g = greeks({ spot: toNum(spot), strike: toNum(strike), days: toNum(days), ivPct: toNum(iv), type, riskFree: toNum(rf) / 100 });
  const filled = spot.trim() && strike.trim() && days.trim() && iv.trim();

  const [sid, setSid] = useState<StrategyDef['id']>('bull_call_spread');
  const def = STRATEGIES.find(s => s.id === sid)!;
  const [vals, setVals] = useState<Record<string, string>>({});
  const setV = (id: string, v: string) => setVals(p => ({ ...p, [`${sid}:${id}`]: v }));
  const getV = (id: string) => vals[`${sid}:${id}`] ?? '';
  const numbers = Object.fromEntries(def.fields.map(f => [f.id, getV(f.id).trim() === '' ? NaN : toNum(getV(f.id))]));
  const ready = def.fields.every(f => Number.isFinite(numbers[f.id]));
  const legs = ready ? def.build(numbers) : [];
  const bad = ready ? validateLegs(legs) : null;
  const sum = ready && !bad ? summarisePayoff(legs) : null;
  const fillModel = () => {
    const days_ = toNum(days), iv_ = toNum(iv), rf_ = toNum(rf) / 100, sp = toNum(spot);
    const next = { ...vals };
    const probe = def.build(Object.fromEntries(def.fields.map(f => [f.id, Number.isFinite(numbers[f.id]) ? numbers[f.id] : 1])));
    // premium fields appear in the same order as the option legs
    const premFields = def.fields.filter(f => f.kind === 'premium');
    const optLegs = probe.filter(l => l.kind !== 'shares');
    premFields.forEach((f, i) => {
      const leg = optLegs[i];
      const gk = leg ? greeks({ spot: sp, strike: leg.strike, days: days_, ivPct: iv_, type: leg.kind as OptionType, riskFree: rf_ }) : null;
      if (gk) next[`${sid}:${f.id}`] = gk.price.toFixed(2);
    });
    setVals(next);
  };
  const canFill = !!g && def.fields.filter(f => f.kind === 'strike').every(f => Number.isFinite(numbers[f.id]));
  const rs = (n: number | null) => (n === null ? 'No limit' : (n < 0 ? '−' : '') + inr(Math.abs(n)));

  return (
    <MarketScreen title="Options calculator" subtitle="Black-Scholes price and Greeks, and the profit or loss at expiry of simple strategies, from numbers you type." refreshing={ov.refreshing} onRefresh={ov.reload}>
      <Card accent={Colors.gold}>
        <Text style={Typography.label}>WHAT THIS IS, AND IS NOT</Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
          A textbook model: European exercise, no dividends, one steady volatility, the interest rate you give. Real option prices differ. There is no option chain here: the app has no source of live option prices, and the website's chain and "IV rank" are simulated, so they are not copied. Options can lose their whole premium, and selling them can lose far more. Education, not a recommendation.
        </Text>
      </Card>

      <SectionLabel>NIFTY TODAY (FOR REFERENCE)</SectionLabel>
      <Freshness savedAt={ov.savedAt} fromCache={ov.fromCache} error={ov.error} freshMs={FRESH_MS.quote} loading={ov.loading} />
      <Card>
        <KV label="Nifty 50" value={nifty ? fmtPrice(nifty.price) : 'Not available'} />
        <KV label="India VIX" value={vix ? vix.price.toFixed(2) : 'Not available'} sub="NSE's measure of expected Nifty volatility over the next 30 days, in % a year. Not the implied volatility of any one option." />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {nifty ? <Chip label="Use Nifty as spot" onPress={() => setSpot(String(nifty.price))} accessibilityLabel="Use the Nifty level as the spot price" /> : null}
          {vix ? <Chip label="Use VIX as volatility" onPress={() => setIv(vix.price.toFixed(2))} accessibilityLabel="Use India VIX as the volatility" /> : null}
        </View>
      </Card>

      <SectionLabel>PRICE AND GREEKS</SectionLabel>
      <Card>
        <View style={{ flexDirection: 'row', gap: 8 }}><CalcField label="Spot price" prefix="₹" value={spot} onChange={setSpot} placeholder="e.g. 23000" /><CalcField label="Strike price" prefix="₹" value={strike} onChange={setStrike} placeholder="e.g. 23000" /></View>
        <View style={{ flexDirection: 'row', gap: 8 }}><CalcField label="Days to expiry" value={days} onChange={setDays} placeholder="e.g. 7" /><CalcField label="Volatility (% a year)" value={iv} onChange={setIv} placeholder="e.g. 15" /></View>
        <CalcField label="Risk-free rate (% a year)" sub="6.5% is the website's value. Change it to a current government bond or T-bill yield." value={rf} onChange={setRf} />
        <View style={{ flexDirection: 'row' }}>
          <Chip label="Call" active={type === 'call'} onPress={() => setType('call')} accessibilityLabel="Call option" />
          <Chip label="Put" active={type === 'put'} onPress={() => setType('put')} accessibilityLabel="Put option" />
        </View>
        {g ? (
          <>
            <KV label={`Model price of the ${type}`} value={`₹${fmtPrice(g.price)}`} sub={`${g.moneyness}. The model's value, not a market quote.`} />
            <KV label="Delta" value={g.delta.toFixed(3)} sub="Change in the option price for a ₹1 move in the spot" />
            <KV label="Gamma" value={g.gamma.toFixed(4)} sub="Change in delta for a ₹1 move" />
            <KV label="Theta per day" value={`${g.theta < 0 ? "−" : ""}₹${Math.abs(g.theta).toFixed(2)}`} sub="Value lost each calendar day, other things equal" />
            <KV label="Vega per 1% volatility" value={`₹${g.vega.toFixed(2)}`} sub="Change in value if volatility moves by 1 point" />
          </>
        ) : <Text style={Typography.caption}>{filled ? 'Spot, strike, days (1 to 3650) and volatility (above 0 up to 500) must be positive numbers.' : 'Fill in all four boxes to see the model price and Greeks. Nothing is assumed for you.'}</Text>}
      </Card>

      <SectionLabel>STRATEGY AT EXPIRY</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {STRATEGIES.map(s => <Chip key={s.id} label={s.name} active={sid === s.id} onPress={() => setSid(s.id)} accessibilityLabel={`Strategy: ${s.name}`} />)}
      </View>
      <Card>
        <Text style={Typography.body}>{def.summary}</Text>
        <Text style={[Typography.caption, { marginTop: 4, marginBottom: Spacing.sm }]}>{def.risk}</Text>
        {def.fields.reduce<typeof def.fields[]>((rows, f, i) => { if (i % 2 === 0) rows.push([f]); else rows[rows.length - 1].push(f); return rows; }, []).map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
            {row.map(f => <CalcField key={f.id} label={f.label} prefix={f.kind === 'qty' ? undefined : '₹'} value={getV(f.id)} onChange={v => setV(f.id, v)} placeholder={f.kind === 'qty' ? 'units' : '0'} />)}
            {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}
        <Text style={Typography.caption}>Units are your own number (shares or the contract size you trade); no lot size is assumed. Premiums are what you actually pay or get.</Text>
        {def.fields.some(f => f.kind === 'premium') ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fill the premiums with model prices" disabled={!canFill} onPress={fillModel} style={{ marginTop: 8, opacity: canFill ? 1 : 0.4 }}>
            <Text style={{ color: Colors.cyan, fontWeight: '700' }}>Fill premiums with model prices ›</Text>
            <Text style={Typography.caption}>Uses the spot, days, volatility and rate above. Model values, not market premiums.</Text>
          </TouchableOpacity>
        ) : null}
        {bad ? <Text style={[Typography.caption, { color: Colors.red, marginTop: 6 }]} accessibilityRole="alert">{bad}</Text> : null}
        {!ready ? <Text style={[Typography.caption, { marginTop: 6 }]}>Fill every box to see the result.</Text> : null}
      </Card>
      {sum ? (
        <Card>
          <PayoffChart legs={legs} />
          <Text style={[Typography.caption, { marginVertical: 4 }]}>Profit or loss in rupees if the underlying ends at each price on the day of expiry. Dashed line: break-even (zero). Before brokerage, taxes and charges.</Text>
          <KV label="Most you can gain" value={rs(sum.maxProfit)} color={Colors.teal} />
          <KV label="Most you can lose" value={rs(sum.maxLoss)} color={Colors.red} />
          <KV label="Break-even at expiry" value={sum.breakevens.length ? sum.breakevens.map(b => fmtPrice(b)).join(' and ') : 'None'} />
          <KV label={sum.netPremium >= 0 ? 'Premium paid up front' : 'Premium received up front'} value={inr(Math.abs(sum.netPremium))} />
          {legs.length ? <Text style={Typography.caption}>{`Check: at a final price of ${fmtPrice(legs[0].strike)} the profit or loss is ${rs(payoffAt(legs, legs[0].strike))}.`}</Text> : null}
        </Card>
      ) : null}
    </MarketScreen>
  );
}
