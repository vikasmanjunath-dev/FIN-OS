import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { MarketScreen, Freshness, Chip } from '@/components/MarketUI';
import { Card } from '@/components/TrackerUI';
import { useMarketResource } from '@/hooks/useMarketResource';
import { loadNews } from '@/lib/marketDataApi';
import { FRESH_MS, filterNews, relativeTime, tagCounts, type NewsArticle, type Sentiment } from '@/lib/marketData';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const SENT_COLOR: Record<Sentiment, string> = { bullish: Colors.teal, bearish: Colors.red, neutral: Colors.textMuted };
const SENT_LABEL: Record<Sentiment, string> = { bullish: 'Positive wording', bearish: 'Negative wording', neutral: 'Neutral wording' };

async function open(url: string | null) {
  if (!url) return;
  try { await WebBrowser.openBrowserAsync(url); } catch { /* the link could not be opened: nothing else to do */ }
}

function Article({ a, now }: { a: NewsArticle; now: number }) {
  const body = (
    <>
      <View style={s.metaRow}>
        {a.sentiment ? (
          <View style={[s.sent, { borderColor: SENT_COLOR[a.sentiment] }]}>
            <Text style={[s.sentTxt, { color: SENT_COLOR[a.sentiment] }]}>{SENT_LABEL[a.sentiment]}</Text>
          </View>
        ) : null}
        <Text style={Typography.caption}>{`${a.source} · ${relativeTime(a.publishedMs, now)}`}</Text>
      </View>
      <Text style={s.title}>{a.title}</Text>
      {a.summary ? <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]} numberOfLines={3}>{a.summary}</Text> : null}
      {a.tags.length ? <Text style={[Typography.caption, { marginTop: 6 }]}>{a.tags.map(t => `#${t}`).join('  ')}</Text> : null}
      {a.url ? <Text style={s.read}>Read the article ↗</Text> : <Text style={Typography.caption}>No link in the feed for this item.</Text>}
    </>
  );
  return a.url ? (
    <TouchableOpacity accessibilityRole="link" accessibilityLabel={`${a.title}. ${a.source}. Opens the article.`} activeOpacity={0.8} onPress={() => open(a.url)} style={s.card}>
      {body}
    </TouchableOpacity>
  ) : <View style={s.card}>{body}</View>;
}

export default function NewsScreen() {
  const r = useMarketResource(() => loadNews(), [], 0);
  const [tag, setTag] = useState<string | null>(null);
  const feed = r.data;
  const tags = useMemo(() => (feed ? tagCounts(feed.articles) : []), [feed]);
  const shown = useMemo(() => (feed ? filterNews(feed.articles, tag) : []), [feed, tag]);
  const now = Date.now();

  return (
    <MarketScreen title="Market news" subtitle="Headlines from public finance feeds, collected by your Arya backend. Tap one to read it in the in-app browser." refreshing={r.refreshing} onRefresh={r.reload}>
      <Freshness savedAt={r.savedAt} fromCache={r.fromCache} error={r.error} freshMs={FRESH_MS.news} loading={r.loading} />

      {feed?.overall ? (
        <Card>
          <Text style={Typography.label}>MOOD OF THESE HEADLINES</Text>
          <Text style={[s.mood, { color: SENT_COLOR[feed.overall.label] }]}>{SENT_LABEL[feed.overall.label].replace(' wording', '')}</Text>
          <Text style={Typography.caption}>{`${feed.overall.bullish} positive, ${feed.overall.bearish} negative, ${feed.overall.neutral} neutral of ${feed.overall.total} headlines`}</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={Typography.label}>HOW "SENTIMENT" IS WORKED OUT</Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
          {feed?.method ?? 'Keyword rules applied to the headline and summary (not an AI model and not a reading of the full article). It can misread context, sarcasm and negation.'}
          {' '}It describes the wording of a headline, not whether a stock will rise or fall. It is not advice.
        </Text>
        {feed?.sources ? (
          <Text style={[Typography.caption, { marginTop: 6 }]}>
            {`${feed.sources.ok} of ${feed.sources.total} news sources answered on the last refresh.`}
          </Text>
        ) : null}
      </Card>

      {tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: Spacing.sm }}>
          <Chip label="All" active={tag === null} onPress={() => setTag(null)} accessibilityLabel="Show all news" />
          {tags.map(t => (
            <Chip key={t.tag} label={`${t.tag} ${t.count}`} active={tag === t.tag} onPress={() => setTag(tag === t.tag ? null : t.tag)} accessibilityLabel={`Filter by ${t.tag}`} />
          ))}
        </View>
      )}

      {r.loading && !feed ? <Text style={Typography.caption}>Loading headlines…</Text> : null}
      {!r.loading && !feed ? (
        <Card><Text style={Typography.body}>No news to show. {r.error ?? ''}</Text></Card>
      ) : null}
      {feed && shown.length === 0 ? <Card><Text style={Typography.body}>{tag ? `No headlines tagged ${tag}.` : 'No headlines right now.'}</Text></Card> : null}
      {shown.map(a => <Article key={a.id} a={a} now={now} />)}
      <Text style={[Typography.caption, { marginTop: Spacing.md }]}>Headlines are third-party content. FIN·OS does not edit them.</Text>
    </MarketScreen>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  sent: { borderWidth: 1, borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 2 },
  sentTxt: { fontSize: 11, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, lineHeight: 20 },
  read: { color: Colors.cyan, fontSize: 12, fontWeight: '700', marginTop: 8 },
  mood: { fontSize: 22, fontWeight: '800', marginVertical: 4 },
});
