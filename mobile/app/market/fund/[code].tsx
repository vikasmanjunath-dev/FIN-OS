import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MarketScreen, Freshness, KV, changeColor } from '@/components/MarketUI';
import { PriceChart } from '@/components/PriceChart';
import { Card, SectionLabel } from '@/components/TrackerUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadFund, loadFundHistory } from '@/lib/marketDataApi';
import { FRESH_MS, cleanSchemeCode, fmtPct, fundReturns, isPayoutOption, type Chart } from '@/lib/marketData';
import { Colors, Typography } from '@/constants/theme';

export default function FundDetail() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = cleanSchemeCode(String(params.code ?? ''));
  const empty = { data: null, savedAt: null, fromCache: false, error: null };
  const nav = useMarketResource(() => (code ? loadFund(code) : Promise.resolve(empty)), [code]);
  const hist = useMarketResource(() => (code ? loadFundHistory(code) : Promise.resolve(empty)), [code]);

  const returns = useMemo(() => (hist.data ? fundReturns(hist.data.points) : []), [hist.data]);
  const chart: Chart | null = useMemo(() => {
    const p = hist.data?.points.slice(-366);
    if (!p || p.length < 2) return null;
    return { closes: p.map(x => x.nav), highs: p.map(x => x.nav), lows: p.map(x => x.nav), volumes: p.map(() => 0), dates: p.map(x => x.date), currentPrice: null };
  }, [hist.data]);

  if (!code) {
    return (
      <MarketScreen title="Mutual fund" subtitle="Search a fund from Market research.">
        <Card><Text style={Typography.body}>That is not a valid scheme code. Scheme codes are numbers, for example 120503.</Text></Card>
      </MarketScreen>
    );
  }
  const f = nav.data;
  const payout = f ? isPayoutOption(f) : false;
  const reloadAll = async () => { await Promise.all([nav.reload(), hist.reload()]); };

  return (
    <MarketScreen title={f?.name ?? `Scheme ${code}`} subtitle={f ? [f.fundHouse, f.category].filter(Boolean).join(' · ') : undefined} refreshing={nav.refreshing || hist.refreshing} onRefresh={reloadAll}>
      <Freshness savedAt={nav.savedAt} fromCache={nav.fromCache} error={nav.error} freshMs={FRESH_MS.fund} loading={nav.loading} />
      {nav.loading && !f ? <Text style={Typography.caption}>Loading…</Text> : null}
      {!nav.loading && !f ? <Card><Text style={Typography.body}>No fund found for scheme code {code}.</Text></Card> : null}

      {f && (
        <Card>
          <Text style={Typography.label}>NAV</Text>
          <Text style={{ fontSize: 32, fontWeight: '800', color: Colors.textPrimary }}>{f.nav !== null ? `₹${f.nav.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : 'Not available'}</Text>
          <Text style={Typography.caption}>{f.date ? `As published by AMFI for ${f.date}` : 'NAV date not given'}</Text>
          <KV label="Scheme code" value={f.code} />
          {f.fundHouse ? <KV label="Fund house" value={f.fundHouse} /> : null}
          <KV label="Plan" value={f.plan || 'Not stated'} sub="Direct plans have lower costs than regular plans" />
          <KV label="Option" value={f.option || 'Not stated'} />
          {f.category ? <Text style={[Typography.caption, { marginTop: 8 }]}>{`AMFI category: ${f.category}`}</Text> : null}
        </Card>
      )}

      <SectionLabel>NAV HISTORY</SectionLabel>
      {hist.loading && !hist.data ? <Text style={Typography.caption}>Loading history…</Text> : null}
      {hist.data ? (
        <>
          <Freshness savedAt={hist.savedAt} fromCache={hist.fromCache} error={hist.error} freshMs={FRESH_MS.fundHistory} />
          {chart ? <Card><PriceChart chart={chart} /><Text style={Typography.caption}>NAV over the last year (published days only).</Text></Card> : null}
          <Card>
            <Text style={Typography.label}>RETURNS FROM THE NAV HISTORY</Text>
            {returns.map(r => (
              <KV key={r.id} label={`${r.label}${r.annualised ? ' (per year)' : ''}`}
                value={r.pct !== null ? fmtPct(r.pct) : 'Not available'} color={changeColor(r.pct)}
                sub={r.pct !== null && r.from ? `NAV ₹${r.from.nav.toFixed(2)} on ${r.from.date} to ₹${r.to.nav.toFixed(2)} on ${r.to.date}` : r.reason ?? undefined} />
            ))}
            <Text style={[Typography.caption, { marginTop: 8, lineHeight: 17 }]}>
              These are worked out here from published NAVs: the change in NAV between two dates, with 3 and 5 year figures shown per year (compounded). They are not the fund house's factsheet numbers, ignore exit load and tax, and do not include SIP timing. Past returns do not predict future returns.
            </Text>
            {payout ? (
              <Text style={[Typography.caption, { marginTop: 6, color: Colors.gold, lineHeight: 17 }]}>
                This looks like an IDCW (dividend) option. Its NAV falls when it pays out, so these figures understate what an investor received. Compare the Growth option instead.
              </Text>
            ) : null}
            <Text style={[Typography.caption, { marginTop: 6, lineHeight: 17 }]}>
              {`${hist.data.source || 'AMFI NAVs'}.${hist.data.amfiCheck.checked ? (hist.data.amfiCheck.matches ? ' The latest NAV matches AMFI\'s daily file.' : ' Warning: the latest NAV did not match AMFI\'s daily file.') : ''}`}
            </Text>
          </Card>
        </>
      ) : null}
      {!hist.loading && !hist.data ? <Card><Text style={Typography.caption}>{`NAV history is not available right now. ${hist.error ?? ''}`}</Text></Card> : null}

      <Card>
        <Text style={Typography.label}>NOT AVAILABLE HERE</Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
          Expense ratio, fund manager, assets under management, holdings and risk ratings are not in AMFI's NAV data, so they are not shown. Check the scheme's factsheet.
        </Text>
      </Card>
      <Text style={Typography.caption}>For information only. Not a recommendation to buy or sell.</Text>
    </MarketScreen>
  );
}
