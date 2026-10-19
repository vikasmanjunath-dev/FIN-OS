import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { MarketScreen } from '@/components/MarketUI';
import { Card, SectionLabel } from '@/components/TrackerUI';
import { searchFundsLive } from '@/lib/marketDataApi';
import { clearMarketCache } from '@/lib/marketDataStorage';
import { cleanTicker, type FundNav } from '@/lib/marketData';
import { Colors, Radii, Spacing, Typography, Btn } from '@/constants/theme';

const LINKS: { route: string; icon: string; title: string; sub: string }[] = [
  { route: '/market/news', icon: '📰', title: 'Market news', sub: 'Headlines with the wording of each marked' },
  { route: '/market/screener', icon: '🔎', title: 'Stock screener', sub: 'Sort 50 large companies, or your own list, by day move and 52-week range' },
  { route: '/market/commodities', icon: '🪙', title: 'Gold, silver and oil', sub: 'World prices; gold and silver are not MCX quotes' },
  { route: '/market/fx', icon: '💱', title: 'Currency rates', sub: 'USD, EUR, GBP, JPY, AED in rupees' },
  { route: '/market/crypto', icon: '₿', title: 'Crypto prices', sub: 'Bitcoin, Ethereum and a few more, with price history' },
  { route: '/market/map', icon: '🗺️', title: 'Market map', sub: 'Indices, sectors and 50 large companies as colours' },
  { route: '/market/options', icon: '🧮', title: 'Options calculator', sub: 'Price, Greeks and strategy payoff from your own numbers' },
  { route: '/portfolio/analytics', icon: '📊', title: 'Portfolio analytics', sub: 'Sectors, risk, simulation and research on your holdings' },
];

export default function MarketHub() {
  const [sym, setSym] = useState('');
  const [fq, setFq] = useState('');
  const [funds, setFunds] = useState<FundNav[]>([]);
  const [fundMsg, setFundMsg] = useState('');
  const [msg, setMsg] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const q = fq.trim();
    if (q.length < 3) { setFunds([]); setFundMsg(''); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await searchFundsLive(q);
        if (n !== seq.current) return;
        setFunds(r);
        setFundMsg(r.length ? '' : 'No fund matches all of those words.');
      } catch {
        if (n === seq.current) { setFunds([]); setFundMsg('Fund search needs a connection to your Arya backend.'); }
      }
    }, 400);
    return () => clearTimeout(t);
  }, [fq]);

  const open = () => {
    const t = cleanTicker(sym);
    if (!t) { setMsg('Enter an NSE ticker such as RELIANCE, HDFCBANK or NIFTYBEES.'); return; }
    setMsg('');
    router.push(`/market/stock/${encodeURIComponent(t)}` as any);
  };

  return (
    <MarketScreen title="Market research" subtitle="Prices, history and news from your Arya backend. For information, not advice.">
      <SectionLabel>LOOK UP A SHARE OR ETF</SectionLabel>
      <Card>
        <TextInput accessibilityLabel="NSE ticker" value={sym} onChangeText={setSym} placeholder="NSE ticker, e.g. INFY" placeholderTextColor={Colors.textDim}
          autoCapitalize="characters" autoCorrect={false} maxLength={24} onSubmitEditing={open} style={s.input} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Show this share" style={s.btn} onPress={open}><Text style={s.btnTxt}>Show price and chart</Text></TouchableOpacity>
        {msg ? <Text style={[Typography.caption, { color: Colors.gold, marginTop: 6 }]} accessibilityRole="alert">{msg}</Text> : null}
      </Card>

      <SectionLabel>FIND A MUTUAL FUND</SectionLabel>
      <Card>
        <TextInput accessibilityLabel="Mutual fund name" value={fq} onChangeText={setFq} placeholder="Fund name, e.g. axis large cap direct" placeholderTextColor={Colors.textDim}
          autoCapitalize="none" autoCorrect={false} maxLength={60} style={s.input} />
        {fundMsg ? <Text style={[Typography.caption, { marginTop: 6 }]}>{fundMsg}</Text> : null}
        {funds.slice(0, 15).map(f => (
          <TouchableOpacity key={f.code} accessibilityRole="button" accessibilityLabel={`Open ${f.name}`} style={s.fund} onPress={() => router.push(`/market/fund/${f.code}` as any)}>
            <Text style={s.fundName} numberOfLines={2}>{f.name}</Text>
            <Text style={Typography.caption}>{[f.fundHouse, f.plan, f.option].filter(Boolean).join(' · ')}</Text>
          </TouchableOpacity>
        ))}
      </Card>

      <SectionLabel>MORE</SectionLabel>
      {LINKS.map(l => (
        <TouchableOpacity key={l.route} accessibilityRole="button" accessibilityLabel={`${l.title}. ${l.sub}`} style={s.link} onPress={() => router.push(l.route as any)}>
          <Text style={{ fontSize: 22, width: 36 }}>{l.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.linkTitle}>{l.title}</Text>
            <Text style={Typography.caption}>{l.sub}</Text>
          </View>
          <Text style={{ color: Colors.textMuted }}>›</Text>
        </TouchableOpacity>
      ))}

      <Card>
        <Text style={Typography.label}>WHAT IS NOT HERE</Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
          Option chains and live option prices, futures, bond and money-market yields, and FII/DII flows have no live data source behind the app yet, so they are not shown rather than filled with example numbers.
        </Text>
      </Card>

      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear saved market data from this phone" onPress={async () => { const n = await clearMarketCache(); setMsg(n ? 'Saved market data cleared.' : 'There was no saved market data.'); }}>
        <Text style={s.clear}>Clear saved market data on this phone</Text>
      </TouchableOpacity>
    </MarketScreen>
  );
}

const s = StyleSheet.create({
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, color: Colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10 },
  btn: { ...Btn.base, backgroundColor: Colors.cyan, marginTop: Spacing.sm },
  btnTxt: { ...Btn.text, color: '#000' },
  fund: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 10, marginTop: 8 },
  fundName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  link: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm },
  linkTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  clear: { color: Colors.cyan, fontWeight: '700', textAlign: 'center', paddingVertical: Spacing.lg },
});
