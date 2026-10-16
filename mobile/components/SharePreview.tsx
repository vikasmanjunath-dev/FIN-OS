import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Share, Platform } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

/**
 * Shows exactly the text that would be shared, then hands it to the phone's share sheet when the person taps Share.
 * Nothing leaves the phone before that tap, and the person picks where it goes.
 */
export function SharePreview({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const share = async () => {
    try {
      await Share.share({ message: text, title });
      setMsg('');
    } catch {
      // The web preview has no share sheet: copy instead, so the person can still paste it where they want.
      try {
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(text); setMsg('Copied. Paste it where you want to send it.'); }
        else setMsg('Could not open the share sheet. Select the text above and copy it.');
      } catch { setMsg('Could not open the share sheet. Select the text above and copy it.'); }
    }
  };
  return (
    <View style={s.wrap}>
      <Text style={s.title}>{title}</Text>
      <Text style={[Typography.caption, { marginBottom: Spacing.sm, lineHeight: 17 }]}>This is exactly what will be shared, and you choose where it goes. Nothing has been sent.</Text>
      <TextInput style={s.box} value={text} editable={false} multiline selectTextOnFocus accessibilityLabel={`${title} (text to share)`} />
      <View style={s.row}>
        <TouchableOpacity style={s.primary} accessibilityRole="button" onPress={share}><Text style={s.primaryTxt}>Share…</Text></TouchableOpacity>
        <TouchableOpacity style={s.secondary} accessibilityRole="button" onPress={onClose}><Text style={s.secondaryTxt}>Close</Text></TouchableOpacity>
      </View>
      {msg ? <Text style={[Typography.caption, { marginTop: Spacing.sm }]} accessibilityLiveRegion="polite">{msg}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.lg, padding: Spacing.md, marginBottom: Spacing.md },
  title: { ...Typography.h3, marginBottom: 4 },
  box: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, padding: Spacing.sm, color: Colors.textPrimary, fontSize: 11, minHeight: 140, maxHeight: 280, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10, marginTop: Spacing.md },
  primary: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 11, paddingHorizontal: Spacing.lg },
  primaryTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
  secondary: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingVertical: 11, paddingHorizontal: Spacing.lg },
  secondaryTxt: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
});
