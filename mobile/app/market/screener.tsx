import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { MarketScreen, Freshness, Chip, changeColor } from '@/components/MarketUI';
import { Card } from '@/components/TrackerUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { useHoldings } from '@/hooks/useHoldings';
import { loadQuotesBatched } from '@/lib/marketDataApi';
import { loadWatchlist } from '@/lib/watchlistStorage';
import {
  FRESH_MS, LARGE_CAP_LIST, NEAR_HIGH_PCT, NEAR_LOW_PCT, applyScreen, breadth, cleanTicker, fmtPct, fmtPrice, screenRows,
  type ScreenFilter, type ScreenSort,
} from '@/lib/marketData';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

type Universe = 'large' | 'mine';

const FILTERS: { id: ScreenFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'gainers', label: 'Up today' }, { id: 'losers', label: 'Down today' },
  { id: 'nearHigh', label: `Near 52-week high` }, { id: 'nearLow', label: `Near 52-week low` },
];
const SORTS: { id: ScreenSort; label: string }[] = [
  { id: 'symbol', label: 'Name' }, { id: 'change', label: 'Day change' }, { id: 'fromHigh', label: 'From 52w high' },
  { id: 'fromLow', label: 'From 52w low' }, { id: 'volume', label: 'Volume' },
];

export default function ScreenerScreen() {
  const [universe, setUniverse] = useState<Universe>('large');
  const [filter, setFilter] = useState<ScreenFilter>('all');
  const [sort, setSort] = useState<ScreenSort>('symbol');
  const [desc, setDesc] = useState(false);
  const [query, setQuery] = useState('');
  const [mine, setMine] = useState<string[]>([]);
  const { holdings } = useHoldings();

  useEffect(() => {
    loadWatchlist().then(w => {
      const fromHoldings = holdings.filter(h => h.type === 'Stock').map(h => cleanTicker(h.symbol));
      const set = new Set<string>([...w.filter(i => i.type === 'Stock').map(i => i.symbol), ...fromHoldings.filter((x): x is string => !!x)]);
      setMine([...set].sort());
    });
  }, [holdings]);

  const symbols = universe === 'large' ? LARGE_CAP_LIST : mine;
  const listKey = universe === 'large' ? 'large' : `mine:${mine.join(',')}`;
  const r = useMarketResource(
    () => (symbols.length ? loadQuotesBatched(symbols, listKey) : Promise.resolve({ data: { quotes: [], failed: [] }, savedAt: null, fromCache: false, error: null })),
    [listKey], 0);

  const rows = useMemo(() => screenRows(r.data?.quotes ?? []), [r.data]);
  const shown = useMemo(() => applyScreen(rows, { query, filter, sort, desc }), [rows, query, filter, sort, desc]);
  const b = useMemo(() => breadth(rows), [rows]);
  const failed = r.data?.failed ?? [];

  return (
    <MarketScreen title="Stock screener" subtitle="Sort and filter a list of shares by how they moved today and where they sit in their 52-week range." refreshing={r.refreshing} onRefresh={r.reload}>
      <Card accent={Colors.gold}>
        <Text style={Typography.label}>WHAT THIS IS, AND IS NOT</Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
          It only reorders prices. It does not rate, rank or recommend any share, and a share near its high or low is not a signal to buy or sell. It does not use earnings, valuation or quality data, which the backend does not provide in bulk.
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Chip label="Large companies" active={universe === 'large'} onPress={() => setUniverse('large')} accessibilityLabel="Screen the list of 50 large companies" />
        <Chip label={`My watchlist and holdings (${mine.length})`} active={universe === 'mine'} onPress={() => setUniverse('mine')} accessibilityLabel="Screen my watchlist and holdings" />
      </View>
      {universe === 'large' ? (
        <Text style={[Typography.caption, { marginBottom: Spacing.sm }]}>
          A fixed list of 50 large NSE companies, based on Nifty 50 membership in late 2025. The index is reviewed twice a year, so this may not match today's index.
        </Text>
      ) : mine.length === 0 ? (
        <Card><Text style={Typography.body}>Nothing here yet. Add shares to your watchlist or portfolio and they appear in this list.</Text></Card>
      ) : null}

      <Freshness savedAt={r.savedAt} fromCache={r.fromCache} error={r.error} freshMs={FRESH_MS.quotes} loading={r.loading && symbols.length > 0} />

      {rows.length > 0 && (
        <>
          <Text style={Typography.caption}>{`${b.up} up, ${b.down} down, ${b.flat} unchanged${b.unknown ? `, ${b.unknown} with no change figure` : ''} of ${rows.length} quoted.`}</Text>
          <TextInput accessibilityLabel="Filter the list by ticker" value={query} onChangeText={setQuery} placeholder="Filter by ticker" placeholderTextColor={Colors.textDim}
            autoCapitalize="characters" autoCorrect={false} style={s.input} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {FILTERS.map(f => <Chip key={f.id} label={f.label} active={filter === f.id} onPress={() => setFilter(f.id)} />)}
          </View>
          <Text style={Typography.caption}>{`"Near high" means within ${NEAR_HIGH_PCT}% of the 52-week high; "near low" means within ${NEAR_LOW_PCT}% above the 52-week low.`}</Text>
          <Text style={[Typography.label, { marginTop: Spacing.md, marginBottom: Spacing.xs }]}>SORT BY</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {SORTS.map(o => <Chip key={o.id} label={o.label} active={sort === o.id} onPress={() => setSort(o.id)} accessibilityLabel={`Sort by ${o.label}`} />)}
            <Chip label={desc ? 'High to low' : 'Low to high'} onPress={() => setDesc(!desc)} accessibilityLabel="Reverse the sort order" />
          </View>
        </>
      )}

      {!r.loading && symbols.length > 0 && rows.length === 0 ? <Card><Text style={Typography.body}>{`No prices to show. ${r.error ?? ''}`}</Text></Card> : null}

      {shown.map(row => (
        <TouchableOpacity key={row.symbol} accessibilityRole="button" accessibilityLabel={`${row.symbol}, ${fmtPrice(row.price)} rupees, ${fmtPct(row.dayChangePct)} today. Open details.`}
          style={s.row} onPress={() => router.push(`/market/stock/${encodeURIComponent(row.symbol)}` as any)}>
          <View style={{ flex: 1 }}>
            <Text style={s.sym}>{row.symbol}</Text>
            <Text style={Typography.caption}>
              {row.fromHighPct !== null ? `${fmtPct(row.fromHighPct, 1)} from high` : '52-week range not available'}
              {row.fromLowPct !== null ? `  ·  ${fmtPct(row.fromLowPct, 1)} from low` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.price}>₹{fmtPrice(row.price)}</Text>
            <Text style={[s.chg, { color: changeColor(row.dayChangePct) }]}>{fmtPct(row.dayChangePct)}</Text>
          </View>
        </TouchableOpacity>
      ))}
      {rows.length > 0 && shown.length === 0 ? <Card><Text style={Typography.body}>Nothing matches this filter.</Text></Card> : null}

      {failed.length > 0 && (
        <Text style={[Typography.caption, { marginTop: Spacing.md }]}>
          {`${failed.length} could not be quoted: ${failed.join(', ')}. A ticker may have been renamed or delisted, or the data source did not answer.`}
        </Text>
      )}
    </MarketScreen>
  );
}

const s = StyleSheet.create({
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, color: Colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, marginVertical: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginTop: Spacing.sm },
  sym: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  price: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  chg: { fontSize: 12, fontWeight: '700', marginTop: 2 },
});
