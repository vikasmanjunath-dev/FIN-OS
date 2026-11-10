import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { TouchableOpacity } from '@/components/ui/Tap';
import { useFocusEffect } from 'expo-router';
import { Card, SectionLabel, TrackerScreen } from '@/components/TrackerUI';
import { loadWeekly, saveWeekly } from '@/lib/reelsWeeklyStorage';
import { loadStats } from '@/lib/reelsStatsStorage';
import { weekLine, weekOf } from '@/lib/reels/weekly';
import { lastWeeksNext, saveWeek, type WeeklyNotes } from '@/lib/reels/weeklyReview';
import { weekKey } from '@/lib/reels/reelsProfile';
import { useLang } from '@/lib/i18n';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

/** The weekly money review: three lines you write for yourself (a win, a gap, one move for next week), kept on this phone, with last week's move on top. */
export default function WeeklyReview() {
  const lang = useLang(), hi = lang === 'hi';
  const [all, setAll] = useState<WeeklyNotes>({});
  const [win, setWin] = useState(''), [gap, setGap] = useState(''), [next, setNext] = useState('');
  const [line, setLine] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const now = new Date();
  useFocusEffect(useCallback(() => {
    let live = true;
    Promise.all([loadWeekly(), loadStats()]).then(([w, st]) => {
      if (!live) return;
      setAll(w); const cur = w[weekKey(new Date())]; setWin(cur?.win ?? ''); setGap(cur?.gap ?? ''); setNext(cur?.next ?? '');
      setLine(weekLine(weekOf(st, new Date()))?.[lang] ?? null);
    });
    return () => { live = false; };
  }, [lang]));

  const save = async () => { const n = saveWeek(all, new Date(), { win, gap, next }); setAll(n); await saveWeekly(n); setSaved(true); };
  const prior = lastWeeksNext(all, now);
  const past = Object.keys(all).filter(k => k !== weekKey(now)).sort().reverse().slice(0, 4);
  const field = (label: string, v: string, set: (t: string) => void, ph: string) => (
    <View style={{ marginTop: Spacing.sm }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} value={v} onChangeText={t => { set(t); setSaved(false); }} placeholder={ph} placeholderTextColor={Colors.textDim} accessibilityLabel={label} multiline maxLength={280} />
    </View>
  );
  return (
    <TrackerScreen title={hi ? 'हफ़्ते की पैसों की समीक्षा' : 'Weekly money review'} subtitle={hi ? 'तीन छोटी पंक्तियाँ, सिर्फ़ अपने लिए। यह इसी फ़ोन पर रहती हैं।' : 'Three short lines, only for you. They stay on this phone.'}>
      {line ? <Card><Text style={Typography.body}>{line}</Text></Card> : null}
      {prior ? <Card accent={Colors.cyan} style={{ marginTop: Spacing.sm }}><Text style={s.label}>{hi ? 'पिछले हफ़्ते आपने लिखा था' : 'LAST WEEK YOU WROTE'}</Text><Text style={Typography.body}>{prior}</Text></Card> : null}
      <SectionLabel>{hi ? 'इस हफ़्ते' : 'THIS WEEK'}</SectionLabel>
      <Card>
        {field(hi ? 'एक जीत' : 'One win', win, setWin, hi ? 'जैसे: इस महीने की SIP पहली तारीख़ को हो गई' : 'For example: the SIP went out on the 1st')}
        {field(hi ? 'एक कमी' : 'One gap', gap, setGap, hi ? 'जैसे: ख़र्च लिखना भूल गया' : 'For example: I forgot to log spending')}
        {field(hi ? 'अगले हफ़्ते का एक काम' : 'One move for next week', next, setNext, hi ? 'जैसे: इमरजेंसी फ़ंड में ₹2,000 डालना' : 'For example: put ₹2,000 in the emergency fund')}
        <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={save}><Text style={s.primaryTxt}>{saved ? (hi ? 'सेव हो गया ✓' : 'Saved ✓') : (hi ? 'सेव करें' : 'Save')}</Text></TouchableOpacity>
      </Card>
      {past.length ? <SectionLabel>{hi ? 'पिछले हफ़्ते' : 'EARLIER WEEKS'}</SectionLabel> : null}
      {past.map(k => (
        <Card key={k} style={{ marginBottom: Spacing.sm }}>
          <Text style={s.label}>{k}</Text>
          {all[k].win ? <Text style={Typography.body}>{`${hi ? 'जीत' : 'Win'}: ${all[k].win}`}</Text> : null}
          {all[k].gap ? <Text style={Typography.body}>{`${hi ? 'कमी' : 'Gap'}: ${all[k].gap}`}</Text> : null}
          {all[k].next ? <Text style={Typography.body}>{`${hi ? 'अगला काम' : 'Next'}: ${all[k].next}`}</Text> : null}
        </Card>
      ))}
      <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>{hi ? 'शिक्षा के लिए, सलाह नहीं। इसे कोई नहीं देखता और कहीं भेजा नहीं जाता।' : 'For education, not advice. Nobody sees this and it is never sent anywhere.'}</Text>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  label: { color: Colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  input: { minHeight: 48, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, paddingHorizontal: Spacing.md, paddingVertical: 10, marginTop: 6, fontSize: 15 },
  primary: { minHeight: 48, borderRadius: Radii.md, backgroundColor: Colors.cyan, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  primaryTxt: { color: '#000', fontSize: 15, fontWeight: '900' },
});
