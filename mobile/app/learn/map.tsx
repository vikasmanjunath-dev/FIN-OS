import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Bar, Card, TrackerScreen } from '@/components/TrackerUI';
import { LIBRARY, libraryById } from '@/lib/reels/library';
import { LEVEL_NAME, TOPIC_NAME, buildMap, type Rung, type RungState } from '@/lib/reels/map';
import { LEVELS } from '@/lib/reels/meta';
import { loadWatched, type Watched } from '@/lib/reelsStorage';
import { useLang } from '@/lib/i18n';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

const STATE_LABEL: Record<RungState, { en: string; hi: string }> = {
  empty: { en: 'no reels yet', hi: 'अभी कोई रील नहीं' }, none: { en: 'not started', hi: 'शुरू नहीं' }, some: { en: 'in progress', hi: 'जारी' }, done: { en: 'done', hi: 'पूरा' },
};

function Dot({ rung, lang }: { rung: Rung; lang: 'en' | 'hi' }) {
  const label = `${LEVEL_NAME[rung.level][lang]}: ${STATE_LABEL[rung.state][lang]}${rung.total ? `, ${rung.watched}/${rung.total}` : ''}`;
  const style = [s.dot, rung.state === 'empty' && s.dotEmpty, rung.state === 'some' && s.dotSome, rung.state === 'done' && s.dotDone];
  return (
    <View style={s.dotCell} accessible accessibilityLabel={label}>
      <View style={style}>{rung.state === 'done' ? <Text style={s.tick}>✓</Text> : rung.state === 'some' ? <Text style={s.partial}>{`${rung.watched}/${rung.total}`}</Text> : null}</View>
    </View>
  );
}

/** The Money Map: nine topics by four rungs, filling as reels are finished, each row leading to the next reel. */
export default function MoneyMap() {
  const lang = useLang();
  const [watched, setWatched] = useState<Watched>({});
  useFocusEffect(useCallback(() => { let live = true; loadWatched().then(w => { if (live) setWatched(w); }); return () => { live = false; }; }, []));
  const rows = useMemo(() => buildMap(LIBRARY, watched), [watched]);
  const totals = useMemo(() => ({ seen: rows.reduce((n, r) => n + r.watched, 0), all: rows.reduce((n, r) => n + r.total, 0) }), [rows]);
  const hi = lang === 'hi';

  return (
    <TrackerScreen title={hi ? 'मनी मैप' : 'Money Map'} subtitle={hi ? 'नौ विषय, चार पायदान: भ्रम, अवधारणा, फ़ैसला, कदम। रील पूरी करने पर भरता है।' : 'Nine topics, four rungs: myth, concept, decision, action. It fills as you finish reels.'}>
      <Card accent={Colors.purple}>
        <Text style={Typography.label}>{hi ? 'आपका नक़्शा' : 'YOUR MAP'}</Text>
        <Text style={s.big}>{hi ? `${totals.all} में से ${totals.seen} रील देखी` : `${totals.seen} of ${totals.all} reels watched`}</Text>
        <Bar pct={totals.all ? (totals.seen / totals.all) * 100 : 0} color={Colors.purple} height={6} />
        <View style={s.legend}>{LEVELS.map(l => <Text key={l} style={s.legendTxt}>{LEVEL_NAME[l][lang]}</Text>)}</View>
      </Card>

      {rows.map(r => {
        const next = r.next ? libraryById(r.next) : null;
        return (
          <TouchableOpacity
            key={r.topic} style={s.row} disabled={!next} accessibilityRole="button"
            accessibilityLabel={`${TOPIC_NAME[r.topic][lang]}, ${r.watched} of ${r.total} reels watched.${next ? ` Next: ${next.title[lang]}.` : ' All watched.'}`}
            onPress={() => next && router.push(`/learn/reels?id=${next.id}` as any)}>
            <View style={s.head}>
              <Text style={s.topic}>{TOPIC_NAME[r.topic][lang]}</Text>
              <Text style={Typography.caption}>{`${r.watched}/${r.total}`}</Text>
            </View>
            <View style={s.dots}>{r.rungs.map(g => <Dot key={g.level} rung={g} lang={lang} />)}</View>
            <Text style={[Typography.caption, { marginTop: 6 }]} numberOfLines={2}>{next ? `${hi ? 'अगली: ' : 'Next: '}${next.title[lang]}` : hi ? 'सब देख ली गईं ✓' : 'All watched ✓'}</Text>
          </TouchableOpacity>
        );
      })}
      <Text style={[Typography.caption, { marginTop: Spacing.md }]}>{hi ? 'सिर्फ़ इसी फ़ोन पर, कोई अंक या लेवल नहीं। एक भरा खाना बस यही बताता है कि आपने वह रील देखी।' : 'Kept on this phone only. No points or levels: a filled box only means you watched those reels.'}</Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  big: { ...Typography.h3, marginVertical: 4 },
  legend: { flexDirection: 'row', marginTop: Spacing.sm },
  legendTxt: { flex: 1, textAlign: 'center', fontSize: 11, color: Colors.textDim },
  row: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.lg, padding: Spacing.md, marginTop: Spacing.sm, minHeight: 44 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topic: { ...Typography.h3 },
  dots: { flexDirection: 'row', marginTop: Spacing.sm },
  dotCell: { flex: 1, alignItems: 'center' },
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: Colors.borderMed, alignItems: 'center', justifyContent: 'center' },
  dotEmpty: { borderStyle: 'dashed', opacity: 0.4 },
  dotSome: { borderColor: Colors.purple },
  dotDone: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  tick: { color: Colors.bg, fontWeight: '900', fontSize: 15 },
  partial: { color: Colors.purpleInk, fontWeight: '800', fontSize: 11 },
});
