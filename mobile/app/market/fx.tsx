import React from 'react';
import { Text } from 'react-native';
import { MarketScreen, Freshness, KV } from '@/components/MarketUI';
import { Card } from '@/components/TrackerUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadFx } from '@/lib/marketDataApi';
import { FRESH_MS } from '@/lib/marketData';
import { Typography } from '@/constants/theme';

const NAMES: Record<string, string> = { USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', JPY: 'Japanese yen', AED: 'UAE dirham' };

export default function FxScreen() {
  const r = useMarketResource(() => loadFx(), [], 0);
  const rates = r.data?.rates ?? [];
  return (
    <MarketScreen title="Currency rates" subtitle="What one unit of a foreign currency is worth in rupees." refreshing={r.refreshing} onRefresh={r.reload}>
      <Freshness savedAt={r.savedAt} fromCache={r.fromCache} error={r.error} freshMs={FRESH_MS.fx} loading={r.loading} />
      {r.loading && !r.data ? <Text style={Typography.caption}>Loading…</Text> : null}
      {!r.loading && rates.length === 0 ? <Card><Text style={Typography.body}>No exchange rates to show. {r.error ?? ''}</Text></Card> : null}
      {rates.length > 0 && (
        <Card>
          {rates.map(x => (
            <KV key={x.pair} label={`${x.base} to ${x.quote}`} sub={`1 ${NAMES[x.base] ?? x.base}`}
              value={`₹${x.rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: x.rate < 10 ? 4 : 2 })}`} />
          ))}
        </Card>
      )}
      <Text style={Typography.caption}>
        These are market rates from a public quote source, not the RBI reference rate and not what a bank or card will charge you.
        Banks add a margin, and cards add fees.
      </Text>
    </MarketScreen>
  );
}
