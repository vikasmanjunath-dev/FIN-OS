import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { MarketScreen, Freshness } from '@/components/MarketUI';
import { Card, SectionLabel } from '@/components/TrackerUI';
import { PortfolioTreemap, TreemapLegend } from '@/components/PortfolioTreemap';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadOverview, loadSectorIndices, loadQuotesBatched } from '@/lib/marketDataApi';
import { mapLeaves, tally } from '@/lib/marketDataMap';
import { tileFill } from '@/lib/portfolioTreemap';
import { FRESH_MS, LARGE_CAP_LIST, fmtPct, fmtPrice } from '@/lib/marketData';
import { Colors, Spacing, Typography } from '@/constants/theme';

const DAY_FULL = 3;     // a 3% day move is the full colour

export default function MarketMap() {
  const idx = useMarketResource(() => loadOverview(), [], 0);
  const sec = useMarketResource(() => loadSectorIndices(), [], 0);
  const q = useMarketResource(() => loadQuotesBatched(LARGE_CAP_LIST, 'large'), [], 0);
  const reloadAll = async () => { await Promise.all([idx.reload(), sec.reload(), q.reload()]); };

  const indices = Object.values(idx.data?.indices ?? {});
  const sectors = sec.data?.sectors ?? [];
  const { leaves, unsized } = useMemo(() => mapLeaves(q.data?.quotes ?? []), [q.data]);
  const groups = useMemo(() => [{ id: 'all', label: '', leaves }], [leaves]);
  const t = tally((q.data?.quotes ?? []).map(x => x.changePct));

  const Tile = ({ label, pct, sub, neutral }: { label: string; pct: number | null; sub?: string; neutral?: boolean }) => (
    <View accessible accessibilityLabel={`${label}, ${fmtPct(pct)} today${sub ? ', ' + sub : ''}`} style={{ width: '31%', backgroundColor: neutral ? tileFill(0) : tileFill(pct, DAY_FULL), borderRadius: 8, padding: 8 }}>
      <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>{label}</Text>
      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>{fmtPct(pct)}</Text>
      {sub ? <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 10 }}>{sub}</Text> : null}
    </View>
  );

  return (
    <MarketScreen title="Market map" subtitle="Where the market moved today, as colours. Green is up, red is down (India VIX is shown neutral: a rise in it is not good news)." refreshing={idx.refreshing || sec.refreshing || q.refreshing} onRefresh={reloadAll}>
      <SectionLabel>INDICES</SectionLabel>
      <Freshness savedAt={idx.savedAt} fromCache={idx.fromCache} error={idx.error} freshMs={FRESH_MS.quote} loading={idx.loading} />
      {indices.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {indices.map(i => <Tile key={i.name} label={i.name.replace('NIFTY ', 'N ')} pct={i.changePct} neutral={i.name === 'INDIA VIX'} sub={fmtPrice(i.price)} />)}
        </View>
      ) : !idx.loading ? <Card><Text style={Typography.body}>{`No index data. ${idx.error ?? ''}`}</Text></Card> : null}

      <SectionLabel>SECTOR INDICES</SectionLabel>
      <Freshness savedAt={sec.savedAt} fromCache={sec.fromCache} error={sec.error} freshMs={FRESH_MS.quote} loading={sec.loading} />
      {sectors.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {sectors.map(s => <Tile key={s.name} label={s.label} pct={s.changePct} sub={s.price !== null ? fmtPrice(s.price) : undefined} />)}
        </View>
      ) : !sec.loading ? <Card><Text style={Typography.body}>{`No sector data. ${sec.error ?? ''}`}</Text></Card> : null}
      <Text style={Typography.caption}>Only the sector indices the data source returned are shown; a missing one is missing, not zero.</Text>

      <SectionLabel>LARGE COMPANIES</SectionLabel>
      <Freshness savedAt={q.savedAt} fromCache={q.fromCache} error={q.error} freshMs={FRESH_MS.quotes} loading={q.loading} />
      {leaves.length > 0 ? (
        <Card>
          <Text style={Typography.caption}>{`Size is market value, colour is today's move. ${t.up} up, ${t.down} down, ${t.flat} unchanged${t.unknown ? `, ${t.unknown} with no change figure` : ''}. Tap a tile for the share.`}</Text>
          <View style={{ marginTop: Spacing.sm }}>
            <PortfolioTreemap groups={groups} fullAt={DAY_FULL} height={360}
              describe={l => `${l.label}, ${fmtPct(l.colorValue)} today. Open details.`}
              onOpen={l => router.push(`/market/stock/${encodeURIComponent(l.id)}` as any)} />
          </View>
          <TreemapLegend fullAt={DAY_FULL} unit="today's move" />
          {unsized.length > 0 ? <Text style={[Typography.caption, { marginTop: 6 }]}>{`${unsized.length} share${unsized.length === 1 ? '' : 's'} not drawn because the data source gave no market value: ${unsized.join(', ')}.`}</Text> : null}
        </Card>
      ) : !q.loading ? <Card><Text style={Typography.body}>{`No prices to draw. ${q.error ?? ''}`}</Text></Card> : null}
      <Text style={Typography.caption}>
        The list is the fixed set of 50 large NSE companies used by the screener (Nifty 50 membership as of late 2025, not checked against today's index). Market value comes from the quote source and can lag. Information only, not a recommendation.
      </Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open the stock screener" onPress={() => router.push('/market/screener' as any)} style={{ marginTop: Spacing.md }}>
        <Text style={{ color: Colors.cyan, fontWeight: '700' }}>Sort and filter these in the screener ›</Text>
      </TouchableOpacity>
    </MarketScreen>
  );
}
