import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { Chips, EquityChart, GroupBars, NOT_ADVICE, Notice, Tile, profitColor, useJournal, s } from '@/components/JournalUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { PERIODS, byDirection, byInstrument, byMonth, bySetup, bySymbol, byTag, byWeekday, equityCurve, inPeriod, pctText, pnlText, rate, summarize, todayISO, type Period } from '@/lib/tradeJournal';

export default function AnalyticsScreen() {
  const { data } = useJournal();
  const [period, setPeriod] = useState<Period>('all');
  const v = useMemo(() => {
    if (!data) return null;
    const trades = inPeriod(data.trades, period, todayISO(new Date()));
    const { rated } = rate(trades);
    return { sum: summarize(trades), rated, curve: equityCurve(rated), months: byMonth(rated) };
  }, [data, period]);

  return (
    <TrackerScreen title="Analytics" subtitle="Totals and breakdowns of the trades you logged, after the charges you recorded.">
      <Notice>{NOT_ADVICE} Past results are a record, not a forecast.</Notice>
      <Chips label="Period" options={PERIODS} value={period} onChange={(p: Period) => setPeriod(p || 'all')} allowClear={false} />
      {!data || !v ? <Card><Text style={Typography.body}>Reading your journal…</Text></Card> : v.sum.count === 0 ? (
        <Card><Text style={Typography.h3}>Nothing to analyse</Text><Text style={[Typography.caption, { marginTop: 6, lineHeight: 18 }]}>{data.trades.length ? 'No trade in this period has a known profit.' : 'Add trades first. Every figure here comes from your own entries.'}</Text></Card>
      ) : (
        <>
          <Card accent={profitColor(v.sum.net)}>
            <Text style={Typography.label}>NET PROFIT</Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: profitColor(v.sum.net) }}>{pnlText(v.sum.net, { sign: true })}</Text>
            <Text style={Typography.caption}>Gross {pnlText(v.sum.gross, { sign: true })} less charges {pnlText(v.sum.charges)} · {v.sum.count} trades on {v.sum.tradingDays} days</Text>
            {v.sum.noCharges > 0 && <Text style={[Typography.caption, { color: Colors.orange, marginTop: 4 }]}>{v.sum.noCharges} of {v.sum.count} {v.sum.count === 1 ? 'trade has' : 'trades have'} no charges recorded: net profit may be overstated.</Text>}
            {v.sum.unrated > 0 && <Text style={[Typography.caption, { color: Colors.orange, marginTop: 4 }]}>{v.sum.unrated} {v.sum.unrated === 1 ? 'trade' : 'trades'} with no known profit {v.sum.unrated === 1 ? 'is' : 'are'} left out.</Text>}
          </Card>
          <Card>
            <View style={s.tiles}>
              <Tile label="WIN RATE" value={pctText(v.sum.winRate)} sub={`${v.sum.wins} won · ${v.sum.losses} lost · ${v.sum.breakeven} even`} />
              <Tile label="AVERAGE WIN" value={pnlText(v.sum.avgWin)} />
              <Tile label="AVERAGE LOSS" value={v.sum.avgLoss === null ? '—' : pnlText(-v.sum.avgLoss)} />
              <Tile label="WIN ÷ LOSS SIZE" value={v.sum.payoff === null ? '—' : v.sum.payoff.toFixed(2)} sub="average win over average loss" />
              <Tile label="PROFIT FACTOR" value={v.sum.profitFactor === null ? (v.sum.grossLoss === 0 ? 'No losses' : '—') : v.sum.profitFactor.toFixed(2)} sub="total won over total lost" />
              <Tile label="AVG PER TRADE" value={pnlText(v.sum.expectancy, { sign: true })} sub="net, all trades" />
              <Tile label="BEST TRADE" value={pnlText(v.sum.best, { sign: true })} />
              <Tile label="WORST TRADE" value={pnlText(v.sum.worst, { sign: true })} />
              <Tile label="MAX DRAWDOWN" value={pnlText(v.sum.maxDrawdown)} sub={v.sum.drawdownFrom ? `${v.sum.drawdownFrom} to ${v.sum.drawdownTo}` : 'no fall from a peak'} />
              <Tile label="LONGEST STREAKS" value={`${v.sum.streaks.maxWin} W / ${v.sum.streaks.maxLoss} L`} sub="a breakeven ends a streak" />
            </View>
            <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 16 }]}>Max drawdown is the biggest fall of your running total from its highest point (the total starts at ₹0). It is in rupees because the journal does not know your capital.</Text>
          </Card>
          <SectionLabel>RUNNING TOTAL</SectionLabel>
          <Card><EquityChart points={v.curve} /><Text style={[Typography.caption, { marginTop: 4 }]}>Net profit added up trade by trade, oldest first. The dashed line is ₹0.</Text></Card>
          <SectionLabel>BY MONTH</SectionLabel>
          <Card><GroupBars groups={v.months.slice(-12)} empty="No months yet." />{v.months.length > 12 && <Text style={Typography.caption}>The latest 12 of {v.months.length} months.</Text>}</Card>
          <SectionLabel>BY WEEKDAY</SectionLabel>
          <Card><GroupBars groups={byWeekday(v.rated)} empty="No days yet." /></Card>
          <SectionLabel>BY SETUP</SectionLabel>
          <Card><GroupBars groups={bySetup(v.rated)} empty="No setups recorded." /></Card>
          <SectionLabel>BY TAG</SectionLabel>
          <Card><GroupBars groups={byTag(v.rated, data.tags)} empty="No tags used on these trades." /><Text style={Typography.caption}>A trade with two tags is counted under both, so these rows do not add up to the total.</Text></Card>
          <SectionLabel>BY INSTRUMENT AND SIDE</SectionLabel>
          <Card><GroupBars groups={bySymbol(v.rated).slice(0, 10)} empty="" /></Card>
          <Card><GroupBars groups={byInstrument(v.rated)} empty="" /></Card>
          <Card><GroupBars groups={byDirection(v.rated)} empty="" /></Card>
          <Text style={[Typography.caption, { lineHeight: 17 }]}>Sharpe, Sortino, Calmar and Kelly figures are not shown: they need returns measured against your capital, which this journal does not hold.</Text>
        </>
      )}
    </TrackerScreen>
  );
}
