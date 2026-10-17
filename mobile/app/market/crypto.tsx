import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { MarketScreen, Freshness, KV, changeColor } from '@/components/MarketUI';
import { Card } from '@/components/TrackerUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadCrypto } from '@/lib/marketDataApi';
import { FRESH_MS, fmtInr, fmtMarketCap, fmtPct, relativeTime } from '@/lib/marketData';
import { Colors, Typography } from '@/constants/theme';

export default function CryptoScreen() {
  const r = useMarketResource(() => loadCrypto(), [], 0);
  const coins = r.data?.coins ?? [];
  const now = Date.now();
  return (
    <MarketScreen title="Crypto prices" subtitle="A few large coins, in rupees and dollars." refreshing={r.refreshing} onRefresh={r.reload}>
      <Freshness savedAt={r.savedAt} fromCache={r.fromCache} error={r.error} freshMs={FRESH_MS.crypto} loading={r.loading} />
      {r.loading && !r.data ? <Text style={Typography.caption}>Loading…</Text> : null}
      {!r.loading && coins.length === 0 ? <Card><Text style={Typography.body}>No crypto prices to show. {r.error ?? ''}</Text></Card> : null}
      {coins.map(c => (
        <Card key={c.id}>
          <Text style={[Typography.h3, { marginBottom: 4 }]}>{c.name}</Text>
          <KV label="Price in rupees" value={fmtInr(c.priceInr)} />
          <KV label="Price in US dollars" value={c.priceUsd === null ? 'Not available' : `$${c.priceUsd.toLocaleString('en-US', { maximumFractionDigits: c.priceUsd < 1 ? 4 : 2 })}`} />
          <KV label="Change in 24 hours" value={fmtPct(c.change24h)} color={changeColor(c.change24h)} />
          <KV label="Market value" value={fmtMarketCap(c.marketCapInr)} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="{`Price history for ${c.name}`}" onPress={() => router.push(`/market/crypto/${encodeURIComponent(c.id)}` as any)} style={{ marginTop: 8 }}>
            <Text style={{ color: Colors.cyan, fontWeight: '700' }}>Price history ›</Text>
          </TouchableOpacity>
          {c.updatedMs !== null ? <Text style={[Typography.caption, { marginTop: 6 }]}>{`Source updated ${relativeTime(c.updatedMs, now)}`}</Text> : null}
        </Card>
      ))}
      <Text style={[Typography.caption, { color: Colors.textMuted }]}>
        Prices come from CoinGecko, a global aggregator. An Indian exchange may quote a different price. In India, gains from crypto are taxed at 30% with no set-off of losses; see the Crypto tracker.
      </Text>
    </MarketScreen>
  );
}
