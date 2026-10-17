import React from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MarketScreen, Freshness, KV, HistoryBlock, changeColor } from '@/components/MarketUI';
import { Card } from '@/components/TrackerUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadCrypto } from '@/lib/marketDataApi';
import { cryptoAsset } from '@/lib/marketDataDetail';
import { FRESH_MS, fmtInr, fmtMarketCap, fmtPct, relativeTime } from '@/lib/marketData';
import { Colors, Typography } from '@/constants/theme';

export default function CryptoDetail() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const r = useMarketResource(() => loadCrypto(), [], 60_000);
  const coin = r.data?.coins.find(c => c.id === String(id ?? ''));
  const asset = cryptoAsset(String(id ?? ''), coin?.name);
  if (!asset) {
    return <MarketScreen title="Crypto" subtitle="Coin not recognised"><Card><Text style={Typography.body}>That is not a valid coin id.</Text></Card></MarketScreen>;
  }
  return (
    <MarketScreen title={asset.label} subtitle="Price today and price history" refreshing={r.refreshing} onRefresh={r.reload}>
      <Freshness savedAt={r.savedAt} fromCache={r.fromCache} error={r.error} freshMs={FRESH_MS.crypto} loading={r.loading} />
      {r.loading && !r.data ? <Text style={Typography.caption}>Loading…</Text> : null}
      {coin ? (
        <Card>
          <KV label="Price in rupees" value={fmtInr(coin.priceInr)} />
          <KV label="Price in US dollars" value={coin.priceUsd === null ? 'Not available' : `$${coin.priceUsd.toLocaleString('en-US', { maximumFractionDigits: coin.priceUsd < 1 ? 4 : 2 })}`} />
          <KV label="Change in 24 hours" value={fmtPct(coin.change24h)} color={changeColor(coin.change24h)} />
          <KV label="Market value" value={fmtMarketCap(coin.marketCapInr)} />
          {coin.updatedMs !== null ? <Text style={[Typography.caption, { marginTop: 6 }]}>{`Source updated ${relativeTime(coin.updatedMs, Date.now())}`}</Text> : null}
          <Text style={[Typography.caption, { marginTop: 4 }]}>Prices: CoinGecko, a global aggregator.</Text>
        </Card>
      ) : !r.loading ? <Card><Text style={Typography.body}>{`No current price for this coin. ${r.error ?? 'It is not in the list your backend returned.'}`}</Text></Card> : null}
      <HistoryBlock asset={asset} />
      <Card accent={Colors.gold}>
        <Text style={Typography.label}>WORTH KNOWING</Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
          The history is in US dollars from Yahoo Finance; the price above is in rupees from CoinGecko, so the two will not match exactly. Crypto prices can move several percent in a day. In India, gains are taxed at a flat 30% with 1% TDS on transfers, and losses cannot be set off against other income; see the Crypto tracker. Not a recommendation.
        </Text>
      </Card>
    </MarketScreen>
  );
}
