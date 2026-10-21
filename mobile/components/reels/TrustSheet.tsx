import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Trust } from '@/lib/reels/trust';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing } from '@/constants/theme';

/** "How this is worked out": the formula, what was assumed and when the note was last checked, for a reel that quotes figures. */
export function TrustSheet({ trust, lang, visible, onClose }: { trust: Trust | null; lang: Lang; visible: boolean; onClose: () => void }) {
  const hi = lang === 'hi';
  return (
    <Modal visible={visible && !!trust} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.back}>
        <View style={s.card} accessibilityViewIsModal>
          <ScrollView>
            <Text style={s.title} accessibilityRole="header">{hi ? 'यह कैसे निकाला गया' : 'How this is worked out'}</Text>
            <Text style={s.label} accessibilityRole="header">{hi ? 'सूत्र' : 'FORMULA'}</Text>
            <Text style={s.body}>{trust?.formula[lang]}</Text>
            <Text style={s.label} accessibilityRole="header">{hi ? 'हमने क्या माना' : 'WHAT WE ASSUMED'}</Text>
            <Text style={s.body}>{trust?.assumes[lang]}</Text>
            <Text style={s.label} accessibilityRole="header">{hi ? 'आख़िरी जाँच' : 'LAST CHECKED'}</Text>
            <Text style={s.body}>{trust?.asOf}</Text>
            <Text style={s.note}>{hi ? 'शिक्षा के लिए, सलाह नहीं। अपने आँकड़ों से कैलकुलेटर में देखें।' : 'For education, not advice. Check your own numbers in the calculator.'}</Text>
          </ScrollView>
          <TouchableOpacity accessibilityRole="button" style={s.close} onPress={onClose}><Text style={s.closeTxt}>{hi ? 'बंद करें' : 'Close'}</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  card: { maxHeight: '75%', backgroundColor: '#0F1530', borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl, padding: Spacing.lg, paddingBottom: Spacing.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  title: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: Spacing.sm },
  label: { color: Colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: Spacing.md },
  body: { color: '#E6EAF5', fontSize: 15, lineHeight: 22, marginTop: Spacing.xs },
  note: { color: Colors.textDim, fontSize: 12, marginTop: Spacing.lg },
  close: { minHeight: 48, borderRadius: Radii.lg, backgroundColor: Colors.cyan, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  closeTxt: { color: '#000', fontSize: 15, fontWeight: '900' },
});
