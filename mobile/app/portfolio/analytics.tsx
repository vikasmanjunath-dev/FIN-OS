import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { MarketScreen } from '@/components/MarketUI';
import { Card, inr } from '@/components/TrackerUI';
import { EmptyPortfolio, NotAdvice, usePortfolioViews } from '@/components/PortfolioUI';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

const ITEMS = [
  { route: '/portfolio/sectors', icon: '🧩', title: 'Sectors and treemap', sub: 'Where your money sits, sized by value, coloured by gain on cost' },
  { route: '/portfolio/risk', icon: '📉', title: 'Risk and market sensitivity', sub: 'Last year\'s volatility, worst fall, beta against Nifty 50' },
  { route: '/portfolio/simulate', icon: '🎲', title: 'Portfolio simulation', sub: 'A range of possible values from assumptions you set' },
  { route: '/portfolio/research', icon: '📰', title: 'Holdings research', sub: 'Headlines that mention your shares, P/E and P/B, peers' },
  { route: '/market/screener', icon: '🔎', title: 'Stock screener', sub: 'Filter large companies by price moves, P/E, P/B and sector' },
];

export default function PortfolioAnalytics() {
  const { views, loaded, total, unpriced } = usePortfolioViews();
  return (
    <MarketScreen title="Portfolio analytics" subtitle="Tools that read the holdings you entered and the public market data your Arya backend fetches.">
      {!views.length ? <EmptyPortfolio loaded={loaded} /> : (
        <Card>
          <Text style={Typography.body}>{`${views.length} holding${views.length === 1 ? '' : 's'} · ${inr(total)}`}</Text>
          {unpriced ? <Text style={[Typography.caption, { color: Colors.gold }]}>{`${unpriced} without a saved market price are counted at cost.`}</Text> : null}
        </Card>
      )}
      {ITEMS.map(l => (
        <TouchableOpacity key={l.route} accessibilityRole="button" accessibilityLabel={`${l.title}. ${l.sub}`} style={s.link} onPress={() => router.push(l.route as any)}>
          <Text style={{ fontSize: 22, width: 36 }}>{l.icon}</Text>
          <View style={{ flex: 1 }}><Text style={s.title}>{l.title}</Text><Text style={Typography.caption}>{l.sub}</Text></View>
          <Text style={{ color: Colors.textMuted }}>›</Text>
        </TouchableOpacity>
      ))}
      <Card>
        <Text style={Typography.label}>NOT BUILT, AND WHY</Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
          Factor models with size, value and profitability factors (no India factor data), promoter holding trend (the backend does not fetch shareholding filings), sector look-through of mutual funds (no holdings data), and the website's AI-written news (it needs a paid API key and sends your tickers to a third party).
        </Text>
      </Card>
      <NotAdvice />
    </MarketScreen>
  );
}

const s = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
});
