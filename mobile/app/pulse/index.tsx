import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { PulseCardView } from '@/components/PulseCard';
import { AryaTabs } from '@/components/AryaTabs';
import { recordNetWorth } from '@/lib/pulseHistoryStorage';
import { netWorthKnown } from '@/lib/aryaFacts';
import { isoDate } from '@/lib/calendar';
import { Collapsible } from '@/components/CalcUI';
import { loadArFacts } from '@/lib/aryaFactsStorage';
import { buildFeed, SECTIONS, type Feed } from '@/lib/pulseCards';
import { loadSnapshot, saveSnapshot, shouldSave } from '@/lib/pulseStorage';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const TONE = { good: Colors.teal, bad: Colors.red } as const;

export default function PulseScreen() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    (async () => {
      try {
        const [facts0, prev] = await Promise.all([loadArFacts(new Date()), loadSnapshot()]);
        // one net-worth point a day (the website's rule), recorded only when a net worth is really known
        const nwHistory = await recordNetWorth(isoDate(facts0.now), netWorthKnown(facts0) ? facts0.computed.netWorth.netWorth : null);
        const facts = { ...facts0, nwHistory };
        const f = buildFeed(facts, prev);
        if (!alive) return;
        setFeed(f);
        setFailed(false);
        if (shouldSave(prev, f.snapshot)) saveSnapshot(f.snapshot).catch(() => {});
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, []);
  useFocusEffect(load);

  const notPorted = SECTIONS.filter(s => s.status === 'not-ported');

  return (
    <TrackerScreen title="PULSE" subtitle="What matters for you today, ranked from your own records. Each card says where its numbers come from. Estimates for planning, not advice.">
      <AryaTabs current="pulse" />
      {!feed && !failed ? <ActivityIndicator color={Colors.cyan} style={{ marginTop: Spacing.xl }} /> : null}
      {failed ? (
        <Card><Text style={Typography.body}>I could not read your records just now. Pull back and open this screen again.</Text></Card>
      ) : null}

      {feed ? (
        <>
          {feed.since.length ? (
            <Card accent={Colors.cyan}>
              <Text style={s.since}>SINCE YOUR LAST VISIT</Text>
              {feed.since.map((c, i) => (
                <Text key={i} style={[s.sinceLine, { color: TONE[c.tone] }]}>{c.icon} {c.text}</Text>
              ))}
            </Card>
          ) : null}

          {feed.cards.length === 0 ? (
            <Card>
              <Text style={Typography.body}>There is nothing to rank yet. PULSE builds itself from what you record: income and spending, assets and loans, goals, policies.</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open the net worth tracker" onPress={() => router.push('/tracker/networth' as any)} style={s.btn}>
                <Text style={s.btnTxt}>Start with net worth ›</Text>
              </TouchableOpacity>
            </Card>
          ) : null}

          {feed.cards.map(c => <PulseCardView key={c.id} card={c} />)}

          {feed.waiting.length ? (
            <>
              <SectionLabel>NEEDS ONE MORE THING FROM YOU</SectionLabel>
              {feed.waiting.map(w => (
                <Card key={w.id}>
                  <Text style={s.waitTitle}>{w.title}</Text>
                  <Text style={s.waitBody}>{w.needs}</Text>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${w.routeLabel}: ${w.title}`} onPress={() => router.push(w.route as any)} style={s.btn}>
                    <Text style={s.btnTxt}>{w.routeLabel} ›</Text>
                  </TouchableOpacity>
                </Card>
              ))}
            </>
          ) : null}

          <SectionLabel>ARYA, ON THIS PHONE</SectionLabel>
          <Card>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="What Arya remembers, and what it will be told" onPress={() => router.push('/pulse/memory' as any)} style={s.linkRow}>
              <Text style={s.linkTxt}>What Arya remembers and what it will be told ›</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Life events" onPress={() => router.push('/pulse/life' as any)} style={s.linkRow}>
              <Text style={s.linkTxt}>Life events: marriage, a child, a home, a job change ›</Text>
            </TouchableOpacity>
          </Card>

          <Collapsible title={`${notPorted.length} website PULSE sections are not on the phone (and why)`}>
            {notPorted.map(n => (
              <View key={n.id} style={{ marginBottom: Spacing.sm }}>
                <Text style={s.waitTitle}>{n.web}</Text>
                <Text style={s.waitBody}>{n.why}</Text>
              </View>
            ))}
          </Collapsible>
        </>
      ) : null}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  since: { color: Colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  sinceLine: { fontSize: 13, lineHeight: 20, fontWeight: '600' },
  waitTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  waitBody: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  btn: { marginTop: Spacing.sm, alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 8, paddingHorizontal: 12 },
  btnTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 13 },
  linkRow: { paddingVertical: 10 },
  linkTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 14 },
});
