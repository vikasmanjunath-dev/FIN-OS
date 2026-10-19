import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Bar, Card, TrackerScreen } from '@/components/TrackerUI';
import { Cast, CAST_IDS, type CastId } from '@/components/reels/Cast';
import { useClock } from '@/hooks/useClock';
import { libraryById } from '@/lib/reels/library';
import { inSeason, seriesById, seriesProgress } from '@/lib/reels/series';
import { loadWatched, type Watched } from '@/lib/reelsStorage';
import { useLang } from '@/lib/i18n';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lang = useLang();
  const hi = lang === 'hi';
  const [watched, setWatched] = useState<Watched>({});
  useFocusEffect(useCallback(() => { let live = true; loadWatched().then(w => { if (live) setWatched(w); }); return () => { live = false; }; }, []));
  const t = useClock(true);
  const sr = seriesById(String(id));
  if (!sr) return <TrackerScreen title={hi ? 'सीरीज़' : 'Series'} subtitle={hi ? 'यह सीरीज़ नहीं मिली।' : 'That series does not exist.'}><View /></TrackerScreen>;
  const p = seriesProgress(sr, watched);
  const open = (reel: string) => router.push(`/learn/reels?id=${reel}` as any);

  return (
    <TrackerScreen title={`${sr.icon} ${sr.title[lang]}`} subtitle={sr.premise[lang]}>
      <Card accent={p.complete ? Colors.teal : Colors.purple}>
        <Text style={Typography.label}>{hi ? 'कहानी' : 'THE STORY'}</Text>
        <View style={s.castRow}>
          <View accessible accessibilityLabel={`${sr.cast.name}, ${sr.cast.line[lang]}`}><Cast who={castOf(sr.cast.name)} mood={p.complete ? 'cheer' : p.done ? 'happy' : 'think'} t={t} size={84} /></View>
          <Text style={[s.cast, { flex: 1 }]}>{`${sr.cast.name}, ${sr.cast.line[lang]}`}</Text>
        </View>
        <Bar pct={(p.done / p.total) * 100} color={p.complete ? Colors.teal : Colors.purple} height={6} />
        <Text style={[Typography.caption, { marginTop: 6 }]}>{`${p.done}/${p.total}${p.done ? (hi ? ` · ${p.right} सही` : ` · ${p.right} right`) : ''}${inSeason(sr, new Date()) ? '' : hi ? ' · अभी मौसम नहीं, फिर भी देख सकते हैं' : ' · out of season, still yours to watch'}`}</Text>
        {p.next !== null ? (
          <TouchableOpacity style={s.go} accessibilityRole="button" onPress={() => open(sr.episodes[p.next as number].reel)}>
            <Text style={s.goTxt}>{p.done ? (hi ? `जारी रखें: एपिसोड ${p.next + 1}` : `Continue: episode ${p.next + 1}`) : (hi ? 'पहला एपिसोड शुरू करें' : 'Start episode 1')}</Text>
          </TouchableOpacity>
        ) : null}
      </Card>

      {sr.episodes.map((e, i) => {
        const reel = libraryById(e.reel);
        const w = watched[e.reel];
        return (
          <TouchableOpacity key={e.reel} style={s.ep} accessibilityRole="button" accessibilityLabel={`${hi ? 'एपिसोड' : 'Episode'} ${i + 1}: ${reel?.title[lang] ?? e.reel}${w ? (hi ? '. देखा हुआ' : '. Watched') : ''}`} onPress={() => open(e.reel)}>
            <View style={[s.num, w && s.numDone]}><Text style={[s.numTxt, w && { color: Colors.bg }]}>{w ? '✓' : String(i + 1)}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.epTitle}>{reel?.title[lang] ?? e.reel}</Text>
              <Text style={Typography.caption}>{e.intro[lang]}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      <Card accent={Colors.gold} style={{ marginTop: Spacing.md }}>
        <Text style={Typography.label}>{hi ? 'अंत में एक क़दम' : 'THE END MOVE'}</Text>
        <Text style={s.cast}>{sr.endMove.text[lang]}</Text>
        <TouchableOpacity style={s.go} accessibilityRole="button" onPress={() => router.push(sr.endMove.href as any)}>
          <Text style={s.goTxt}>{hi ? 'अभी करें →' : 'Do it now →'}</Text>
        </TouchableOpacity>
      </Card>
    </TrackerScreen>
  );
}

const castOf = (name: string): CastId => (CAST_IDS.find(c => c === name.split(' ')[0].toLowerCase()) ?? 'aarav');

const s = StyleSheet.create({
  castRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cast: { ...Typography.h3, marginVertical: 6 },
  go: { minHeight: 48, borderRadius: Radii.md, backgroundColor: Colors.cyan, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md, paddingHorizontal: Spacing.md },
  goTxt: { color: Colors.bg, fontWeight: '800', fontSize: 15 },
  ep: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.lg, padding: Spacing.md, marginTop: Spacing.sm, minHeight: 64 },
  num: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: Colors.purple, alignItems: 'center', justifyContent: 'center' },
  numDone: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  numTxt: { color: Colors.purpleInk, fontWeight: '800' },
  epTitle: { ...Typography.h3, fontSize: 15, marginBottom: 2 },
});
