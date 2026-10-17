import React, { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { MarketScreen } from '@/components/MarketUI';
import { Card, SectionLabel, Bar, inr } from '@/components/TrackerUI';
import { PortfolioTreemap, TreemapLegend } from '@/components/PortfolioTreemap';
import { EmptyPortfolio, NotAdvice, usePortfolioViews } from '@/components/PortfolioUI';
import { loadFundamentalsMany } from '@/lib/marketDataApi';
import { cleanTicker, fmtPct, formatAsOf, type Fundamentals } from '@/lib/marketData';
import { splitBySector, sectorConcentration, toTreeGroups, topHolding, UNMAPPED } from '@/lib/portfolioSectors';
import { tileFill } from '@/lib/portfolioTreemap';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function PortfolioSectors() {
  const { views, loaded, total, unpriced } = usePortfolioViews();
  const stocks = useMemo(() => [...new Set(views.filter(v => v.type === 'Stock').map(v => cleanTicker(v.symbol)).filter((x): x is string => !!x))], [views]);
  const key = stocks.join(',');
  const [sectors, setSectors] = useState<Record<string, string | null>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!stocks.length) { setProgress(null); return; }
    let alive = true;
    setProgress({ done: 0, total: stocks.length });
    loadFundamentalsMany(stocks, { onProgress: (done, tot) => alive && setProgress({ done, total: tot }) }).then(res => {
      if (!alive) return;
      const m: Record<string, string | null> = {}, bad: string[] = [];
      let oldest: number | null = null, cached = false;
      for (const [s, r] of Object.entries(res)) {
        const f: Fundamentals | null = r.data;
        m[s] = f?.sector ?? null;
        if (!f) bad.push(s);
        if (r.savedAt !== null) oldest = oldest === null ? r.savedAt : Math.min(oldest, r.savedAt);
        if (r.fromCache) cached = true;
      }
      setSectors(m); setFailed(bad); setSavedAt(oldest); setFromCache(cached); setProgress(null);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const split = useMemo(() => splitBySector(views, sectors), [views, sectors]);
  const groups = useMemo(() => toTreeGroups(split), [split]);
  const conc = useMemo(() => sectorConcentration(split), [split]);
  const top = useMemo(() => topHolding(split), [split]);
  const unmapped = split.groups.find(g => g.sector === UNMAPPED);
  const open = (id: string, type: string) => router.push((type === 'Stock' ? `/market/stock/${encodeURIComponent(id)}` : `/market/fund/${encodeURIComponent(id)}`) as any);

  return (
    <MarketScreen title="Sectors and treemap" subtitle="How your holdings spread across sectors, sized by value and coloured by gain on cost." refreshing={!!progress} onRefresh={() => setTick(t => t + 1)}>
      {!views.length ? <EmptyPortfolio loaded={loaded} /> : (
        <>
          {progress ? <Text style={Typography.caption} accessibilityRole="alert">{`Looking up sectors… ${progress.done} of ${progress.total}`}</Text> : null}
          {split.total <= 0 ? <Card><Text style={Typography.body}>There are no positive holding values to size the treemap or calculate sector weights.</Text><Text style={Typography.caption}>Check that units and saved prices are available in Portfolio.</Text></Card> : null}
          {!progress && stocks.length > 0 ? (
            <Text style={[Typography.caption, { marginBottom: Spacing.md }]}>
              {fromCache ? `Offline. Sectors are from the last saved lookup, ${savedAt ? formatAsOf(savedAt, Date.now()) : 'time not recorded'}.` : 'Sectors looked up just now.'}
              {failed.length ? ` No answer for ${failed.join(', ')}.` : ''}
            </Text>
          ) : null}

          <Card>
            <Text style={Typography.label}>TREEMAP</Text>
            <View style={{ marginTop: Spacing.sm }}>
              <PortfolioTreemap groups={groups} height={360} fullAt={30}
                describe={(l, g) => `${l.meta?.name ?? l.label}, ${g}, ${l.meta ? l.meta.weightPct.toFixed(1) : ''} percent of portfolio, ${l.colorValue === null ? 'no saved market price' : fmtPct(l.colorValue, 1) + ' on cost'}. Open details.`}
                onOpen={l => open(l.meta.symbol, l.meta.type)} />
            </View>
            <TreemapLegend fullAt={30} unit="gain on cost" />
            <Text style={[Typography.caption, { marginTop: 6 }]}>
              {`Size is current value (${inr(total)} in all). Colour is the gain or loss against what you paid, using the last price saved on this phone. That saved price may be stale. Tap a tile for details.`}
              {unpriced ? ` ${unpriced} holding${unpriced === 1 ? ' has' : 's have'} no saved market price: valued at cost and drawn grey, because a cost-value says nothing about gain.` : ''}
            </Text>
          </Card>

          <SectionLabel>BY SECTOR</SectionLabel>
          {split.groups.map(g => (
            <Card key={g.sector}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: tileFill(g.gainPct), marginRight: 8 }} />
                <Text style={[Typography.body, { flex: 1, fontWeight: '700' }]}>{g.sector}</Text>
                <Text style={Typography.body}>{`${g.weightPct.toFixed(1)}%`}</Text>
              </View>
              <Bar pct={g.weightPct} color={Colors.cyan} />
              <Text style={Typography.caption}>
                {`${inr(g.current)} · ${g.count} holding${g.count === 1 ? '' : 's'} · `}
                {g.gainPct === null ? 'gain not known (no saved market price)' : `${fmtPct(g.gainPct, 1)} on cost${g.pricedCount < g.count ? ` (${g.pricedCount} of ${g.count} priced)` : ''}`}
              </Text>
              <Text style={[Typography.caption, { marginTop: 2 }]} numberOfLines={3}>{g.cells.map(c => `${c.symbol} ${c.weightPct.toFixed(1)}%`).join(' · ')}</Text>
              {g.kind === 'funds' ? <Text style={[Typography.caption, { marginTop: 2 }]}>Mutual funds are not split by sector: the data source has no look-through holdings for them.</Text> : null}
            </Card>
          ))}

          {unmapped ? (
            <Card accent={Colors.gold}>
              <Text style={Typography.label}>{UNMAPPED.toUpperCase()}</Text>
              <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>{`${unmapped.cells.map(c => c.symbol).join(', ')}: the data source did not name a sector for ${unmapped.count === 1 ? 'this share' : 'these shares'} (an ETF, a new listing, or a lookup that failed). They are left unmapped rather than guessed from the ticker.`}</Text>
            </Card>
          ) : null}

          <SectionLabel>CONCENTRATION</SectionLabel>
          <Card>
            {conc ? (
              <>
                <Text style={Typography.body}>{`Across ${conc.named} named sector${conc.named === 1 ? '' : 's'}, your shares are spread about as widely as ${conc.effectiveN} equal-sized sectors. Herfindahl index ${Math.round(conc.hhi).toLocaleString('en-IN')} (${conc.band}).`}</Text>
                <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>{`Measured on ${inr(conc.baseValue)} of shares that have a named sector; mutual funds and unmapped shares are not counted. Bands: under 1,000 spread out, up to 2,500 moderate, above that concentrated (the website's cut-offs). It is a reading of one lens, not a verdict.`}</Text>
              </>
            ) : <Text style={Typography.caption}>No share has a named sector yet, so there is nothing to measure.</Text>}
            {top ? <Text style={[Typography.caption, { marginTop: 6 }]}>{`Largest single holding: ${top.name} at ${top.weightPct.toFixed(1)}% of your portfolio.`}</Text> : null}
          </Card>
          <Text style={Typography.caption}>Sector names are Yahoo Finance's classification, fetched through your Arya backend, so they differ from NSE's and the website's wording (for example "Technology", "Consumer Defensive").</Text>
          <NotAdvice />
        </>
      )}
    </MarketScreen>
  );
}
