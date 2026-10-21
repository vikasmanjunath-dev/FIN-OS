import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing } from '@/constants/theme';

/** The calm stop at the end of today's episode: what was done, the one move, a teaser for tomorrow, and a clearly optional way to keep going. */
export function EpisodeEnd({ lang, count, streakLine, move, tomorrow, week, fact, pledges = 0, onMoves, onMore, onChallenges, onClose, topInset = 64 }: {
  week?: string | null; fact?: string | null; pledges?: number; onMoves?: (() => void) | null;
  lang: Lang; count: number; streakLine: string | null; move: { label: string; onPress: () => void } | null; tomorrow: string | null; onMore: () => void; onChallenges?: (() => void) | null; onClose: () => void; topInset?: number;
}) {
  const hi = lang === 'hi';
  return (
    <ScrollView style={s.scroll} contentContainerStyle={[s.page, { paddingTop: topInset }]} showsVerticalScrollIndicator={false}>
      <Text style={s.owl} maxFontSizeMultiplier={1} accessibilityElementsHidden importantForAccessibility="no">🦉</Text>
      <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{hi ? 'आज के लिए इतना काफ़ी है' : 'That’s enough for today'}</Text>
      <Text style={s.sub} maxFontSizeMultiplier={1.3}>{count > 0 ? (hi ? `आपने आज ${count} रील पूरी कीं।` : `You finished ${count} ${count === 1 ? 'reel' : 'reels'} today.`) : (hi ? 'आज का सेट यही था।' : 'That was today’s set.')}</Text>
      {streakLine ? <Text style={s.streak} maxFontSizeMultiplier={1.3}>{streakLine}</Text> : null}
      {week ? <Text style={s.week} maxFontSizeMultiplier={1.3}>{week}</Text> : null}
      {move ? (
        <View style={s.moveCard}>
          <Text style={s.moveTag} accessibilityRole="header" maxFontSizeMultiplier={1.2}>{hi ? 'आज का एक काम' : 'ONE MOVE FOR TODAY'}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={move.label} style={s.move} onPress={move.onPress}><Text style={s.moveTxt}>{`${move.label} →`}</Text></TouchableOpacity>
        </View>
      ) : null}
      {tomorrow ? <Text style={s.tomorrow} maxFontSizeMultiplier={1.3}>{hi ? `कल: ${tomorrow}` : `Tomorrow: ${tomorrow}`}</Text> : null}
      {fact ? (
        <View style={s.factCard} accessible accessibilityLabel={`${hi ? 'आज का पैसे का तथ्य' : 'Today\'s money fact'}: ${fact}`}>
          <Text style={s.factTag} maxFontSizeMultiplier={1.2}>{hi ? '💡 आज का पैसे का तथ्य' : '💡 TODAY\'S MONEY FACT'}</Text>
          <Text style={s.factTxt} maxFontSizeMultiplier={1.3}>{fact}</Text>
        </View>
      ) : null}
      {/* Done first: this is the calm stop, so stopping is the main button; going on is offered quietly after it */}
      <View style={s.actions}>
        <TouchableOpacity accessibilityRole="button" style={s.done} onPress={onClose}><Text style={s.doneTxt}>{hi ? 'ठीक है' : 'Done'}</Text></TouchableOpacity>
        {onMoves ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={pledges > 0 ? (hi ? `मेरे काम, ${pledges} चीज़ें` : `My moves, ${pledges} on the list`) : (hi ? 'मेरे काम' : 'My moves')} style={s.ghost} onPress={onMoves}><Text style={s.ghostTxt}>{pledges > 0 ? (hi ? `📌 मेरे काम (${pledges})` : `📌 My moves (${pledges})`) : (hi ? '📌 मेरे काम' : '📌 My moves')}</Text></TouchableOpacity> : null}
        {onChallenges ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={hi ? '7 दिन की चुनौती आज़माएँ' : 'Try a 7-day challenge'} style={s.ghost} onPress={onChallenges}><Text style={s.ghostTxt}>{hi ? '✅ 7 दिन की चुनौती आज़माएँ' : '✅ Try a 7-day challenge'}</Text></TouchableOpacity> : null}
        <TouchableOpacity accessibilityRole="button" style={s.ghost} onPress={onMore}><Text style={s.ghostTxt}>{hi ? 'और देखना चाहें तो (वैकल्पिक)' : 'Keep exploring (optional)'}</Text></TouchableOpacity>
      </View>
      <Text style={s.disclaimer}>{hi ? 'शिक्षा के लिए, सलाह नहीं।' : 'For education, not advice.'}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  page: { flexGrow: 1, paddingHorizontal: Spacing.lg, justifyContent: 'center', alignItems: 'stretch', paddingBottom: 40 },
  owl: { fontSize: 64, textAlign: 'center' },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center', marginTop: Spacing.sm },
  sub: { color: '#D8DEEC', fontSize: 16, textAlign: 'center', marginTop: Spacing.sm },
  streak: { color: '#FBBF24', fontSize: 15, fontWeight: '800', textAlign: 'center', marginTop: Spacing.sm },
  week: { color: '#B8C2DA', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: Spacing.xs },
  moveCard: { marginTop: Spacing.lg, padding: Spacing.md, borderRadius: Radii.xl, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  moveTag: { color: Colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  move: { minHeight: 52, borderRadius: Radii.lg, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, paddingVertical: 10, marginTop: Spacing.sm },
  moveTxt: { color: '#070A1A', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  factCard: { marginTop: Spacing.lg, padding: Spacing.md, borderRadius: Radii.xl, backgroundColor: 'rgba(251,191,36,0.08)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' },
  factTag: { color: '#FBBF24', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  factTxt: { color: '#F3EBD3', fontSize: 14, lineHeight: 21, marginTop: Spacing.xs },
  tomorrow: { color: '#C4B5FD', fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: Spacing.lg },
  actions: { gap: Spacing.sm, marginTop: Spacing.lg },
  ghost: { minHeight: 48, paddingVertical: 8, paddingHorizontal: Spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  ghostTxt: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  done: { minHeight: 48, paddingVertical: 8, paddingHorizontal: Spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.lg, backgroundColor: Colors.cyan },
  doneTxt: { color: '#000', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  disclaimer: { color: Colors.textDim, fontSize: 11, textAlign: 'center', marginTop: Spacing.lg },
});
