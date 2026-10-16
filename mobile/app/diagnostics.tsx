import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { CheckRow, Collapsible, Bullet } from '@/components/CalcUI';
import { SharePreview } from '@/components/SharePreview';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { describeCrash, formatReport, type CrashRecord } from '@/lib/diagnostics';
import { clearCrashes, currentDiagnosticReport, loadCrashes } from '@/lib/diagnosticsStorage';
import { PURPOSES } from '@/lib/consents';
import { USAGE_DAYS, usageRows, type UsageData } from '@/lib/usage';
import { clearUsage, consentGranted, loadUsage, setConsentFor } from '@/lib/feedbackStorage';
import { appInfo } from '@/lib/appInfo';

const confirm = (title: string, msg: string, ok: string): Promise<boolean> => {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${msg}`));
  return new Promise(res => Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel', onPress: () => res(false) }, { text: ok, style: 'destructive', onPress: () => res(true) }], { onDismiss: () => res(false) }));
};

export default function DiagnosticsScreen() {
  const [crashes, setCrashes] = useState<CrashRecord[]>([]);
  const [usage, setUsage] = useState<UsageData>({ v: 1, days: {} });
  const [on, setOn] = useState(false);
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);
  const info = appInfo();
  const purpose = PURPOSES.find(p => p.id === 'usage')!;

  const load = useCallback(async () => {
    setCrashes(await loadCrashes());
    setUsage(await loadUsage());
    setOn(await consentGranted('usage'));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rows = usageRows(usage);
  const total = rows.reduce((s, r) => s + r.count, 0);

  const shareCrashes = async () => setPreview({ title: 'Diagnostic report', text: formatReport(await currentDiagnosticReport({ includeUsage: false })) });
  const shareUsage = async () => setPreview({ title: 'Usage counts', text: formatReport(await currentDiagnosticReport({ includeUsage: true })) });
  const delCrashes = async () => { if (await confirm('Delete crash reports?', 'This removes the crash notes kept on this phone.', 'Delete')) { await clearCrashes(); setPreview(null); load(); } };
  const delUsage = async () => { if (await confirm('Delete usage counts?', 'This removes the screen counts kept on this phone.', 'Delete')) { await clearUsage(); setPreview(null); load(); } };

  return (
    <TrackerScreen title="Diagnostics" subtitle="Crash notes and screen counts, kept on this phone. You can read, delete or share them. Nothing is sent automatically.">
      <Card>
        <Text style={[Typography.body, { lineHeight: 20 }]}>FIN·OS has no crash-reporting or analytics service. If the app fails, a short note is written here with numbers, e-mails, links and IDs removed. Sharing is always your choice, through your phone's share sheet.</Text>
        <Text style={[Typography.caption, { marginTop: 6 }]}>{`App ${info.appVersion} · ${info.os} ${info.osVersion}`}</Text>
      </Card>

      <SectionLabel>CRASH NOTES</SectionLabel>
      <Card accent={crashes.length ? Colors.gold : Colors.teal}>
        {crashes.length === 0 && <Text style={Typography.body}>Nothing has gone wrong that was recorded.</Text>}
        {crashes.slice().reverse().map((c, i) => (
          <View key={`${c.day}-${i}`} style={s.item}>
            <Text style={[Typography.body, { fontWeight: '700' }]}>{describeCrash(c)}</Text>
            <Text style={[Typography.caption, { marginTop: 2 }]}>{`${c.day === c.lastDay ? c.day : `${c.day} to ${c.lastDay}`} · ${c.name}${c.fatal ? ' · ended the app' : ''}`}</Text>
            {c.message ? <Text style={[Typography.mono, { marginTop: 4, fontSize: 12 }]}>{c.message}</Text> : null}
            {c.stack.length > 0 && <Collapsible title={`Where (${c.stack.length} steps)`}>{c.stack.map((f, k) => <Bullet key={k}>{f}</Bullet>)}</Collapsible>}
          </View>
        ))}
        {crashes.length > 0 && (
          <View style={{ marginTop: Spacing.md, gap: 10 }}>
            <TouchableOpacity accessibilityRole="button" style={s.action} onPress={shareCrashes}><Text style={s.actionTxt}>Share a report…</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={[s.action, { borderColor: Colors.red + '66' }]} onPress={delCrashes}><Text style={[s.actionTxt, { color: Colors.red }]}>Delete crash notes</Text></TouchableOpacity>
          </View>
        )}
        <Text style={[Typography.caption, { marginTop: Spacing.md, lineHeight: 16 }]}>The newest 20 are kept. A message can still carry a word written in plain prose, so read it before you share it.</Text>
      </Card>

      <SectionLabel>SCREEN COUNTS (OFF BY DEFAULT)</SectionLabel>
      <Card>
        <CheckRow label={purpose.title} value={on} onChange={async v => { await setConsentFor('usage', v); setOn(v); }} />
        <Text style={[Typography.caption, { lineHeight: 17, marginTop: 6 }]}>{purpose.detail}</Text>
        {rows.length === 0 ? (
          <Text style={[Typography.body, { marginTop: Spacing.md }]}>{on ? 'Nothing counted yet. Counts appear as you open screens.' : 'Nothing is being counted.'}</Text>
        ) : (
          <View style={{ marginTop: Spacing.md }}>
            <Text style={Typography.caption}>{`${total} opens across ${rows.length} screens in the last ${USAGE_DAYS} days`}</Text>
            {rows.slice(0, 25).map(r => (
              <View key={r.screen} style={s.row}><Text style={Typography.body}>{r.screen}</Text><Text style={[Typography.body, { fontWeight: '800' }]}>{r.count}</Text></View>
            ))}
            {rows.length > 25 && <Text style={[Typography.caption, { marginTop: 6 }]}>{`and ${rows.length - 25} more`}</Text>}
            <View style={{ marginTop: Spacing.md, gap: 10 }}>
              <TouchableOpacity accessibilityRole="button" style={s.action} onPress={shareUsage}><Text style={s.actionTxt}>Share counts…</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={[s.action, { borderColor: Colors.red + '66' }]} onPress={delUsage}><Text style={[s.actionTxt, { color: Colors.red }]}>Delete counts</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </Card>

      {preview && <SharePreview title={preview.title} text={preview.text} onClose={() => setPreview(null)} />}
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  action: { borderWidth: 1, borderColor: Colors.cyan + '66', borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center' },
  actionTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 14 },
});
