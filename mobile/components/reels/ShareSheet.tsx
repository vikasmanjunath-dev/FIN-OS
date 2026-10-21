import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { ShareCard } from '@/components/reels/ShareCard';
import { SharePreview } from '@/components/SharePreview';
import { cardText, CARD } from '@/lib/reels/sharecard';
import { shareCardImage, shareText } from '@/lib/reels/share';
import { seasonOf } from '@/lib/reels/seasons';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

/**
 * What opens when a person taps Share on a reel: the picture that would be sent, with "Share as image" and "Share as text". If the picture
 * cannot be made on this device, the text share opens instead with a plain note. Both come from the library's example reel, so neither can
 * carry a figure the person entered, and nothing leaves the phone until they pick where it goes in the share sheet.
 */
export function ShareSheet({ reelId, lang, onClose }: { reelId: string; lang: Lang; onClose: () => void }) {
  const card = useRef<View>(null);
  const { width, height } = useWindowDimensions();
  const [mode, setMode] = useState<'choose' | 'text'>('choose');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const text = cardText(reelId, lang);
  const season = useMemo(() => seasonOf(new Date()), []);
  const hi = lang === 'hi';
  if (!text) return null;

  const scale = Math.min(1, (width - 2 * Spacing.md - 2 * Spacing.md) / CARD.drawW, (height * 0.5) / CARD.drawH);   // the preview is smaller on a small phone; the capture is always full size
  const toText = (why: string) => { setNote(why); setMode('text'); };
  const asImage = async () => {
    if (busy) return;
    setBusy(true); setNote('');
    try {
      const r = await shareCardImage(card.current, text.title);
      if (r === 'saved') setNote(hi ? 'तस्वीर सेव हो गई। उसे जहाँ चाहें भेजें।' : 'Picture saved. Send it wherever you like.');
      else if (r === 'unavailable') toText(hi ? 'इस फ़ोन पर तस्वीर साझा नहीं हो सकती। यह रहा पाठ।' : 'This phone cannot share a picture, so here is the text instead.');
    } catch {
      toText(hi ? 'तस्वीर नहीं बन पाई। यह रहा पाठ।' : 'Could not make the picture, so here is the text instead.');
    }
    setBusy(false);
  };

  if (mode === 'text') {
    return (
      <View>
        {note ? <Text style={s.note} accessibilityLiveRegion="polite">{note}</Text> : null}
        <SharePreview title={hi ? 'यह पाठ साझा करें' : 'Share this lesson'} text={shareText(reelId, lang)} onClose={onClose} />
      </View>
    );
  }
  return (
    <View style={s.wrap}>
      <Text style={s.title}>{hi ? 'यह पाठ साझा करें' : 'Share this lesson'}</Text>
      <Text style={[Typography.caption, { marginBottom: Spacing.sm, lineHeight: 17 }]}>{hi ? 'यही तस्वीर जाएगी। इसमें सिर्फ़ उदाहरण है, आपके अपने आँकड़े नहीं। आप चुनते हैं कि कहाँ भेजनी है।' : 'This is the picture that will be sent. It holds the example only, never your own figures. You choose where it goes.'}</Text>
      <ScrollView style={{ maxHeight: height * 0.55 }} contentContainerStyle={{ alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        <View style={{ width: CARD.drawW * scale, height: CARD.drawH * scale }}>
          {/* Scaling is by transform, so the view that is captured stays at its full drawing size. */}
          <View style={{ width: CARD.drawW, height: CARD.drawH, transform: [{ scale }], transformOrigin: 'top left' }}>
            <ShareCard ref={card} text={text} season={season} lang={lang} />
          </View>
        </View>
      </ScrollView>
      <View style={s.row}>
        <TouchableOpacity style={[s.primary, busy && { opacity: 0.6 }]} accessibilityRole="button" accessibilityState={{ busy }} onPress={asImage}>
          {busy ? <ActivityIndicator color={Colors.bg} /> : <Text style={s.primaryTxt}>{hi ? 'तस्वीर भेजें' : 'Share as image'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.secondary} accessibilityRole="button" onPress={() => { setNote(''); setMode('text'); }}><Text style={s.secondaryTxt}>{hi ? 'पाठ भेजें' : 'Share as text'}</Text></TouchableOpacity>
        <TouchableOpacity style={s.secondary} accessibilityRole="button" onPress={onClose}><Text style={s.secondaryTxt}>{hi ? 'बंद' : 'Close'}</Text></TouchableOpacity>
      </View>
      {note ? <Text style={[Typography.caption, { marginTop: Spacing.sm }]} accessibilityLiveRegion="polite">{note}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.lg, padding: Spacing.md, marginBottom: Spacing.md },
  title: { ...Typography.h3, marginBottom: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: Spacing.md },
  primary: { backgroundColor: Colors.cyan, borderRadius: Radii.md, minHeight: 44, minWidth: 120, paddingHorizontal: Spacing.lg, alignItems: 'center', justifyContent: 'center' },
  primaryTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
  secondary: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, minHeight: 44, paddingHorizontal: Spacing.lg, alignItems: 'center', justifyContent: 'center' },
  secondaryTxt: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  note: { ...Typography.caption, color: Colors.textPrimary, backgroundColor: Colors.surface, padding: Spacing.sm, borderRadius: Radii.md, marginBottom: Spacing.sm, lineHeight: 17 },
});
