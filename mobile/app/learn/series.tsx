import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Bar, NavCard, TrackerScreen } from '@/components/TrackerUI';
import { SERIES, inSeason, seriesProgress } from '@/lib/reels/series';
import { loadWatched, type Watched } from '@/lib/reelsStorage';
import { useLang } from '@/lib/i18n';
import { Colors, Spacing, Typography } from '@/constants/theme';

/** Story series: a short run of reels about one person's money, ending in one move. */
export default function SeriesList() {
  const lang = useLang();
  const hi = lang === 'hi';
  const [watched, setWatched] = useState<Watched>({});
  useFocusEffect(useCallback(() => { let live = true; loadWatched().then(w => { if (live) setWatched(w); }); return () => { live = false; }; }, []));
  const now = new Date();
  const list = useMemo(() => SERIES.map(sr => ({ sr, p: seriesProgress(sr, watched), season: inSeason(sr, now) })), [watched]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TrackerScreen title={hi ? 'कहानी सीरीज़' : 'Story series'} subtitle={hi ? 'पाँच से आठ छोटी रील, एक व्यक्ति की कहानी, और अंत में एक क़दम।' : 'Five to eight short reels about one person’s money, ending in one move.'}>
      {list.map(({ sr, p, season }) => (
        <View key={sr.id}>
          <NavCard
            title={`${sr.icon} ${sr.title[lang]}`}
            sub={`${sr.cast.name}: ${sr.cast.line[lang]}\n${p.complete ? (hi ? 'पूरी ✓' : 'Complete ✓') : `${p.done}/${p.total}`}${season ? '' : hi ? ' · अभी मौसम नहीं' : ' · out of season'}`}
            accent={p.complete ? Colors.teal : Colors.purple}
            onPress={() => router.push(`/learn/series/${sr.id}` as any)} />
          <View style={s.bar}><Bar pct={(p.done / p.total) * 100} color={p.complete ? Colors.teal : Colors.purple} height={4} /></View>
        </View>
      ))}
      <Text style={[Typography.caption, { marginTop: Spacing.sm }]}>{hi ? 'हर रील अपने आप में पूरी है; सीरीज़ बस उन्हें क्रम और कहानी देती है।' : 'Every reel stands on its own. A series just gives them an order and a story.'}</Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({ bar: { marginTop: -Spacing.sm, marginBottom: Spacing.md, paddingHorizontal: Spacing.xs } });
