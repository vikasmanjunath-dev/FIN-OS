import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { CheckRow } from '@/components/CalcUI';
import { FeedbackPrompt } from '@/components/FeedbackPrompt';
import { SharePreview } from '@/components/SharePreview';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { TOPIC_LABELS, type FeedbackEvent } from '@/lib/feedback';
import { PURPOSES } from '@/lib/consents';
import { clearFeedback, consentGranted, currentReport, loadFeedback, loadUsage, removeFeedback, setConsentFor } from '@/lib/feedbackStorage';

const confirm = (title: string, msg: string, ok: string): Promise<boolean> => {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${msg}`));
  return new Promise(res => Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel', onPress: () => res(false) }, { text: ok, style: 'destructive', onPress: () => res(true) }], { onDismiss: () => res(false) }));
};

export default function FeedbackScreen() {
  const [log, setLog] = useState<FeedbackEvent[]>([]);
  const [sendOn, setSendOn] = useState(false);
  const [hasUsage, setHasUsage] = useState(false);
  const [withUsage, setWithUsage] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLog(await loadFeedback());
    setSendOn(await consentGranted('feedback'));
    const u = await loadUsage();
    setHasUsage((await consentGranted('usage')) && Object.keys(u.days).length > 0);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openShare = async () => setPreview(JSON.stringify(await currentReport({ includeUsage: withUsage }), null, 2));
  const del = async (i: number) => { await removeFeedback(i); load(); };
  const delAll = async () => { if (await confirm('Delete all your feedback?', 'This removes the feedback saved on this phone. It cannot be undone.', 'Delete')) { await clearFeedback(); setPreview(null); load(); } };
  const purpose = PURPOSES.find(p => p.id === 'feedback')!;

  return (
    <TrackerScreen title="Feedback" subtitle="Tell us what to fix. It is saved on this phone first, with amounts, numbers, e-mails and links removed.">
      <FeedbackPrompt question="How is FIN·OS working for you?" onSaved={load} />

      <SectionLabel>YOUR SAVED FEEDBACK</SectionLabel>
      <Card>
        {log.length === 0 && <Text style={Typography.caption}>Nothing saved yet.</Text>}
        {log.slice().reverse().map((e, ri) => {
          const i = log.length - 1 - ri;
          return (
            <View key={`${e.day}-${i}`} style={s.item}>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.caption, { color: Colors.textPrimary }]}>{`${e.day} · ${TOPIC_LABELS[e.topic]}${e.rating ? (e.rating === 'up' ? ' · 👍' : ' · 👎') : ''}`}</Text>
                {e.comment ? <Text style={[Typography.body, { marginTop: 2 }]}>{e.comment}</Text> : null}
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete feedback from ${e.day}`} onPress={() => del(i)} hitSlop={8}><Text style={s.del}>Delete</Text></TouchableOpacity>
            </View>
          );
        })}
      </Card>

      <SectionLabel>SHARE IT YOURSELF</SectionLabel>
      <Card>
        <Text style={[Typography.body, { lineHeight: 20 }]}>There is no team inbox yet, so nothing is sent for you. If you want the team to see your feedback, share the file below and choose where it goes.</Text>
        {hasUsage && <CheckRow label="Include my screen counts (from Diagnostics)" value={withUsage} onChange={setWithUsage} />}
        <TouchableOpacity accessibilityRole="button" style={[s.action, { marginTop: Spacing.md }, log.length === 0 && { opacity: 0.5 }]} disabled={log.length === 0} onPress={openShare}><Text style={s.actionTxt}>Share my feedback…</Text></TouchableOpacity>
        {preview != null && <View style={{ marginTop: Spacing.md }}><SharePreview title="Feedback report" text={preview} onClose={() => setPreview(null)} /></View>}
      </Card>

      <SectionLabel>IF A TEAM INBOX IS ADDED LATER</SectionLabel>
      <Card>
        <CheckRow label={purpose.title} value={sendOn} onChange={async v => { await setConsentFor('feedback', v); setSendOn(v); }} />
        <Text style={[Typography.caption, { lineHeight: 17, marginTop: 6 }]}>{purpose.detail}</Text>
      </Card>

      <Card>
        <TouchableOpacity accessibilityRole="button" style={[s.action, { borderColor: Colors.red + '66' }, log.length === 0 && { opacity: 0.5 }]} disabled={log.length === 0} onPress={delAll}><Text style={[s.actionTxt, { color: Colors.red }]}>Delete all my feedback</Text></TouchableOpacity>
      </Card>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/diagnostics' as any)} style={{ padding: Spacing.md }}><Text style={{ color: Colors.cyan, fontWeight: '800' }}>Diagnostics and usage counts →</Text></TouchableOpacity>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  del: { color: Colors.red, fontWeight: '700', fontSize: 12 },
  action: { borderWidth: 1, borderColor: Colors.cyan + '66', borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center' },
  actionTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 14 },
});
