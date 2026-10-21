import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Mitra } from '@/components/reels/Mitra';
import { CARD, type CardText } from '@/lib/reels/sharecard';
import type { Season } from '@/lib/reels/seasons';

/**
 * The picture a person sends on WhatsApp: Mitra, the lesson's one takeaway, its topic and the app's name. It is drawn at 360 x 450 and
 * captured at 1080 x 1350. It draws only the strings it is given (lib/reels/sharecard.ts builds them from the library's example reel),
 * so it can never show a figure the person entered. `collapsable={false}` keeps the view alive on Android so it can be captured.
 */
export const ShareCard = forwardRef<View, { text: CardText; season?: Season | null; lang: 'en' | 'hi' }>(function ShareCard({ text, season, lang }, ref) {
  const [c1, c2] = season?.tint ?? ['#0B1030', '#1B1450'];
  const long = text.takeaway.length > 100;
  return (
    <View ref={ref} collapsable={false} style={[s.card, { width: CARD.drawW, height: CARD.drawH, backgroundColor: c1 }]} accessible accessibilityLabel={text.alt}>
      <View style={[s.glow, { backgroundColor: c2 }]} />
      <View style={s.top}>
        <View style={s.chip}><Text style={s.chipTxt} numberOfLines={1}>{text.topic}</Text></View>
        {season ? <Text style={s.season}>{`${season.badge} ${season.label[lang]}`}</Text> : null}
      </View>
      <View style={s.mitra}><Mitra mood="happy" t={0} size={104} /></View>
      <Text style={s.title} numberOfLines={3}>{text.title}</Text>
      <View style={s.rule} />
      <View style={s.body}><Text style={[s.takeaway, long && s.takeawayLong]} numberOfLines={7}>{text.takeaway}</Text></View>
      <View style={s.foot}>
        <Text style={s.brand}>{text.footer}</Text>
        <Text style={s.note}>{text.notAdvice}</Text>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  card: { borderRadius: 24, paddingHorizontal: 26, paddingTop: 22, paddingBottom: 20, overflow: 'hidden' },
  glow: { position: 'absolute', top: -90, left: -60, right: -60, height: 260, borderRadius: 200, opacity: 0.85 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 26 },
  chip: { backgroundColor: 'rgba(0,212,255,0.16)', borderWidth: 1, borderColor: 'rgba(0,212,255,0.55)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, maxWidth: 170 },
  chipTxt: { color: '#7EE7FF', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  season: { color: '#FBD38D', fontSize: 11, fontWeight: '700' },
  mitra: { alignItems: 'center', marginTop: 2, marginBottom: 2 },
  title: { color: '#F5F7FA', fontSize: 21, lineHeight: 28, fontWeight: '900', textAlign: 'center' },
  rule: { alignSelf: 'center', width: 44, height: 3, borderRadius: 2, backgroundColor: '#22D3A6', marginVertical: 10 },
  body: { flex: 1, justifyContent: 'center' },
  takeaway: { color: '#E3E8F4', fontSize: 17, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  takeawayLong: { fontSize: 15, lineHeight: 23 },
  foot: { alignItems: 'center', gap: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  brand: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.4 },
  note: { color: 'rgba(255,255,255,0.62)', fontSize: 11 },
});
