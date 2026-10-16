import React from 'react';
import { View, Text } from 'react-native';
import { MarketScreen, Freshness, KV, changeColor } from '@/components/MarketUI';
import { Card, SectionLabel } from '@/components/TrackerUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadCommodities } from '@/lib/marketDataApi';
import { FRESH_MS, fmtPct, fmtPrice } from '@/lib/marketData';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function CommoditiesScreen() {
  const r = useMarketResource(() => loadCommodities(), [], 0);
  const d = r.data;
  return (
    <MarketScreen title="Commodities" subtitle="Gold, silver, crude oil and natural gas." refreshing={r.refreshing} onRefresh={r.reload}>
      <Freshness savedAt={r.savedAt} fromCache={r.fromCache} error={r.error} freshMs={FRESH_MS.commodities} loading={r.loading} />

      <Card accent={Colors.gold}>
        <Text style={Typography.label}>READ THIS FIRST</Text>
        <Text style={[Typography.body, { marginTop: 4, lineHeight: 20 }]}>
          Gold and silver here are a world futures price converted to rupees at the current USD/INR rate. They are not MCX prices and not what a jeweller or bank charges.
          Indian prices include import duty, GST and a local premium, so they usually differ by several percent.
        </Text>
        <Text style={[Typography.caption, { marginTop: 6 }]}>Crude oil and natural gas are US futures prices in dollars.</Text>
      </Card>

      {r.loading && !d ? <Text style={Typography.caption}>Loading…</Text> : null}
      {!r.loading && !d ? <Card><Text style={Typography.body}>No commodity prices to show. {r.error ?? ''}</Text></Card> : null}

      {d && d.items.length > 0 && <SectionLabel>PRICES</SectionLabel>}
      {d?.items.map(c => (
        <Card key={c.key}>
          <KV label={c.label} sub={c.converted ? 'World price in ₹, not MCX' : 'US futures, in US dollars'}
            value={`${c.unit.startsWith('₹') ? '₹' : '$'}${fmtPrice(c.price)} ${c.unit.replace('₹/', '/').replace('USD/', '/')}`} />
          <KV label="Change on the day" value={fmtPct(c.changePct)} color={changeColor(c.changePct)} />
          {c.priceUsd !== null ? <KV label="World price" value={`$${fmtPrice(c.priceUsd)} per ${c.usdUnit === 'USD/oz' ? 'troy oz' : c.usdUnit ?? ''}`} /> : null}
          {c.usdInr !== null ? <KV label="USD/INR used" value={fmtPrice(c.usdInr)} /> : null}
          {c.priceDate ? <Text style={[Typography.caption, { marginTop: 6 }]}>{`Latest price from ${c.priceDate} (front-month futures).`}</Text> : null}
        </Card>
      ))}

      {d && d.unavailable.length > 0 && <SectionLabel>NOT AVAILABLE RIGHT NOW</SectionLabel>}
      {d?.unavailable.map(u => (
        <Card key={u.key}>
          <Text style={Typography.body}>{u.label}</Text>
          <Text style={[Typography.caption, { color: Colors.gold, marginTop: 4 }]}>{u.reason}</Text>
          {u.priceUsd !== null ? <View style={{ marginTop: Spacing.sm }}><KV label="World price" value={`$${fmtPrice(u.priceUsd)} per troy oz`} /></View> : null}
        </Card>
      ))}
      <Text style={Typography.caption}>Prices are for information, not a recommendation.</Text>
    </MarketScreen>
  );
}
