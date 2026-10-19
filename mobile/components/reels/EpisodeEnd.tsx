import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing } from '@/constants/theme';

/** The calm stop at the end of today's episode: what was done, the one move, a teaser for tomorrow, and a clearly optional way to keep going. */
export function EpisodeEnd({ lang, count, streakLine, move, tomorrow, onMore, onChallenges, onClose, topInset = 64 }: {
  lang: Lang; count: number; streakLine: string | null; move: { label: string; onPress: () => void } | null; tomorrow: string | null; onMore: () => void; onChallenges?: (() => void) | null; onClose: () => void; topInset?: number;
}) {
  const hi = lang === 'hi';
  return (
    <View style={[s.page, { paddingTop: topInset }]}>
      <Text style={s.owl}>🦉</Text>
      <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{hi ? 'आज के लिए इतना काफ़ी है' : 'That’s enough for today'}</Text>
      <Text style={s.sub} maxFontSizeMultiplier={1.3}>{count > 0 ? (hi ? `आपने आज ${count} रील पूरी कीं।` : `You finished ${count} ${count === 1 ? 'reel' : 'reels'} today.`) : (hi ? 'आज का सेट यही था।' : 'That was today’s set.')}</Text>
      {streakLine ? <Text style={s.streak}>{streakLine}</Text> : null}
      {move ? (
        <View style={s.moveCard}>
          <Text style={s.moveTag}>{hi ? 'आज का एक काम' : 'ONE MOVE FOR TODAY'}</Text>
          <TouchableOpacity accessibilityRole="button" style={s.move} onPress={move.onPress}><Text style={s.moveTxt}>{`${move.label} →`}</Text></TouchableOpacity>
        </View>
      ) : null}
      {tomorrow ? <Text style={s.tomorrow} maxFontSizeMultiplier={1.3}>{hi ? `कल: ${tomorrow}` : `Tomorrow: ${tomorrow}`}</Text> : null}
      <View style={s.actions}>
        <TouchableOpacity accessibilityRole="button" style={s.ghost} onPress={onMore}><Text style={s.ghostTxt}>{hi ? 'और देखना चाहें तो (वैकल्पिक)' : 'Keep exploring (optional)'}</Text></TouchableOpacity>
        {onChallenges ? <TouchableOpacity accessibilityRole="button" style={s.ghost} onPress={onChallenges}><Text style={s.ghostTxt}>{hi ? '✅ 7 दिन की चुनौती आज़माएँ' : '✅ Try a 7-day challenge'}</Text></TouchableOpacity> : null}
        <TouchableOpacity accessibilityRole="button" style={s.done} onPress={onClose}><Text style={s.doneTxt}>{hi ? 'ठीक है' : 'Done'}</Text></TouchableOpacity>
      </View>
      <Text style={s.disclaimer}>{hi ? 'शिक्षा के लिए, सलाह नहीं।' : 'For education, not advice.'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: Spacing.lg, justifyContent: 'center', alignItems: 'stretch', paddingBottom: 40 },
  owl: { fontSize: 64, textAlign: 'center' },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center', marginTop: Spacing.sm },
  sub: { color: '#D8DEEC', fontSize: 16, textAlign: 'center', marginTop: Spacing.sm },
  streak: { color: '#FBBF24', fontSize: 15, fontWeight: '800', textAlign: 'center', marginTop: Spacing.sm },
  moveCard: { marginTop: Spacing.lg, padding: Spacing.md, borderRadius: Radii.xl, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  moveTag: { color: Colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  move: { minHeight: 52, borderRadius: Radii.lg, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, paddingVertical: 10, marginTop: Spacing.sm },
  moveTxt: { color: '#070A1A', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  tomorrow: { color: '#C4B5FD', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: Spacing.lg },
  actions: { gap: Spacing.sm, marginTop: Spacing.lg },
  ghost: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  ghostTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  done: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, backgroundColor: Colors.cyan },
  doneTxt: { color: '#000', fontSize: 15, fontWeight: '900' },
  disclaimer: { color: Colors.textDim, fontSize: 11, textAlign: 'center', marginTop: Spacing.lg },
});
