import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel, Bar, NavCard } from '@/components/TrackerUI';
import { LText } from '@/components/LearnBlocks';
import { MANIFEST, LESSONS } from '@/lib/learnContent';
import { loadLearned, loadOpened } from '@/lib/learnStorage';
import {
  categoryProgress, continueLesson, rowMeta, lessonBodyText, lessonsOf, nextLesson, overallProgress, searchLessons,
  type Learned, type ManifestEntry, type Opened,
} from '@/lib/learn';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const BODIES: Record<string, string> = Object.fromEntries(Object.entries(LESSONS).map(([id, l]) => [id, lessonBodyText(l)]));

const openLesson = (id: string) => router.push(`/learn/${id}` as any);

function Row({ e, learned }: { e: ManifestEntry; learned: Learned }) {
  const done = !!learned[e.id];
  const meta = rowMeta(e);
  return (
    <TouchableOpacity
      style={s.row} onPress={() => openLesson(e.id)} accessibilityRole="button"
      accessibilityLabel={`${e.title}. ${meta}.${done ? ' Learned.' : ''}${e.needsReview ? ' Some passages are under fact-check.' : ''}`}>
      <View style={[s.tick, done && { backgroundColor: Colors.teal, borderColor: Colors.teal }]}>
        {done ? <Text style={s.tickTxt}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <LText style={s.title}>{e.title}</LText>
        <LText style={Typography.caption}>{meta}{e.needsReview ? ' · under fact-check' : ''}</LText>
      </View>
      <Text style={s.chev}>›</Text>
    </TouchableOpacity>
  );
}

export default function LearnHome() {
  const [learned, setLearned] = useState<Learned>({});
  const [opened, setOpened] = useState<Opened>({});
  const [q, setQ] = useState('');
  const [openWeb, setOpenWeb] = useState(false);

  useFocusEffect(useCallback(() => {
    let live = true;
    Promise.all([loadLearned(), loadOpened()]).then(([l, o]) => { if (live) { setLearned(l); setOpened(o); } });
    return () => { live = false; };
  }, []));

  const overall = overallProgress(MANIFEST, learned);
  const cont = continueLesson(MANIFEST, learned, opened);
  const next = nextLesson(MANIFEST, learned);
  const cats = useMemo(() => categoryProgress(MANIFEST, learned), [learned]);
  const hits = q.trim() ? searchLessons(MANIFEST, q, BODIES) : null;

  return (
    <TrackerScreen title="Learn" subtitle="Short lessons from FIN·OS, on your phone. For education, not advice; check rates and rules against official sources.">
      <NavCard title="🎬 Money reels" sub="Short animated lessons with Mitra the owl: SIP, inflation, EMI and more. 30 seconds each, with a quick question." accent={Colors.purple} onPress={() => router.push('/learn/reels' as any)} />
      <NavCard title="🗺️ Money Map" sub="Nine topics by four rungs: myth, concept, decision, action. See where you are strong and what to watch next." accent={Colors.teal} onPress={() => router.push('/learn/map' as any)} />
      <NavCard title="📌 My moves" sub="What you said you would do after a reel, how each one stands, and the reels you kept for later. All on this phone." accent={Colors.gold} onPress={() => router.push('/learn/moves' as any)} />
      <NavCard title="✅ 7-day challenges" sub="One small task a day: find your money leak, or scam-proof your phone. You tick each one; a missed day costs nothing." accent={Colors.cyan} onPress={() => router.push('/learn/challenges' as any)} />
      <NavCard title="🔊 Reel voice" sub="Pick a voice, speed and style for the reels, and hear a sample with the words lighting up in time." accent={Colors.cyan} onPress={() => router.push('/learn/voice' as any)} />
      <NavCard title="📖 Story series" sub="Six short runs of reels, each following one person to one real move: first salary, a safety net, scams, tax, a home loan, retirement." accent={Colors.gold} onPress={() => router.push('/learn/series' as any)} />

      <Card accent={Colors.teal}>
        <Text style={Typography.label}>YOUR PROGRESS</Text>
        <Text style={s.big}>{`${overall.done} of ${overall.total} lessons learned`}</Text>
        <Bar pct={overall.pct} color={Colors.teal} height={6} />
        <Text style={[Typography.caption, { marginTop: 6 }]}>Marked on this device and shared with the website's Learn progress. Lessons you mark count toward the Knowledge part of your Health Score.</Text>
      </Card>

      <TextInput
        style={s.search} value={q} onChangeText={setQ} placeholder="Search lessons (SIP, RSI, insurance…)"
        placeholderTextColor={Colors.textDim} accessibilityLabel="Search lessons" autoCorrect={false} returnKeyType="search"
      />

      {hits ? (
        <>
          <SectionLabel>{`${hits.length} RESULT${hits.length === 1 ? '' : 'S'}`}</SectionLabel>
          {hits.length === 0 ? <Card><Text style={Typography.body}>No lesson matches "{q.trim()}".</Text></Card> : null}
          {hits.map(e => <Row key={e.id} e={e} learned={learned} />)}
        </>
      ) : (
        <>
          {cont ? (
            <>
              <SectionLabel>CONTINUE</SectionLabel>
              <Row e={cont} learned={learned} />
            </>
          ) : next ? (
            <>
              <SectionLabel>UP NEXT</SectionLabel>
              <Row e={next} learned={learned} />
            </>
          ) : null}
          {cats.map(c => (
            <View key={c.id}>
              <SectionLabel>{c.total ? `${c.title.toUpperCase()}  ·  ${c.learned}/${c.total}` : c.title.toUpperCase()}</SectionLabel>
              {c.total === 0 ? (
                <TouchableOpacity style={s.row} onPress={() => setOpenWeb(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: openWeb }}
                  accessibilityLabel={`${lessonsOf(MANIFEST, c.id).length} interactive pages on the website. ${openWeb ? 'Hide' : 'Show'} the list.`}>
                  <View style={{ flex: 1 }}>
                    <LText style={s.title}>{`${lessonsOf(MANIFEST, c.id).length} pages that are interactive, menus or website only`}</LText>
                    <LText style={Typography.caption}>Each has a page here that says what it is and what the phone has instead.</LText>
                  </View>
                  <Text style={s.chev}>{openWeb ? '⌄' : '›'}</Text>
                </TouchableOpacity>
              ) : null}
              {c.total === 0 && !openWeb ? null : lessonsOf(MANIFEST, c.id).map(e => <Row key={e.id} e={e} learned={learned} />)}
            </View>
          ))}
        </>
      )}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  big: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800', marginVertical: 6 },
  search: { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1, borderRadius: Radii.md, color: Colors.textPrimary, padding: Spacing.md, marginBottom: Spacing.md, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1, borderRadius: Radii.md, padding: Spacing.md, marginBottom: Spacing.sm },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.borderHi, alignItems: 'center', justifyContent: 'center' },
  tickTxt: { color: Colors.bg, fontSize: 14, fontWeight: '800' },
  title: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  chev: { color: Colors.textMuted, fontSize: 22 },
});
