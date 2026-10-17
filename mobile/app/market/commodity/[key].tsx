import React from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MarketScreen, Freshness, KV, HistoryBlock, changeColor } from '@/components/MarketUI';
import { Card } from '@/components/TrackerUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadCommodities } from '@/lib/marketDataApi';
import { commodityAsset, commoditySlug } from '@/lib/marketDataDetail';
import { FRESH_MS, fmtPct, fmtPrice } from '@/lib/marketData';
import { Colors, Typography } from '@/constants/theme';

export default function CommodityDetail() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const slug = String(key ?? '');
  const asset = commodityAsset(slug);
  const r = useMarketResource(() => loadCommodities(), [], 120_000);
  const item = r.data?.items.find(c => commoditySlug(c.key) === slug);
  const unavailable = r.data?.unavailable.find(c => commoditySlug(c.key) === slug);
  if (!asset) {
    return <MarketScreen title="Commodity" subtitle="Not recognised"><Card><Text style={Typography.body}>Only gold, silver, crude oil and natural gas have a page.</Text></Card></MarketScreen>;
  }
  const isMetal = slug === 'gold' || slug === 'silver';
  return (
    <MarketScreen title={asset.label} subtitle="Price today and price history" refreshing={r.refreshing} onRefresh={r.reload}>
      <Freshness savedAt={r.savedAt} fromCache={r.fromCache} error={r.error} freshMs={FRESH_MS.commodities} loading={r.loading} />
      {r.loading && !r.data ? <Text style={Typography.caption}>Loading…</Text> : null}
      {item ? (
        <Card>
          <KV label={item.converted ? 'Rupee price (world price converted, not MCX)' : 'Price'} value={`${item.unit.startsWith('₹') ? '₹' : '$'}${fmtPrice(item.price)} ${item.unit.replace('₹/', '/').replace('USD/', '/')}`} />
          <KV label="Change on the day" value={fmtPct(item.changePct)} color={changeColor(item.changePct)} />
          {item.priceUsd !== null ? <KV label="World price" value={`$${fmtPrice(item.priceUsd)} per troy oz`} /> : null}
          {item.usdInr !== null ? <KV label="USD/INR used" value={fmtPrice(item.usdInr)} /> : null}
          {item.priceDate ? <Text style={[Typography.caption, { marginTop: 6 }]}>{`Latest price from ${item.priceDate} (front-month futures).`}</Text> : null}
        </Card>
      ) : unavailable ? (
        <Card><Text style={Typography.body}>{unavailable.reason}</Text>{unavailable.priceUsd !== null ? <KV label="World price" value={`$${fmtPrice(unavailable.priceUsd)} per troy oz`} /> : null}</Card>
      ) : !r.loading ? <Card><Text style={Typography.body}>{`No current price. ${r.error ?? ''}`}</Text></Card> : null}
      <HistoryBlock asset={asset} />
      <Card accent={Colors.gold}>
        <Text style={Typography.label}>READ THIS</Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
          {isMetal
            ? 'The history is the world futures price in US dollars per troy ounce. The rupee price above is that price converted at the day\'s USD/INR rate; it is not an MCX quote, and Indian prices include import duty, GST and a local premium, so they usually differ by several percent. Only the dollar history is charted: converting every past day would need a past USD/INR for each day.'
            : 'US futures price in dollars. Front-month contracts are replaced when they expire, which can show as a jump in the history. Not an Indian market price.'}
          {' '}For information, not a recommendation.
        </Text>
      </Card>
    </MarketScreen>
  );
}
