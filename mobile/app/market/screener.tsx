import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { MarketScreen, Freshness, Chip, changeColor } from '@/components/MarketUI';
import { Card } from '@/components/TrackerUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { useHoldings } from '@/hooks/useHoldings';
import { loadQuotesBatched, loadFundamentalsMany } from '@/lib/marketDataApi';
import { joinValuation, applyValuation, sortValuation, sectorCounts, parseLimit, DEEP_VALUE, type ValSort } from '@/lib/marketDataScreener';
import { loadWatchlist } from '@/lib/watchlistStorage';
import {
  FRESH_MS, LARGE_CAP_LIST, NEAR_HIGH_PCT, NEAR_LOW_PCT, applyScreen, breadth, cleanTicker, fmtPct, fmtPrice, screenRows,
  type ScreenFilter, type ScreenSort, type Fundamentals,
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
  // valuation data (P/E, P/B, sector) is opt-in: one lookup per share
  const [funds, setFunds] = useState<Record<string, Fundamentals | null>>({});
  const [vprog, setVprog] = useState<string | null>(null);
  const [vsector, setVsector] = useState<string | null>(null);
  const [peText, setPeText] = useState(''), [pbText, setPbText] = useState('');
  const [deep, setDeep] = useState(false);
  const [vsort, setVsort] = useState<ValSort | null>(null);

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
  const vrows = useMemo(() => joinValuation(rows, funds), [rows, funds]);
  const loadedCount = vrows.filter(r => r.loaded).length;
  const shown = useMemo(() => {
    const keep = new Set(applyScreen(rows, { query, filter, sort, desc }).map(r => r.symbol));
    const order = applyScreen(rows, { query, filter, sort, desc }).map(r => r.symbol);
    const filtered = applyValuation(vrows.filter(r => keep.has(r.symbol)), { sector: vsector, peMax: parseLimit(peText), pbMax: parseLimit(pbText), preset: deep ? 'deep_value' : 'none' });
    if (vsort) return sortValuation(filtered, vsort, desc);
    const pos = new Map(order.map((sym, i) => [sym, i] as const));
    return filtered.sort((a, b) => pos.get(a.symbol)! - pos.get(b.symbol)!);
  }, [rows, vrows, query, filter, sort, desc, vsector, peText, pbText, deep, vsort]);
  const loadValuation = async () => {
    const syms = rows.map(r => r.symbol);
    setVprog(`Looking up valuation data… 0 of ${syms.length}`);
    const res = await loadFundamentalsMany(syms, { onProgress: (d, t) => setVprog(`Looking up valuation data… ${d} of ${t}`) });
    setFunds(f => ({ ...f, ...Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.data])) }));
    setVprog(null);
  };
  const valFiltering = vsector !== null || parseLimit(peText) !== null || parseLimit(pbText) !== null || deep;
  const b = useMemo(() => breadth(rows), [rows]);
  const failed = r.data?.failed ?? [];

  return (
    <MarketScreen title="Stock screener" subtitle="Sort and filter a list of shares by how they moved today and where they sit in their 52-week range." refreshing={r.refreshing} onRefresh={r.reload}>
      <Card accent={Colors.gold}>
        <Text style={Typography.label}>WHAT THIS IS, AND IS NOT</Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
          It only reorders prices. It does not rate, rank or recommend any share, and a share near its high or low is not a signal to buy or sell. By default it only uses prices; valuation (P/E, P/B) and sector can be loaded below, and nothing about earnings quality, debt or dividends is available.
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
          <Text style={[Typography.label, { marginTop: Spacing.md, marginBottom: Spacing.xs }]}>VALUATION AND SECTOR</Text>
          {loadedCount === 0 ? (
            <Card>
              <Text style={Typography.caption}>Adds each share's sector, P/E and P/B (Yahoo Finance via your backend) so you can filter on them. It looks up every share in this list one by one, which can take a minute the first time.</Text>
              {vprog ? <Text style={[Typography.caption, { marginTop: 6 }]} accessibilityRole="alert">{vprog}</Text> : (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Load valuation data for these shares" onPress={loadValuation} style={{ marginTop: 8 }}><Text style={{ color: Colors.cyan, fontWeight: '700' }}>Load P/E, P/B and sector ›</Text></TouchableOpacity>
              )}
            </Card>
          ) : (
            <>
              <Text style={Typography.caption}>{`Valuation data loaded for ${loadedCount} of ${rows.length}. A share the source has no figure for is left out of any filter on that figure, never counted as zero.`}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                <Chip label="All sectors" active={vsector === null} onPress={() => setVsector(null)} accessibilityLabel="Show all sectors" />
                {sectorCounts(vrows).map(sc => <Chip key={sc.sector} label={`${sc.sector} (${sc.count})`} active={vsector === sc.sector} onPress={() => setVsector(vsector === sc.sector ? null : sc.sector)} accessibilityLabel={`Only the ${sc.sector} sector`} />)}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput accessibilityLabel="Highest P/E to show" value={peText} onChangeText={setPeText} placeholder="P/E at most" placeholderTextColor={Colors.textDim} keyboardType="decimal-pad" style={[s.input, { flex: 1 }]} />
                <TextInput accessibilityLabel="Highest P/B to show" value={pbText} onChangeText={setPbText} placeholder="P/B at most" placeholderTextColor={Colors.textDim} keyboardType="decimal-pad" style={[s.input, { flex: 1 }]} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Chip label={`P/E ≤ ${DEEP_VALUE.peMax} and P/B ≤ ${DEEP_VALUE.pbMax}`} active={deep} onPress={() => setDeep(!deep)} accessibilityLabel="Low P E and low P B rule from the website" />
                {(['pe', 'pb', 'marketCap'] as ValSort[]).map(k => <Chip key={k} label={k === 'pe' ? 'Sort by P/E' : k === 'pb' ? 'Sort by P/B' : 'Sort by size'} active={vsort === k} onPress={() => setVsort(vsort === k ? null : k)} accessibilityLabel={`Sort by ${k === 'marketCap' ? 'market value' : k}`} />)}
              </View>
              <Text style={Typography.caption}>The low P/E and P/B rule is the website's "Deep Value" preset: a rule of thumb that also picks out struggling companies. It is not a signal. The website's other presets (quality, debt-free, dividend, growth) need ROE, debt and dividend data the backend does not provide, so they are not here.</Text>
            </>
          )}
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
            {row.loaded ? <Text style={Typography.caption}>{`${row.sector ?? 'Sector not named'}  ·  P/E ${row.pe === null ? 'n/a' : row.pe.toFixed(1)}  ·  P/B ${row.pb === null ? 'n/a' : row.pb.toFixed(2)}`}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.price}>₹{fmtPrice(row.price)}</Text>
            <Text style={[s.chg, { color: changeColor(row.dayChangePct) }]}>{fmtPct(row.dayChangePct)}</Text>
          </View>
        </TouchableOpacity>
      ))}
      {rows.length > 0 && shown.length === 0 ? <Card><Text style={Typography.body}>{valFiltering ? 'Nothing matches these filters. Shares with no figure for a filtered item are left out.' : 'Nothing matches this filter.'}</Text></Card> : null}

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
