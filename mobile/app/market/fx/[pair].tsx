import React, { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MarketScreen, Freshness, KV, HistoryBlock } from '@/components/MarketUI';
import { Card, SectionLabel } from '@/components/TrackerUI';
import { CalcField, toNum } from '@/components/CalcUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadFx } from '@/lib/marketDataApi';
import { fxAsset, fxName, convertToInr, convertFromInr } from '@/lib/marketDataDetail';
import { FRESH_MS } from '@/lib/marketData';
import { Typography } from '@/constants/theme';

export default function FxDetail() {
  const { pair } = useLocalSearchParams<{ pair?: string }>();
  const asset = fxAsset(String(pair ?? ''));
  const r = useMarketResource(() => loadFx(), [], 120_000);
  const [amt, setAmt] = useState('');
  if (!asset) return <MarketScreen title="Currency" subtitle="Not recognised"><Card><Text style={Typography.body}>Only USD, EUR, GBP, JPY and AED against the rupee have a page.</Text></Card></MarketScreen>;
  const code = String(pair).slice(0, 3);
  const rate = r.data?.rates.find(x => x.pair === pair)?.rate ?? null;
  const n = amt.trim() === '' ? null : toNum(amt);
  const inr = rate !== null && n !== null ? convertToInr(n, rate) : null;
  const back = rate !== null && n !== null ? convertFromInr(n, rate) : null;
  return (
    <MarketScreen title={asset.label} subtitle={`1 ${fxName(code)} in rupees`} refreshing={r.refreshing} onRefresh={r.reload}>
      <Freshness savedAt={r.savedAt} fromCache={r.fromCache} error={r.error} freshMs={FRESH_MS.fx} loading={r.loading} />
      {r.loading && !r.data ? <Text style={Typography.caption}>Loading…</Text> : null}
      {rate !== null ? (
        <Card><KV label={`1 ${code} =`} value={`₹${rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: rate < 10 ? 4 : 2 })}`} sub="Market rate from a public quote source, not the RBI reference rate" /></Card>
      ) : !r.loading ? <Card><Text style={Typography.body}>{`No current rate. ${r.error ?? ''}`}</Text></Card> : null}
      {rate !== null && (
        <>
          <SectionLabel>QUICK CONVERTER</SectionLabel>
          <Card>
            <CalcField label={`Amount (${code} or ₹)`} value={amt} onChange={setAmt} placeholder="e.g. 500" />
            {inr !== null && back !== null ? (
              <>
                <KV label={`${amt} ${code} in rupees`} value={`₹${inr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} />
                <KV label={`₹${amt} in ${code}`} value={back.toLocaleString('en-IN', { maximumFractionDigits: 4 })} />
              </>
            ) : <Text style={Typography.caption}>Type an amount to convert both ways at this rate.</Text>}
            <Text style={[Typography.caption, { marginTop: 6 }]}>Banks and cards add a margin and fees, so what you actually get will be worse than this rate.</Text>
          </Card>
        </>
      )}
      <HistoryBlock asset={asset} />
      <Text style={Typography.caption}>Rates move with interest rates, trade and capital flows. For information, not a recommendation. Margin trading in foreign currency on platforms the RBI has not approved is not permitted for Indian residents.</Text>
    </MarketScreen>
  );
}
