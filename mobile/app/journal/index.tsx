import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { EquityChart, Notice, Tile, Chips, NOT_ADVICE, profitColor, useJournal, s } from '@/components/JournalUI';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { equityCurve, newestFirst, netOf, pnlText, pctText, rate, summarize, hasCharges, type Trade } from '@/lib/tradeJournal';

type Filter = 'all' | 'win' | 'loss' | 'be' | 'open';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'win', label: 'Wins' }, { id: 'loss', label: 'Losses' }, { id: 'be', label: 'Breakeven' }, { id: 'open', label: 'No profit yet' }];
const go = (p: string) => router.push(p as any);

function Row({ t }: { t: Trade }) {
  const n = netOf(t);
  return (
    <TouchableOpacity style={s.row} onPress={() => go(`/journal/trade?id=${encodeURIComponent(t.id)}`)} accessibilityRole="button"
      accessibilityLabel={`${t.symbol}, ${t.direction ?? 'side not recorded'}, ${t.date}, ${n === null ? 'profit not recorded' : 'net ' + pnlText(n)}. Open to edit.`}>
      <View style={{ flex: 1, paddingRight: Spacing.sm }}>
        <Text style={[Typography.body, { fontWeight: '700' }]} numberOfLines={1}>{t.symbol} <Text style={{ color: Colors.textMuted, fontWeight: '400' }}>{t.direction ?? ''}</Text></Text>
        <Text style={Typography.caption} numberOfLines={1}>{t.date}{t.strategy ? ` · ${t.strategy}` : ''}{t.emotion ? ` · ${t.emotion}` : ''}{n !== null && !hasCharges(t) ? ' · charges not recorded' : ''}</Text>
      </View>
      <Text style={[Typography.body, { fontWeight: '800', color: profitColor(n) }]}>{n === null ? 'Not recorded' : pnlText(n, { sign: true })}</Text>
    </TouchableOpacity>
  );
}

