import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, inr, inrShort } from '@/components/TrackerUI';
import { CalcField, Collapsible, Bullet, toNum } from '@/components/CalcUI';
import { compute, splitNewMoney, CLASSES, CLASS_META, PRESETS, DRIFT_THRESHOLD, DEFAULT_TARGET, type Alloc, type AssetClass } from '@/lib/rebalancer';
import { loadRebalancer, saveTarget } from '@/lib/rebalancerStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

const advice = (k: AssetClass, action: 'buy' | 'sell', amt: number): string => {
  const a = inrShort(amt);
  if (action === 'buy') {
    return ({
      equity: `Add ${a} through your equity SIP or an index fund.`,
      debt: `Put ${a} in an FD or a liquid / short-duration debt fund.`,
      gold: `Add ${a} through a Sovereign Gold Bond window or a gold ETF.`,
      realestate: 'Property is illiquid; a REIT is the liquid way to add some.',
      crypto: `Add ${a} only if you are comfortable with it: crypto gains are taxed at a flat 30% and a loss cannot be set off.`,
      govt: `Raise your PPF / NPS contribution or EPF VPF by ${a} over the year.`,
    } as Record<AssetClass, string>)[k];
  }
  return ({
    equity: `Trim ${a} from equity. Long-term gains up to ₹1.25L a year are tax-free, so spread any sale across years.`,
    debt: `Let ${a} of deposits mature and redeploy it, or exit a debt fund (check the exit load).`,
    gold: `Trim ${a} of gold ETF. Hold SGBs to maturity for a tax-free redemption.`,
    realestate: 'Do not sell property to rebalance. Send new money to the classes that are under target instead.',
    crypto: `Book ${a} of crypto. Gains are taxed at a flat 30% and 1% TDS applies.`,
    govt: 'EPF, NPS and PPF are locked in. Do not stop contributing; send extra money to other classes.',
  } as Record<AssetClass, string>)[k];
};

