import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { MarketScreen, Freshness } from '@/components/MarketUI';
import { Card, SectionLabel } from '@/components/TrackerUI';
import { EmptyPortfolio, NotAdvice, usePortfolioViews } from '@/components/PortfolioUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadNews, loadFundamentalsMany } from '@/lib/marketDataApi';
import { FRESH_MS, LARGE_CAP_LIST, cleanTicker, fmtMarketCap, fmtPrice, relativeTime, type Fundamentals } from '@/lib/marketData';
import { newsByHolding, type NewsHolding } from '@/lib/portfolioNews';
import { sameGroup, type PeerRow } from '@/lib/marketDataScreener';
import { Colors, Spacing, Typography } from '@/constants/theme';

const SENT = { bullish: 'Positive wording', bearish: 'Negative wording', neutral: 'Neutral wording' } as const;

export default function PortfolioResearch() {
  const { views, loaded } = usePortfolioViews();
  const stocks = useMemo(() => views.filter(v => v.type === 'Stock'), [views]);
  const tickers = useMemo(() => [...new Set(stocks.map(v => cleanTicker(v.symbol)).filter((x): x is string => !!x))], [stocks]);
  const news = useMarketResource(() => loadNews(100), [], 0);

  const [funds, setFunds] = useState<Record<string, Fundamentals | null>>({});
  const [prog, setProg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const key = tickers.join(',');
  useEffect(() => {
    if (!tickers.length) return;
    let alive = true;
    setProg(`Looking up company details… 0 of ${tickers.length}`);
    loadFundamentalsMany(tickers, { onProgress: (d, t) => alive && setProg(`Looking up company details… ${d} of ${t}`) }).then(res => {
      if (!alive) return;
      setFunds(Object.fromEntries(Object.entries(res).map(([s, r]) => [s, r.data]))); setProg(null);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const holdings: NewsHolding[] = stocks.map(v => ({ key: `${v.type}:${v.symbol}`, symbol: v.symbol.toUpperCase(), name: funds[v.symbol.toUpperCase()]?.name ?? v.name }));
  const pn = useMemo(() => newsByHolding(news.data?.articles ?? [], holdings), [news.data, funds, stocks]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<string | null>(null);

  // peers (opt-in: 50 lookups)
  const [peerFunds, setPeerFunds] = useState<Record<string, Fundamentals | null> | null>(null);
  const [peerProg, setPeerProg] = useState<string | null>(null);
  const loadPeers = async () => {
    setPeerProg(`Loading 50 large companies… 0 of ${LARGE_CAP_LIST.length}`);
    const res = await loadFundamentalsMany(LARGE_CAP_LIST, { onProgress: (d, t) => setPeerProg(`Loading 50 large companies… ${d} of ${t}`) });
    setPeerFunds(Object.fromEntries(Object.entries(res).map(([s, r]) => [s, r.data]))); setPeerProg(null);
  };
  const universe: (PeerRow & { name: string | null })[] = useMemo(() => Object.entries(peerFunds ?? {}).filter(([, f]) => !!f).map(([s, f]) => ({ symbol: s, name: f!.name, sector: f!.sector, industry: f!.industry, pe: f!.peRatio, pb: f!.priceToBook, marketCap: f!.marketCap })), [peerFunds]);

  const fm = (n: number | null, d = 1) => (n === null ? 'n/a' : n.toFixed(d));

  return (
    <MarketScreen title="Holdings research" subtitle="Headlines that mention your shares, and how their valuation figures compare." refreshing={news.refreshing} onRefresh={async () => { await news.reload(); setTick(t => t + 1); }}>
      {!views.length ? <EmptyPortfolio loaded={loaded} /> : !stocks.length ? (
        <Card><Text style={Typography.body}>You hold mutual funds only. Headlines and valuation ratios here are matched to shares; fund pages are under Market research.</Text></Card>
      ) : (
        <>
          <SectionLabel>HEADLINES MENTIONING YOUR SHARES</SectionLabel>
          <Freshness savedAt={news.savedAt} fromCache={news.fromCache} error={news.error} freshMs={FRESH_MS.news} loading={news.loading} />
          <Card accent={Colors.gold}>
            <Text style={Typography.caption}>
              {`How wording was rated: ${(news.data?.method ?? 'keyword rules applied to the headline and summary by your Arya backend').replace(/\.+$/, '')}. It does not understand the story. A headline is matched to a holding when the company's name (or its ticker in capitals) appears in the headline or summary, so check the headline itself. The feed is general market news: most holdings will have none.`}
            </Text>
          </Card>
          {news.data ? (
            <Text style={Typography.caption}>{`${pn.matchedArticles} of ${pn.totalArticles} headlines mention a holding. Of those: ${pn.overall.bullish} positive, ${pn.overall.bearish} negative, ${pn.overall.neutral} neutral${pn.overall.unrated ? `, ${pn.overall.unrated} not rated` : ''}.${news.data.sources ? ` ${news.data.sources.ok} of ${news.data.sources.total} news sources answered.` : ''}`}</Text>
          ) : null}
          {pn.rows.map(r => (
            <Card key={r.holding.key}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${r.holding.symbol}: ${r.articles.length} headlines. ${open === r.holding.key ? 'Hide' : 'Show'} them.`} onPress={() => setOpen(open === r.holding.key ? null : r.holding.key)}>
                <Text style={[Typography.body, { fontWeight: '800' }]}>{`${r.holding.symbol}  ·  ${r.articles.length} headline${r.articles.length === 1 ? '' : 's'}  ${open === r.holding.key ? '▾' : '▸'}`}</Text>
                <Text style={Typography.caption}>{`${r.counts.bullish} positive · ${r.counts.bearish} negative · ${r.counts.neutral} neutral${r.counts.unrated ? ` · ${r.counts.unrated} not rated` : ''}`}</Text>
              </TouchableOpacity>
              {open === r.holding.key ? r.articles.map(a => (
                <View key={a.id} style={{ marginTop: Spacing.sm }}>
                  <Text style={Typography.body}>{a.title}</Text>
                  <Text style={Typography.caption}>{`${a.source} · ${a.publishedMs ? relativeTime(a.publishedMs, Date.now()) : 'time not given'} · ${a.sentiment ? SENT[a.sentiment] : 'not rated'}`}</Text>
                </View>
              )) : null}
            </Card>
          ))}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open Market news to read the stories" onPress={() => router.push('/market/news' as any)}><Text style={{ color: Colors.cyan, fontWeight: '700' }}>Read the stories in Market news ›</Text></TouchableOpacity>
          {news.data && pn.rows.length === 0 ? <Card><Text style={Typography.body}>None of the current headlines mention your shares.</Text></Card> : null}
          {pn.quiet.length > 0 && news.data ? <Text style={Typography.caption}>{`No headline in this feed for: ${pn.quiet.map(q => q.symbol).join(', ')}.`}</Text> : null}

          <SectionLabel>VALUATION FIGURES FOR YOUR SHARES</SectionLabel>
          {prog ? <Text style={Typography.caption} accessibilityRole="alert">{prog}</Text> : null}
          <Card>
            {tickers.map(t => {
              const f = funds[t];
              const v = stocks.find(x => cleanTicker(x.symbol) === t)!;
              const loadedOne = t in funds;
              return (
                <View key={t} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border }} accessible
                  accessibilityLabel={`${t}. ${f ? `Sector ${f.sector ?? 'not named'}. P E ${fm(f.peRatio)}. P B ${fm(f.priceToBook, 2)}.` : loadedOne ? 'No company details available.' : 'Loading.'}`}>
                  <Text style={[Typography.body, { fontWeight: '800' }]}>{`${t}  ·  ₹${fmtPrice(v.lastPrice ?? v.avgPrice)}${v.priced ? ` (saved price${v.priceDate ? `, checked ${v.priceDate}` : ''})` : ' (cost, no saved price)'}`}</Text>
                  {f ? (
                    <Text style={Typography.caption}>{`${f.sector ?? 'Sector not named'}${f.industry ? ' · ' + f.industry : ''}\nP/E ${fm(f.peRatio)} · P/B ${fm(f.priceToBook, 2)} · EPS ${f.epsTtm === null ? 'n/a' : '₹' + fmtPrice(f.epsTtm)} · market value ${fmtMarketCap(f.marketCap)}`}</Text>
                  ) : <Text style={Typography.caption}>{loadedOne ? 'The data source has nothing for this ticker (an ETF, a new listing or a lookup that failed).' : 'Loading…'}</Text>}
                </View>
              );
            })}
            <Text style={[Typography.caption, { marginTop: 6 }]}>Yahoo Finance company info via your Arya backend: trailing 12-month P/E (withheld if it disagrees with price ÷ EPS), price-to-book, EPS. Third-party figures that may lag results; a gap means the source has none, not zero. The price above is the last price saved on this phone and may be stale. A high or low ratio is not a signal on its own.</Text>
          </Card>

          <SectionLabel>PEERS</SectionLabel>
          <Card>
            {!peerFunds ? (
              <>
                <Text style={Typography.caption}>Peers here means: other names among the app's fixed list of 50 large companies that Yahoo Finance puts in the same industry (or, failing that, sector) as your share. It is the source's grouping, not an analyst's peer set, and a small-cap will often have none. Loading it looks up 50 companies, which can take a minute.</Text>
                {peerProg ? <Text style={[Typography.caption, { marginTop: 6 }]} accessibilityRole="alert">{peerProg}</Text> : (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Load peers from 50 large companies" onPress={loadPeers} style={{ marginTop: 8 }}><Text style={{ color: Colors.cyan, fontWeight: '700' }}>Load peers ›</Text></TouchableOpacity>
                )}
              </>
            ) : tickers.map(t => {
              const f = funds[t];
              const g = f ? sameGroup({ symbol: t, industry: f.industry, sector: f.sector }, universe) : null;
              return (
                <View key={t} style={{ paddingVertical: 6 }}>
                  <Text style={[Typography.body, { fontWeight: '800' }]}>{t}</Text>
                  {!g ? <Text style={Typography.caption}>No sector from the data source, so no peers.</Text>
                    : g.peers.length === 0 ? <Text style={Typography.caption}>No other company in the list of 50 shares its {g.by}.</Text>
                    : <>
                        <Text style={Typography.caption}>{`Same ${g.by}: P/E ${fm(f!.peRatio)} vs`}</Text>
                        {g.peers.slice(0, 8).map(p => (
                          <TouchableOpacity key={p.symbol} accessibilityRole="button" accessibilityLabel={`${p.symbol}, P E ${fm(p.pe)}, P B ${fm(p.pb, 2)}. Open details.`} onPress={() => router.push(`/market/stock/${p.symbol}` as any)}>
                            <Text style={[Typography.caption, { color: Colors.textPrimary }]}>{`${p.symbol}   P/E ${fm(p.pe)}   P/B ${fm(p.pb, 2)}`}</Text>
                          </TouchableOpacity>
                        ))}
                      </>}
                </View>
              );
            })}
          </Card>

          <SectionLabel>PROMOTER HOLDING TREND</SectionLabel>
          <Card>
            <Text style={Typography.body}>Not available.</Text>
            <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>Promoter and pledge percentages by quarter come from the exchange shareholding filings, and your Arya backend does not fetch them. The website shows a hard-coded table that stops at one quarter; showing that here would pass old numbers off as current, so nothing is shown.</Text>
          </Card>
          <NotAdvice />
        </>
      )}
    </MarketScreen>
  );
}