export default function JournalHome() {
  const { data } = useJournal();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const view = useMemo(() => {
    if (!data) return null;
    const sum = summarize(data.trades);
    const curve = equityCurve(rate(data.trades).rated);
    const query = q.trim().toLowerCase();
    const list = newestFirst(data.trades).filter(t => {
      const n = netOf(t);
      if (filter === 'win' && !(n !== null && n > 0)) return false;
      if (filter === 'loss' && !(n !== null && n < 0)) return false;
      if (filter === 'be' && n !== 0) return false;
      if (filter === 'open' && n !== null) return false;
      return !query || t.symbol.toLowerCase().includes(query) || (t.strategy ?? '').toLowerCase().includes(query);
    });
    return { sum, curve, list };
  }, [data, filter, q]);

  return (
    <TrackerScreen title="Trade journal" subtitle="Log your trades, see what they added up to, and look at your own patterns. Everything stays on this phone.">
      <Notice>{NOT_ADVICE}</Notice>
      {!data || !view ? (
        <Card><Text style={Typography.body} accessibilityLiveRegion="polite">Reading your journal…</Text></Card>
      ) : (
        <>
          {data.damaged && <Notice tone="warn">Your saved journal could not be read. It has been left as it was, and a copy is kept aside before anything is saved over it.</Notice>}
          {data.unreadable > 0 && <Notice tone="warn">{data.unreadable} saved {data.unreadable === 1 ? 'entry' : 'entries'} could not be read and {data.unreadable === 1 ? 'was' : 'were'} left untouched.</Notice>}
          <TouchableOpacity style={s.primary} onPress={() => go('/journal/trade')} accessibilityRole="button" accessibilityLabel="Add a trade"><Text style={s.primaryTxt}>Add a trade</Text></TouchableOpacity>
          <View style={{ height: Spacing.md }} />
          {data.trades.length === 0 ? (
            <Card>
              <Text style={Typography.h3}>No trades yet</Text>
              <Text style={[Typography.caption, { marginTop: 6, lineHeight: 18 }]}>Add a trade by hand, or bring in a broker trade book (CSV), this journal's own export, or a TradeBook backup from the website. Nothing is filled in for you.</Text>
              <TouchableOpacity style={s.secondary} onPress={() => go('/journal/import')} accessibilityRole="button"><Text style={s.secondaryTxt}>Import or export</Text></TouchableOpacity>
            </Card>
          ) : (
            <>
              <Card accent={profitColor(view.sum.net)}>
                <Text style={Typography.label}>NET PROFIT AFTER CHARGES</Text>
                <Text style={{ fontSize: 30, fontWeight: '800', color: profitColor(view.sum.net) }}>{view.sum.count ? pnlText(view.sum.net, { sign: true }) : 'Not recorded'}</Text>
                <Text style={Typography.caption}>{view.sum.count} {view.sum.count === 1 ? 'trade' : 'trades'} with a known profit{view.sum.from ? ` · ${view.sum.from} to ${view.sum.to}` : ''}</Text>
                <View style={s.tiles}>
                  <Tile label="WIN RATE" value={pctText(view.sum.winRate)} sub={`${view.sum.wins} won · ${view.sum.losses} lost`} />
                  <Tile label="AVG PER TRADE" value={pnlText(view.sum.expectancy, { sign: true })} />
                  <Tile label="MAX DRAWDOWN" value={pnlText(view.sum.maxDrawdown)} />
                </View>
                {view.sum.unrated > 0 && <Text style={[Typography.caption, { marginTop: Spacing.sm, color: Colors.orange }]}>{view.sum.unrated} {view.sum.unrated === 1 ? 'trade has' : 'trades have'} no profit recorded and {view.sum.unrated === 1 ? 'is' : 'are'} left out of these figures.</Text>}
                {view.sum.noCharges > 0 && <Text style={[Typography.caption, { marginTop: 4, color: Colors.orange }]}>{view.sum.noCharges} of {view.sum.count} {view.sum.count === 1 ? 'trade has' : 'trades have'} no charges recorded, so net profit may be overstated.</Text>}
                {view.curve.length > 1 && <View style={{ marginTop: Spacing.md }}><EquityChart points={view.curve} height={130} /></View>}
              </Card>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {([['Analytics', '/journal/analytics'], ['Psychology', '/journal/psychology']] as const).map(([l, p]) => (
                  <TouchableOpacity key={p} style={[s.secondary, { flex: 1, marginTop: 0 }]} onPress={() => go(p)} accessibilityRole="button"><Text style={s.secondaryTxt}>{l}</Text></TouchableOpacity>
                ))}
              </View>
              <SectionLabel>YOUR TRADES</SectionLabel>
              <TextInput style={[s.input, { marginBottom: Spacing.sm }]} value={q} onChangeText={setQ} placeholder="Search instrument or setup" placeholderTextColor={Colors.textDim} autoCapitalize="none" accessibilityLabel="Search trades by instrument or setup" />
              <Chips label="Show" options={FILTERS} value={filter} onChange={(v: Filter) => setFilter(v || 'all')} allowClear={false} />
              <Card>
                {view.list.length === 0 ? <Text style={Typography.caption}>No trade matches.</Text> : view.list.slice(0, 200).map(t => <Row key={t.id} t={t} />)}
                {view.list.length > 200 && <Text style={[Typography.caption, { marginTop: 6 }]}>Showing the newest 200 of {view.list.length}. Search to narrow the list.</Text>}
              </Card>
            </>
          )}
          <SectionLabel>MORE</SectionLabel>
          <Card>
            {([['Import or export (CSV)', '/journal/import'], ['Tags', '/journal/tags']] as const).map(([l, p]) => (
              <TouchableOpacity key={p} style={s.row} onPress={() => go(p)} accessibilityRole="button"><Text style={Typography.body}>{l}</Text><Text style={s.link}>Open</Text></TouchableOpacity>
            ))}
          </Card>
          <Card>
            <Text style={Typography.label}>WHAT IS NOT HERE</Text>
            <Text style={[Typography.caption, { marginTop: 6, lineHeight: 18 }]}>Scanning a broker screenshot is not in the app: reading text from a picture needs a text-recognition library or a server, and either would change what leaves your phone, which needs a privacy decision first. Import the broker's trade book file instead. Tax on trading profits is not worked out here (it depends on the kind of trading, so ask a tax professional); the Tax planner under Tools does not cover trading income.</Text>
            <TouchableOpacity onPress={() => go('/tools/taxplanner')} accessibilityRole="button" style={{ marginTop: Spacing.sm }}><Text style={s.link}>Open the Tax planner</Text></TouchableOpacity>
          </Card>
        </>
      )}
    </TrackerScreen>
  );
}
