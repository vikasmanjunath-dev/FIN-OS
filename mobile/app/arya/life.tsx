import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { AryaTabs } from '@/components/AryaTabs';
import { useAryaFacts } from '@/components/AryaFacts';
import { lifeTimeline } from '@/lib/aryaLife';
import { loadLifeEvents } from '@/lib/lifeEventsStorage';
import type { DeclaredEvent } from '@/lib/lifeEvents';
import { Colors, Spacing, Radii } from '@/constants/theme';

export default function AryaLife() {
  const { facts, failed } = useAryaFacts();
  const [events, setEvents] = useState<DeclaredEvent[]>([]);
  useFocusEffect(useCallback(() => { loadLifeEvents().then(setEvents).catch(() => {}); }, []));
  const items = facts ? lifeTimeline(facts, events) : [];
  return (
    <TrackerScreen title="Life" subtitle="The dated things you recorded or told Arya, in order, and what each life event makes Arya check. Nothing is placed on your timeline by age or benchmark.">
      <AryaTabs current="life" />
      {!facts && !failed ? <ActivityIndicator color={Colors.cyan} /> : null}
      {failed ? <Card><Text style={s.body}>I could not read your records just now.</Text></Card> : null}
      {facts ? (
        <>
          {events.length === 0 ? <Card><Text style={s.body}>No life events declared. Tell Arya about a marriage, a child, a home, a job change, a windfall, education or a loss of income, with a date, and it shows what changes.</Text></Card> : null}
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Declare or edit life events" onPress={() => router.push('/pulse/life' as any)} style={s.btn}><Text style={s.btnT}>Declare or edit life events ›</Text></TouchableOpacity>
          <SectionLabel>TIMELINE</SectionLabel>
          {items.map((it, i) => (
            <Card key={`${it.date}-${it.title}-${i}`} accent={it.kind === 'now' ? Colors.purple : it.kind === 'event' ? Colors.gold : Colors.cyan}>
              <Text style={s.date}>{it.kind === 'now' ? 'TODAY' : it.date}</Text>
              <Text style={s.t}>{it.icon} {it.title}</Text>
              <Text style={s.body}>{it.sub}</Text>
              {it.changes.length ? <Text style={s.body}>{it.kind === 'event' && it.phase === 'active' ? 'Prompts: ' : 'Will look at: '}{it.changes.join(', ')}</Text> : null}
              {it.route && it.kind !== 'now' ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${it.title}`} onPress={() => router.push(it.route as any)} style={s.link}><Text style={s.btnT}>Open ›</Text></TouchableOpacity> : null}
            </Card>
          ))}
          <Text style={s.src}>From: life events you declared, goal dates in the Goals tracker, and the retirement age in the Retirement planner (shown only when your age is recorded too).</Text>
        </>
      ) : null}
    </TrackerScreen>
  );
}
const s = StyleSheet.create({
  date: { color: Colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  t: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 2 },
  body: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  src: { color: Colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 4 },
  btn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 8, paddingHorizontal: 12, marginBottom: Spacing.sm },
  link: { marginTop: 6, alignSelf: 'flex-start' },
  btnT: { color: Colors.cyan, fontWeight: '700', fontSize: 13 },
});
