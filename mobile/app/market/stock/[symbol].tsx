import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MarketScreen, Freshness, KV, Chip, RangeBar, changeColor } from '@/components/MarketUI';
import { PriceChart } from '@/components/PriceChart';
import { Card, SectionLabel } from '@/components/TrackerUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadQuote, loadFundamentals, loadChart } from '@/lib/marketDataApi';
import {
  CHART_RANGES, FRESH_MS, chartStats, cleanTicker, fmtMarketCap, fmtPct, fmtPrice, fmtVolume, pctFrom, rangePosition, type ChartRangeId,
} from '@/lib/marketData';
import { add as addWatch } from '@/lib/watchlist';
import { loadWatchlist, saveWatchlist } from '@/lib/watchlistStorage';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function StockDetail() {
  const params = useLocalSearchParams<{ symbol?: string }>();
  const symbol = cleanTicker(String(params.symbol ?? ''));
  const [range, setRange] = useState<ChartRangeId>('3M');
  const [watchMsg, setWatchMsg] = useState('');

  const q = useMarketResource(() => (symbol ? loadQuote(symbol) : Promise.resolve({ data: null, savedAt: null, fromCache: false, error: 'That is not an NSE ticker.' })), [symbol], 60_000);
  const f = useMarketResource(() => (symbol ? loadFundamentals(symbol) : Promise.resolve({ data: null, savedAt: null, fromCache: false, error: null })), [symbol]);
  const rangeParam = CHART_RANGES.find(x => x.id === range)!.range;
  const c = useMarketResource(() => (symbol ? loadChart(symbol, rangeParam) : Promise.resolve({ data: null, savedAt: null, fromCache: false, error: null })), [symbol, range]);

  const reloadAll = useCallback(async () => { await Promise.all([q.reload(), f.reload(), c.reload()]); }, [q.reload, f.reload, c.reload]);

  const quote = q.data;
  const stats = c.data ? chartStats(c.data) : null;
  const dayPos = quote ? rangePosition(quote.low, quote.high, quote.price) : null;
  const wkPos = quote ? rangePosition(quote.week52Low, quote.week52High, quote.price) : null;
  const name = f.data?.name ?? (quote && quote.name !== quote.symbol ? quote.name : null);

  const addToWatchlist = async () => {
    if (!symbol || !quote) return;
    const list = await loadWatchlist();
    const res = addWatch(list, 'Stock', symbol, name ?? symbol, quote.price, new Date());
    if (!res.ok) { setWatchMsg(res.error); return; }
    await saveWatchlist(res.items);
    setWatchMsg(`${symbol} is on your watchlist.`);
  };
  useEffect(() => { setWatchMsg(''); }, [symbol]);

  if (!symbol) {
    return (
      <MarketScreen title="Share price" subtitle="Look up an NSE ticker such as RELIANCE or HDFCBANK from Market research.">
        <Card><Text style={Typography.body}>That is not a valid NSE ticker. Letters, digits, & and - only, up to 20 characters.</Text></Card>
      </MarketScreen>
    );
  }

  return (
    <MarketScreen title={symbol} subtitle={name ?? 'NSE-listed share or ETF'} refreshing={q.refreshing || c.refreshing} onRefresh={reloadAll}>
      <Freshness savedAt={q.savedAt} fromCache={q.fromCache} error={q.error} freshMs={FRESH_MS.quote} loading={q.loading} />

      {q.loading && !quote ? <Text style={Typography.caption}>Loading the price…</Text> : null}
      {!q.loading && !quote ? (
        <Card><Text style={Typography.body}>No price for {symbol}. Check the ticker, or try again when the backend is reachable.</Text></Card>
      ) : null}

      {quote && (
        <>
          <Card>
            <Text style={s.price}>₹{fmtPrice(quote.price)}</Text>
            <Text style={[s.chg, { color: changeColor(quote.changePct) }]}>
              {quote.change !== null ? `${quote.change >= 0 ? '+' : '−'}₹${fmtPrice(Math.abs(quote.change))}  ` : ''}{fmtPct(quote.changePct)} on the day
            </Text>
            <RangeBar pos={dayPos} caption="Today's range" lowLabel={quote.low !== null ? `₹${fmtPrice(quote.low)}` : 'Not available'} highLabel={quote.high !== null ? `₹${fmtPrice(quote.high)}` : 'Not available'} />
            {quote.week52Low !== null && quote.week52High !== null ? (
              <RangeBar pos={wkPos} caption="52-week range" lowLabel={`₹${fmtPrice(quote.week52Low)}`} highLabel={`₹${fmtPrice(quote.week52High)}`} />
            ) : <Text style={Typography.caption}>52-week range: not available from the backend for this symbol.</Text>}
            {pctFrom(quote.price, quote.week52High) !== null ? (
              <Text style={Typography.caption}>{`${fmtPct(pctFrom(quote.price, quote.week52High), 1)} from the 52-week high, ${fmtPct(pctFrom(quote.price, quote.week52Low), 1)} from the 52-week low.`}</Text>
            ) : null}
          </Card>

          <Card>
            <KV label="Open" value={quote.open !== null ? `₹${fmtPrice(quote.open)}` : 'Not available'} />
            <KV label="Previous close" value={quote.prevClose !== null ? `₹${fmtPrice(quote.prevClose)}` : 'Not available'} />
            <KV label="Volume" value={fmtVolume(quote.volume)} sub="Shares traded (latest session)" />
            <KV label="Market value" value={fmtMarketCap(quote.marketCap)} sub="Price × shares in issue" />
            <Text style={[Typography.caption, { marginTop: 6 }]}>{`Source: ${quote.source || 'the Arya backend'}. Prices can be delayed by a few minutes.`}</Text>
          </Card>
        </>
      )}

      <SectionLabel>PRICE HISTORY</SectionLabel>
      <Card>
        <View style={{ flexDirection: 'row', marginBottom: Spacing.sm }}>
          {CHART_RANGES.map(r => <Chip key={r.id} label={r.label} active={range === r.id} onPress={() => setRange(r.id)} accessibilityLabel={`Chart range ${r.label}`} />)}
        </View>
        {c.loading && !c.data ? <Text style={Typography.caption}>Loading the chart…</Text> : null}
        {c.data && stats ? (
          <>
            <PriceChart chart={c.data} />
            <KV label={`Change over ${range}`} value={fmtPct(stats.changePct)} color={changeColor(stats.changePct)} sub={`${stats.startDate} to ${stats.endDate}, closing prices`} />
            <KV label="Highest and lowest in the period" value={`₹${fmtPrice(stats.max)} / ₹${fmtPrice(stats.min)}`} sub="Intraday highs and lows" />
          </>
        ) : null}
        {!c.loading && !c.data ? <Text style={Typography.caption}>{`No chart data right now. ${c.error ?? ''}`}</Text> : null}
        {c.fromCache && c.savedAt ? <Text style={[Typography.caption, { color: Colors.gold, marginTop: 4 }]}>Chart is the last saved copy, not live.</Text> : null}
      </Card>

      <SectionLabel>FUNDAMENTALS</SectionLabel>
      <Card>
        {f.loading && !f.data ? <Text style={Typography.caption}>Loading…</Text> : null}
        {f.data ? (
          <>
            <KV label="P/E (trailing 12 months)" value={f.data.peRatio !== null ? f.data.peRatio.toFixed(1) : 'Not available'}
              sub={f.data.peRatio !== null ? (f.data.peCrossChecked ? 'Checked against price ÷ earnings per share' : 'Could not be cross-checked') : f.data.peNote ?? undefined} />
            <KV label="P/B" value={f.data.priceToBook !== null ? f.data.priceToBook.toFixed(2) : 'Not available'} sub="Price ÷ book value per share" />
            <KV label="Earnings per share (12 months)" value={f.data.epsTtm !== null ? `₹${fmtPrice(f.data.epsTtm)}` : 'Not available'} />
            {f.data.sector ? <KV label="Sector" value={f.data.sector} sub={f.data.industry ?? undefined} /> : null}
            <Text style={[Typography.caption, { marginTop: 6 }]}>These figures come from Yahoo Finance, not from the exchange or the company filing, and may lag results. Treat them as a rough guide.</Text>
          </>
        ) : null}
        {!f.loading && !f.data ? <Text style={Typography.caption}>{`Fundamentals are not available right now. ${f.error ?? ''}`}</Text> : null}
      </Card>

      <Card>
        <Text style={Typography.label}>ETFs AND INDEX FUNDS</Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
          An ETF trades on NSE like a share, so its price and chart appear here. Its expense ratio, tracking error and holdings are not available from the data source this app uses; check the fund house's factsheet.
        </Text>
      </Card>

      {quote ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Add ${symbol} to your watchlist`} style={s.btn} onPress={addToWatchlist}>
          <Text style={s.btnTxt}>＋ Add to watchlist</Text>
        </TouchableOpacity>
      ) : null}
      {watchMsg ? <Text style={[Typography.caption, { textAlign: 'center', marginTop: Spacing.sm }]} accessibilityRole="alert">{watchMsg}</Text> : null}
      <Text style={[Typography.caption, { marginTop: Spacing.lg }]}>For information only. Not a recommendation to buy or sell.</Text>
    </MarketScreen>
  );
}

const s = StyleSheet.create({
  price: { fontSize: 32, fontWeight: '800', color: Colors.textPrimary },
  chg: { fontSize: 14, fontWeight: '700', marginTop: 2, marginBottom: Spacing.sm },
  btn: { backgroundColor: Colors.cyan, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.sm },
  btnTxt: { color: '#000', fontWeight: '900', fontSize: 14 },
});