export default function RebalanceScreen() {
  const [data, setData] = useState<{ values: Alloc; target: Alloc; saved: boolean } | null>(null);
  const [target, setTarget] = useState<Alloc>(DEFAULT_TARGET);
  const [fresh, setFresh] = useState('');
  useFocusEffect(useCallback(() => { loadRebalancer().then(d => { setData(d); setTarget(d.target); }); }, []));

  const r = useMemo(() => (data ? compute(data.values, target) : null), [data, target]);
  const sum = CLASSES.reduce((s, k) => s + (target[k] || 0), 0);
  const split = useMemo(() => (r ? splitNewMoney(r, toNum(fresh)) : []), [r, fresh]);

  if (!data || !r) return <TrackerScreen title="Rebalancer" subtitle="Where your money is, against where you want it."><Card><Text style={Typography.body}>Reading your holdings…</Text></Card></TrackerScreen>;

  const change = (next: Alloc) => { setTarget(next); const rr = compute(data.values, next); saveTarget(next, rr.rebalanceNeeded).catch(() => {}); };
  const empty = r.totalPortfolio <= 0;
  const tone = empty ? Colors.textMuted : r.rebalanceNeeded ? Colors.gold : Colors.teal;

  return (
    <TrackerScreen title="Portfolio rebalancer" subtitle="Your money across equity, debt, gold, property, crypto and government savings, against the mix you want.">
      <Card accent={tone}>
        {empty ? (
          <Text style={Typography.body}>No holdings found yet. Add your portfolio, deposits, gold and retirement accounts and they appear here.</Text>
        ) : (
          <>
            <Text style={Typography.label}>TOTAL TRACKED</Text>
            <Text style={s.hero}>{inr(r.totalPortfolio)}</Text>
            <Text style={[Typography.body, { color: tone, fontWeight: '800' }]}>
              {r.rebalanceNeeded ? `⚠ At least one class is more than ${DRIFT_THRESHOLD} points from its target` : `✓ Every class is within ${DRIFT_THRESHOLD} points of its target`}
            </Text>
          </>
        )}
      </Card>

      {!empty && (
        <>
          <SectionLabel>CURRENT vs TARGET</SectionLabel>
          {CLASSES.map(k => {
            const c = r.classes[k], m = CLASS_META[k];
            if (c.currentValue === 0 && c.targetPct === 0) return null;
            const verb = c.action === 'buy' ? 'ADD' : c.action === 'sell' ? 'TRIM' : 'HOLD';
            const vc = c.action === 'buy' ? Colors.cyan : c.action === 'sell' ? Colors.gold : Colors.teal;
            return (
              <Card key={k}>
                <View style={s.head}>
                  <Text style={s.icon}>{m.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{m.label}</Text>
                    <Text style={Typography.caption}>{`${inr(c.currentValue)} · ${c.currentPct.toFixed(1)}% now · target ${c.targetPct.toFixed(1)}%`}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.verb, { color: vc }]}>{verb}</Text>
                    {c.action !== 'hold' && <Text style={s.amt}>{inrShort(c.actionAmount)}</Text>}
                  </View>
                </View>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${Math.min(100, c.currentPct)}%`, backgroundColor: m.color }]} />
                  <View style={[s.mark, { left: `${Math.min(100, c.targetPct)}%` }]} />
                </View>
                {c.action !== 'hold' && <Text style={[Typography.caption, { marginTop: 6, lineHeight: 17 }]}>{advice(k, c.action, c.actionAmount)}</Text>}
              </Card>
            );
          })}

          <SectionLabel>HAVE NEW MONEY TO INVEST?</SectionLabel>
          <Card>
            <CalcField label="AMOUNT" prefix="₹" value={fresh} onChange={setFresh} sub="Adding to the classes below target avoids selling anything, so there is no capital-gains tax or exit load." />
            {split.length > 0 && split.map(x => (
              <View key={x.cls} style={s.row}>
                <Text style={Typography.body}>{`${CLASS_META[x.cls].icon} ${CLASS_META[x.cls].label}`}</Text>
                <Text style={s.amt}>{inr(x.amount)}</Text>
              </View>
            ))}
            {toNum(fresh) > 0 && split.length === 0 && <Text style={Typography.caption}>No class is below its target, so there is nothing to top up.</Text>}
          </Card>
        </>
      )}

      <SectionLabel>YOUR TARGET MIX</SectionLabel>
      <Card>
        <View style={s.chips}>
          {PRESETS.map(p => (
            <TouchableOpacity key={p.name} style={s.chip} onPress={() => change({ ...p.vals })} accessibilityRole="button" accessibilityLabel={`Use the ${p.name} mix`}>
              <Text style={s.chipTxt}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {CLASSES.map(k => (
          <CalcField key={k} label={`${CLASS_META[k].icon} ${CLASS_META[k].label.toUpperCase()}`} sub={CLASS_META[k].desc} suffix="%" value={String(target[k] ?? 0)}
            onChange={v => change({ ...target, [k]: Math.max(0, Math.min(100, toNum(v))) })} />
        ))}
        <Text style={[Typography.caption, { color: sum === 100 ? Colors.teal : Colors.gold }]}>
          {sum === 100 ? 'The targets add up to 100%.' : `The targets add up to ${sum}%; they are scaled to 100% when comparing.`}
        </Text>
      </Card>

      <Collapsible title="How to use this, and what it leaves out">
        <Bullet>The classes come from your other trackers: equity is the Portfolio tab plus imported and SIP funds, debt is Deposits, and Govt savings is EPF + NPS + PPF.</Bullet>
        <Bullet>A class is flagged when it is more than 5 percentage points from its target. Rebalancing once a year, or when that happens, is usually enough; doing it more often mostly adds costs.</Bullet>
        <Bullet>Selling can trigger capital-gains tax, exit loads and brokerage. Directing new money to the underweight classes does the same job for free.</Bullet>
        <Bullet>Property and government savings are not realistically sold to rebalance, so they are best treated as fixed and the rest adjusted around them.</Bullet>
        <Bullet>Your emergency fund and your home are not counted here. This is a way to compare mixes, not personalised investment advice.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  hero: { fontSize: 30, fontWeight: '900', color: Colors.textPrimary, marginVertical: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  icon: { fontSize: 22 },
  name: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  verb: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  amt: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary },
  track: { height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 6 },
  mark: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: Colors.textPrimary, opacity: 0.8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md },
  chip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: Colors.borderMed, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  chipTxt: { fontSize: 12, fontWeight: '700', color: Colors.cyan },
});
