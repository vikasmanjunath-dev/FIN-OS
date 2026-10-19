import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { loadArFacts } from '@/lib/aryaFactsStorage';
import { loadLifeEvents } from '@/lib/lifeEventsStorage';
import { stamp } from '@/lib/aryaToolbox';
import { askMitra, contextBase, suggestionsFor, type MitraAnswer } from '@/lib/reels/ask';
import { loadMine, type Mine } from '@/lib/reels/mine';
import { recordStat } from '@/lib/reelsStatsStorage';
import type { Reel } from '@/lib/reels/types';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing } from '@/constants/theme';

/** "Ask Mitra": type a what-if about this reel, or tap one. Answered on the phone by Arya's calculators and your own records, never by a guess. */
export function AskSheet({ reel, lang, visible, onClose }: { reel: Reel; lang: Lang; visible: boolean; onClose: () => void }) {
  const hi = lang === 'hi';
  const [q, setQ] = useState('');
  const [mine, setMine] = useState<Mine>({});
  const [answer, setAnswer] = useState<MitraAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setQ(''); setAnswer(null); loadMine().then(setMine).catch(() => {}); } }, [visible]);
  const base = useMemo(() => contextBase(reel, mine), [reel, mine]);
  const chips = useMemo(() => suggestionsFor(base), [base]);

  const ask = useCallback(async (text: string) => {
    setBusy(true);
    recordStat('asks');
    try {
      const now = new Date();
      const [facts, events] = await Promise.all([loadArFacts(now), loadLifeEvents(now.getTime()).catch(() => [])]);
      setAnswer(askMitra(text, { facts, events }, base));
    } catch { setAnswer({ kind: 'none', note: { en: 'Something went wrong on the phone. Nothing was changed.', hi: 'फ़ोन पर कुछ गड़बड़ हुई। कुछ नहीं बदला।' }, text: null, source: null, asOf: null, route: null, routeLabel: null }); }
    setBusy(false);
  }, [base]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.back} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.card} accessibilityViewIsModal>
          <Text style={s.title}>{hi ? '🦉 मित्रा से पूछें' : '🦉 Ask Mitra'}</Text>
          <Text style={s.sub}>{base ? (hi ? 'इस रील के आँकड़ों पर “अगर…?” पूछें। जवाब इसी फ़ोन पर निकलता है।' : 'Ask a “what if…?” on this reel’s numbers. The answer is worked out on this phone.') : (hi ? 'अपने आँकड़ों या किसी कैलकुलेटर के बारे में पूछें। जवाब इसी फ़ोन पर निकलता है।' : 'Ask about your own figures or a calculator. The answer is worked out on this phone.')}</Text>
          <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
            <View style={s.chips}>
              {chips.map((c, i) => (
                <TouchableOpacity key={i} accessibilityRole="button" style={s.chip} onPress={() => { setQ(c.en); ask(c.en); }}><Text style={s.chipTxt}>{c[lang]}</Text></TouchableOpacity>
              ))}
            </View>
            {busy ? <Text style={s.note}>{hi ? 'निकाल रही हूँ…' : 'Working it out…'}</Text> : null}
            {answer ? (
              <View accessibilityLiveRegion="polite" style={s.answer}>
                {answer.note ? <Text style={s.note}>{answer.note[lang]}</Text> : null}
                {answer.text ? <Text style={s.text}>{answer.text}</Text> : null}
                {answer.source ? <Text style={s.src}>{`${hi ? 'स्रोत' : 'From'}: ${answer.source}${answer.asOf ? ` ${stamp(answer.asOf)}` : ''}`}</Text> : null}
                {answer.text && lang === 'hi' ? <Text style={s.src}>जवाब अंग्रेज़ी में है; संख्याएँ वही हैं।</Text> : null}
                {answer.route && answer.routeLabel ? <TouchableOpacity accessibilityRole="button" style={s.open} onPress={() => { onClose(); router.push(answer.route as never); }}><Text style={s.openTxt}>{`${answer.routeLabel} →`}</Text></TouchableOpacity> : null}
              </View>
            ) : null}
          </ScrollView>
          <View style={s.row}>
            <TextInput value={q} onChangeText={setQ} placeholder={hi ? 'जैसे: what if the rate is 10%?' : 'e.g. what if the rate is 10%?'} placeholderTextColor={Colors.textDim} style={s.input} returnKeyType="send" onSubmitEditing={() => ask(q)} accessibilityLabel={hi ? 'अपना सवाल लिखें' : 'Type your question'} maxLength={300} />
            <TouchableOpacity accessibilityRole="button" style={s.send} onPress={() => ask(q)} disabled={busy}><Text style={s.sendTxt}>{hi ? 'पूछें' : 'Ask'}</Text></TouchableOpacity>
          </View>
          <Text style={s.fine}>{hi ? 'शिक्षा के लिए, सलाह नहीं। मैं बताती नहीं कि क्या ख़रीदें।' : 'For education, not advice. I never say what to buy.'}</Text>
          <TouchableOpacity accessibilityRole="button" style={s.close} onPress={onClose}><Text style={s.closeTxt}>{hi ? 'बंद करें' : 'Close'}</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  back: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  card: { backgroundColor: '#0F1530', borderTopLeftRadius: Radii.xl, borderTopRightRadius: Radii.xl, padding: Spacing.lg, paddingBottom: Spacing.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  title: { color: '#fff', fontSize: 20, fontWeight: '900' },
  sub: { color: '#D8DEEC', fontSize: 14, lineHeight: 20, marginTop: Spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.09)' },
  chipTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  answer: { marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radii.lg, backgroundColor: 'rgba(255,255,255,0.06)' },
  note: { color: Colors.cyan, fontSize: 13, fontWeight: '800', marginTop: Spacing.sm },
  text: { color: '#fff', fontSize: 15, lineHeight: 22, marginTop: Spacing.xs },
  src: { color: Colors.textMuted, fontSize: 12, marginTop: Spacing.sm },
  open: { minHeight: 44, borderRadius: Radii.lg, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm, paddingHorizontal: Spacing.md },
  openTxt: { color: '#070A1A', fontSize: 14, fontWeight: '800' },
  row: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  input: { flex: 1, minHeight: 48, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', color: '#fff', paddingHorizontal: Spacing.md, fontSize: 15 },
  send: { minWidth: 64, minHeight: 48, borderRadius: Radii.lg, backgroundColor: Colors.cyan, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
  sendTxt: { color: '#000', fontSize: 15, fontWeight: '900' },
  fine: { color: Colors.textDim, fontSize: 11, textAlign: 'center', marginTop: Spacing.sm },
  close: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: Colors.textMuted, fontSize: 14, fontWeight: '700' },
});
