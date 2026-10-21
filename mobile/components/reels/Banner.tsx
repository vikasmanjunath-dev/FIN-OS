import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { announce } from '@/components/reels/announce';
import { Colors, Spacing } from '@/constants/theme';

/** The gold milestone and green receipt banners over the feed. The words are the live region (the OK button is not inside it), long words scroll inside
 *  the banner at large text instead of growing over the whole screen, and the OK button stays put and 44 px tall. */
export function Banner({ tone, tag, title, body, okLabel, okText, onOk }: { tone: 'teal' | 'gold'; tag: string; title: string; body: string; okLabel: string; okText: string; onOk: () => void }) {
  const ink = tone === 'gold' ? '#FBBF24' : Colors.teal;
  useEffect(() => { announce(`${title}. ${body}`); }, [title, body]);
  return (
    <View style={[s.banner, { borderColor: tone === 'gold' ? 'rgba(251,191,36,0.6)' : 'rgba(34,211,166,0.5)' }]}>
      <ScrollView style={s.words} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        <View accessibilityLiveRegion="polite">
          <Text style={[s.tag, { color: ink }]} maxFontSizeMultiplier={1.3}>{tag}</Text>
          <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{title}</Text>
          <Text style={s.body} maxFontSizeMultiplier={1.3}>{body}</Text>
        </View>
      </ScrollView>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={okLabel} style={[s.ok, { backgroundColor: ink }]} onPress={onOk}><Text style={s.okTxt}>{okText}</Text></TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { position: 'absolute', left: Spacing.md, right: Spacing.md, bottom: 24, maxHeight: '55%', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: 18, backgroundColor: '#12304A', borderWidth: 1, overflow: 'hidden' },
  words: { flex: 1, flexShrink: 1, alignSelf: 'stretch' },
  tag: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 2 },
  body: { color: '#D8DEEC', fontSize: 13, lineHeight: 18, marginTop: 2 },
  ok: { alignSelf: 'center', minWidth: 48, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  okTxt: { color: '#000', fontSize: 14, fontWeight: '900' },
});
