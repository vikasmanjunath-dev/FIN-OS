import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { TrackerScreen, Card } from '@/components/TrackerUI';
import { LText, LessonBody, LessonNotes, ReviewBanner, StubView } from '@/components/LearnBlocks';
import { MANIFEST, LESSONS, REVIEW_ITEMS } from '@/lib/learnContent';
import { loadLearned, noteOpened, setLearned } from '@/lib/learnStorage';
import { nextLesson, type Learned } from '@/lib/learn';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

const TOOL_LABEL: Record<string, string> = {
  '/markets': 'Open Markets', '/tools/calculators': 'Open the calculators', '/tracker/fixed': 'Open Fixed income',
  '/tracker/gold': 'Open the Gold tracker', '/tracker/crypto': 'Open the Crypto tracker', '/tools/lifecover': 'Open Life cover',
  '/tools/stepup': 'Open SIP step-up', '/tools/calc/sip': 'Open the SIP calculator', '/plan/lifegoals': 'Open the Life goals planner', '/tracker/networth': 'Open the Net worth tracker', '/tools/homeloan': 'Open Home loan', '/tools/debt': 'Open Debt payoff', '/tools/dna': 'Open Financial DNA',
};

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lessonId = String(id);
  const entry = MANIFEST.lessons.find(l => l.id === lessonId);
  const lesson = LESSONS[lessonId];
  const [learned, setLearnedState] = useState<Learned>({});
  const [busy, setBusy] = useState(false);
  const [showSrc, setShowSrc] = useState(false);

  useFocusEffect(useCallback(() => {
    let live = true;
    loadLearned().then(l => { if (live) setLearnedState(l); });
    if (entry?.kind === 'lesson') noteOpened(lessonId);
    return () => { live = false; };
  }, [lessonId, entry?.kind]));

  if (!entry) {
    return <TrackerScreen title="Lesson" subtitle="Not found."><Card><Text style={Typography.body}>That lesson does not exist.</Text></Card></TrackerScreen>;
  }

  const done = !!learned[lessonId];
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setLearnedState(await setLearned(lessonId, !done));
    setBusy(false);
  };
  const next = nextLesson(MANIFEST, { ...learned, [lessonId]: { completed_at: null, attempts: 0 } });
  const tool = entry.tool;
  const toolBtn = tool ? (
    <TouchableOpacity style={s.toolBtn} onPress={() => router.push(tool as any)} accessibilityRole="button" accessibilityLabel={TOOL_LABEL[tool] ?? 'Open the matching tool'}>
      <Text style={s.toolTxt}>{`${TOOL_LABEL[tool] ?? 'Open the matching tool'} →`}</Text>
    </TouchableOpacity>
  ) : null;

  if (entry.kind === 'interactive' || !lesson) {
    return (
      <TrackerScreen title={entry.title} subtitle="A page on the FIN·OS website, and what the phone has for it.">
        {entry.stub ? <StubView entry={entry} /> : (
          <Card accent={Colors.cyan}>
            <LText style={Typography.body}>{`This page on the website is interactive, so it is not shown as text here.${tool ? ' The phone has a matching tool:' : ' Open it on the website to use it.'}`}</LText>
            {entry.summary ? <LText style={[Typography.caption, { marginTop: Spacing.sm }]}>{entry.summary}</LText> : null}
            {toolBtn}
          </Card>
        )}
      </TrackerScreen>
    );
  }

  return (
    <TrackerScreen title={entry.title} subtitle={`${entry.minutes} min read · from the FIN·OS website`}>
      <ReviewBanner lesson={lesson} reviews={REVIEW_ITEMS} />
      {entry.hasInteractive ? (
        <Card><LText style={Typography.caption}>The website version of this lesson has interactive charts or sliders that are not shown here.</LText></Card>
      ) : null}
      <LessonNotes lesson={lesson} />
      <TouchableOpacity style={s.srcBtn} onPress={() => setShowSrc(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: showSrc }} accessibilityLabel={showSrc ? 'Hide where each passage comes from' : 'Show where each passage comes from'}>
        <Text style={s.srcTxt}>{showSrc ? 'Hide sources of each passage' : 'Show where each passage comes from'}</Text>
      </TouchableOpacity>
      <LessonBody lesson={lesson} reviews={REVIEW_ITEMS} showSource={showSrc} />
      {toolBtn}
      <TouchableOpacity
        style={[s.learnBtn, done && s.learnBtnDone]} onPress={toggle} accessibilityRole="button" accessibilityState={{ checked: done, busy }}
        accessibilityLabel={done ? 'Learned. Tap to unmark.' : 'Mark as learned'}>
        <Text style={[s.learnTxt, done && { color: Colors.teal }]}>{done ? '✓ Learned (tap to undo)' : 'Mark as learned'}</Text>
      </TouchableOpacity>
      {done && next && next.id !== lessonId ? (
        <TouchableOpacity style={s.nextBtn} onPress={() => router.replace(`/learn/${next.id}` as any)} accessibilityRole="button" accessibilityLabel={`Next lesson: ${next.title}`}>
          <Text style={s.nextTxt}>{`Next: ${next.title} →`}</Text>
        </TouchableOpacity>
      ) : null}
      <LText style={[Typography.caption, { marginTop: Spacing.lg }]}>
        Educational content, not investment, tax or legal advice. Rates, limits and tax rules change; confirm against the official source before you act.
      </LText>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  srcBtn: { marginBottom: Spacing.md, padding: Spacing.sm, alignItems: 'flex-start' },
  srcTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 13 },
  toolBtn: { marginTop: Spacing.md, borderWidth: 1, borderColor: Colors.cyan, borderRadius: Radii.md, padding: Spacing.md, alignItems: 'center' },
  toolTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 15 },
  learnBtn: { marginTop: Spacing.md, backgroundColor: Colors.teal, borderRadius: Radii.md, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.teal },
  learnBtnDone: { backgroundColor: 'transparent' },
  learnTxt: { color: Colors.bg, fontWeight: '800', fontSize: 15 },
  nextBtn: { marginTop: Spacing.sm, padding: Spacing.md, alignItems: 'center' },
  nextTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 14 },
});
