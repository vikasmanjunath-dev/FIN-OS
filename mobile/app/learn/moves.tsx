import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Card, SectionLabel, TrackerScreen } from '@/components/TrackerUI';
import { ACT_ALL, LIBRARY } from '@/lib/reels/library';
import { METRIC_OF, receiptText } from '@/lib/reels/moves';
import { WhenSheet } from '@/components/reels/ReminderSheets';
import { useMoveReminder } from '@/hooks/useMoveReminder';
import { useReelsJourney } from '@/hooks/useReelsJourney';
import { useLang } from '@/lib/i18n';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

const reelOf = (id: string) => LIBRARY.find(r => r.id === id);

/** My moves: the things the person said "I'll do this" about, where each stands, the receipts for those that really changed a figure, and the
 *  reels kept for later. Everything here is on this phone; removing something only forgets it. */
export default function MyMoves() {
  const lang = useLang(), hi = lang === 'hi';
  const j = useReelsJourney();
  const reminder = useMoveReminder(lang, j.beginMove);
  const pledges = [...(j.profile.pledges ?? [])].reverse().filter(p => reelOf(p.id));
  const saved = [...(j.profile.saved ?? [])].reverse().filter(id => reelOf(id));
  const receipts = [...j.moves.receipts].reverse();

  return (
    <TrackerScreen title={hi ? 'मेरे काम' : 'My moves'} subtitle={hi ? 'जो आपने करने को कहा, और जो बाद के लिए रखा। सब इसी फ़ोन पर।' : 'What you said you would do, and what you kept for later. All on this phone.'}>
      <SectionLabel>{hi ? 'मैं यह करूँगा' : 'I’LL DO THIS'}</SectionLabel>
      {pledges.length === 0 ? (
        <Card><Text style={Typography.body}>{hi ? 'अभी कुछ नहीं। किसी रील पर दो बार टैप करें, या जवाब के बाद “मैं यह करूँगा” दबाएँ।' : 'Nothing yet. Double-tap a reel, or press “I’ll do this” after its question.'}</Text></Card>
      ) : pledges.map(p => {
        const reel = reelOf(p.id)!, act = ACT_ALL[p.id];
        const done = j.moves.receipts.some(r => r.id === p.id), watching = j.moves.open.some(m => m.id === p.id);
        const status = done ? (hi ? '✅ आपका आँकड़ा सुधरा' : '✅ Your figure improved') : watching ? (hi ? '👀 आपका आँकड़ा देखा जा रहा है' : '👀 Watching your figure') : METRIC_OF[p.id] ? (hi ? '⏳ अभी शुरू नहीं हुआ' : '⏳ Not started') : (hi ? '⏳ जब चाहें' : '⏳ Whenever you are ready');
        return (
          <Card key={p.id} accent={done ? Colors.teal : Colors.cyan} style={{ marginBottom: Spacing.sm }}>
            <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{reel.title[lang]}</Text>
            <Text style={s.status} maxFontSizeMultiplier={1.3}>{status}</Text>
            <View style={s.row}>
              {act ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={act.label[lang]} style={s.primary} onPress={() => { j.beginMove(p.id); router.push(act.href as never); }}><Text style={s.primaryTxt}>{`${act.label[lang]} →`}</Text></TouchableOpacity> : null}
              {act && !done ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${hi ? 'याद दिलाएँ' : 'Remind me'}: ${reel.title[lang]}`} style={s.ghost} onPress={() => reminder.open(p.id)}><Text style={s.ghostTxt}>{hi ? '⏰ याद दिलाएँ' : '⏰ Remind me'}</Text></TouchableOpacity> : null}
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${hi ? 'फिर देखें' : 'Watch again'}: ${reel.title[lang]}`} style={s.ghost} onPress={() => router.push({ pathname: '/learn/reels', params: { id: p.id } } as never)}><Text style={s.ghostTxt}>{hi ? '▶ फिर देखें' : '▶ Watch again'}</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${hi ? 'सूची से हटाएँ' : 'Remove from the list'}: ${reel.title[lang]}`} style={s.ghost} onPress={() => j.unpledge(p.id)}><Text style={s.ghostTxt}>{hi ? 'हटाएँ' : 'Remove'}</Text></TouchableOpacity>
            </View>
          </Card>
        );
      })}

      {receipts.length > 0 ? (
        <>
          <SectionLabel>{hi ? 'आपने जो किया' : 'WHAT YOU DID'}</SectionLabel>
          {receipts.map(r => { const t = receiptText(r, j.signals.mine); return (
            <Card key={`${r.id}-${r.at}`} accent={Colors.teal} style={{ marginBottom: Spacing.sm }}>
              <Text style={s.title} accessibilityRole="header">{t.title[lang]}</Text>
              <Text style={Typography.body}>{t.body[lang]}</Text>
            </Card>
          ); })}
        </>
      ) : null}

      <SectionLabel>{hi ? 'बाद के लिए रखी रीलें' : 'SAVED FOR LATER'}</SectionLabel>
      {saved.length === 0 ? (
        <Card><Text style={Typography.body}>{hi ? 'अभी कुछ नहीं। किसी रील को दाएँ स्वाइप करें।' : 'Nothing yet. Swipe a reel to the right.'}</Text></Card>
      ) : saved.map(id => (
        <Card key={id} style={{ marginBottom: Spacing.sm }}>
          <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{reelOf(id)!.title[lang]}</Text>
          <View style={s.row}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${hi ? 'देखें' : 'Watch'}: ${reelOf(id)!.title[lang]}`} style={s.primary} onPress={() => router.push({ pathname: '/learn/reels', params: { id } } as never)}><Text style={s.primaryTxt}>{hi ? '▶ देखें' : '▶ Watch'}</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${hi ? 'सेव से हटाएँ' : 'Remove from saved'}: ${reelOf(id)!.title[lang]}`} style={s.ghost} onPress={() => j.toggleSave(id)}><Text style={s.ghostTxt}>{hi ? 'हटाएँ' : 'Remove'}</Text></TouchableOpacity>
          </View>
        </Card>
      ))}
      <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 17 }]}>{hi ? 'शिक्षा के लिए, सलाह नहीं। यह सूची सिर्फ़ इसी फ़ोन पर है और किसी को भेजी नहीं जाती।' : 'For education, not advice. This list is only on this phone and is never sent anywhere.'}</Text>
      <WhenSheet lang={lang} visible={reminder.visible} options={reminder.options} status={reminder.status} onPick={reminder.pick} onClose={reminder.close} />
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  title: { color: '#fff', fontSize: 16, fontWeight: '800' },
  status: { color: Colors.textMuted, fontSize: 13, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  primary: { minHeight: 44, maxWidth: '100%', borderRadius: Radii.md, backgroundColor: Colors.cyan, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, paddingVertical: 8 },
  primaryTxt: { color: '#000', fontSize: 14, fontWeight: '900', flexShrink: 1, textAlign: 'center' },
  ghost: { minHeight: 44, maxWidth: '100%', borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.borderHi, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, paddingVertical: 8 },
  ghostTxt: { color: '#fff', fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
});
