import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, Share } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { useAuth } from '@/hooks/useAuth';
import { FLOWS, NOT_DOING, PERMISSIONS, DATA_ITEMS, ENTITY, KEPT_ASIDE_NOTE, describeStored } from '@/lib/privacy';
import { exportAllData, deleteCloudData, deleteAccount } from '@/lib/dataControls';
import { eraseThisPhone, detachFromAccount } from '@/lib/eraseDeps';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

/** Yes/no that works on web (window.confirm) and native (Alert). Resolves true only when the destructive button is pressed. */
function confirmAction(title: string, message: string, destructive: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: destructive, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export default function PrivacyScreen() {
  const { session, configured } = useAuth();
  const [counts, setCounts] = useState<{ label: string; value: string }[]>([]);
  const [exportText, setExportText] = useState<string | null>(null);
  const [exportKeys, setExportKeys] = useState(0);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const pairs = await AsyncStorage.multiGet(DATA_ITEMS.map(d => d.key));
    setCounts(DATA_ITEMS.map((d, i) => ({ label: d.label, value: describeStored(pairs[i][1], d.kind) ?? '' })).filter(x => x.value));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doExport = async () => {
    const { json, keys } = await exportAllData();
    setExportText(json); setExportKeys(keys); setStatus(null);
  };
  const shareExport = async () => {
    if (!exportText) return;
    try { await Share.share({ message: exportText }); } catch { /* cancelled */ }
  };

  const wipeLocal = async () => {
    if (!(await confirmAction('Delete everything on this phone?', 'This removes your transactions, goals, holdings, scores and settings from this phone and signs you out. Anything you synced to the cloud stays there. This cannot be undone.', 'Delete'))) return;
    setBusy(true);
    try {
      const r = await eraseThisPhone();
      setExportText(null); setCounts([]);
      setStatus(r.ok
        ? { ok: true, text: 'Everything on this phone was deleted, and you are signed out.' }
        : { ok: false, text: `Most of it was deleted, but ${r.failed.length ? `these steps failed: ${r.failed.join(', ')}` : `${r.leftover.length} items could not be removed`}. Try again, or remove the app's data in your phone's settings.` });
    } finally { setBusy(false); }
  };

  const wipeCloud = async () => {
    if (!(await confirmAction('Delete your cloud copy?', 'This removes the holdings and tracker data this app synced to the server. The copy on this phone and in the website\'s browser is not touched. Anything else the website saved for your account (profile, transactions, goals, alerts) stays: Delete my account removes all of it. Your sign-in stays.', 'Delete cloud copy'))) return;
    setBusy(true);
    try { const r = await deleteCloudData(); setStatus({ ok: r.ok, text: r.ok ? 'Your cloud copy was deleted.' : r.error ?? 'Could not delete.' }); }
    finally { setBusy(false); }
  };

  const removeAccount = async () => {
    if (!(await confirmAction('Delete your account?', 'This permanently deletes your sign-in account and everything stored for it on the server, including what the website saved. Data on this phone is kept unless you also delete it. This cannot be undone.', 'Delete account'))) return;
    setBusy(true);
    try { const r = await deleteAccount(undefined, detachFromAccount); setStatus({ ok: r.ok, text: r.ok ? 'Your account was deleted.' : r.error ?? 'Could not delete the account.' }); }
    finally { setBusy(false); }
  };

  return (
    <TrackerScreen title="Privacy & your data" subtitle="What FIN·OS keeps, what can leave your phone, and your controls — in plain language.">
      <Card accent={session ? Colors.gold : Colors.teal}>
        <Text style={[Typography.body, { fontWeight: '800', color: session ? Colors.gold : Colors.teal }]}>
          {session ? 'You are signed in, so your holdings and trackers sync.' : 'Nothing leaves this phone.'}
        </Text>
        <Text style={[Typography.caption, { marginTop: 6, lineHeight: 17 }]}>
          {session
            ? `Signed in as ${session.user.email ?? 'your account'}. Signing out stops syncing; your data stays on this phone.`
            : configured
              ? 'You are not signed in. Your data stays on this phone unless you sign in, or ask Arya or Markets for something from your own backend.'
              : 'Cloud sync is not set up in this build. Your data stays on this phone.'}
        </Text>
      </Card>

      <SectionLabel>WHAT FIN·OS NEVER DOES</SectionLabel>
      <Card>
        {NOT_DOING.map(t => <Text key={t} style={[Typography.body, { marginBottom: 6 }]}>✓ {t}</Text>)}
        <Text style={[Typography.caption, { marginTop: 4 }]}>Permissions this app asks the phone for: {PERMISSIONS.join(', ')}.</Text>
      </Card>

      <SectionLabel>ON THIS PHONE RIGHT NOW</SectionLabel>
      <Card>
        {counts.length === 0 && <Text style={Typography.caption}>Nothing saved yet.</Text>}
        {counts.map(c => (
          <View key={c.label} style={s.row}>
            <Text style={Typography.body}>{c.label}</Text>
            <Text style={[Typography.body, { fontWeight: '800' }]}>{c.value}</Text>
          </View>
        ))}
        <Text style={[Typography.caption, { marginTop: Spacing.sm, lineHeight: 16 }]}>{KEPT_ASIDE_NOTE}</Text>
      </Card>

      <SectionLabel>WHAT CAN LEAVE YOUR PHONE, AND WHEN</SectionLabel>
      {FLOWS.filter(f => f.kind !== 'device').map(f => (
        <Card key={f.id}>
          <Text style={[Typography.body, { fontWeight: '800' }]}>{f.title}</Text>
          <Text style={s.k}>WHEN</Text><Text style={s.v}>{f.when}</Text>
          <Text style={s.k}>WHAT IS SENT</Text><Text style={s.v}>{f.sent}</Text>
          <Text style={s.k}>YOUR CONTROL</Text><Text style={s.v}>{f.control}</Text>
        </Card>
      ))}

      <SectionLabel>YOUR CONTROLS</SectionLabel>
      <Card>
        <TouchableOpacity style={s.action} onPress={doExport} accessibilityRole="button"><Text style={s.actionTxt}>Export my data</Text></TouchableOpacity>
        <Text style={s.help}>A readable copy of everything stored on this phone. Sign-in tokens are not included.</Text>
        {exportText != null && (
          <View style={{ marginTop: Spacing.sm }}>
            <Text style={[Typography.caption, { marginBottom: 6 }]}>{exportKeys} items. Select and copy, or share it:</Text>
            <TextInput style={s.box} value={exportText} editable={false} multiline selectTextOnFocus accessibilityLabel="Exported data" />
            <TouchableOpacity onPress={shareExport} style={{ marginTop: Spacing.sm }} accessibilityRole="button"><Text style={s.link}>Share this file…</Text></TouchableOpacity>
          </View>
        )}
      </Card>
      <Card>
        <TouchableOpacity style={[s.action, s.danger]} onPress={wipeLocal} disabled={busy} accessibilityRole="button"><Text style={[s.actionTxt, { color: Colors.red }]}>Delete everything on this phone</Text></TouchableOpacity>
        <Text style={s.help}>Removes all FIN·OS data, the app lock, scheduled reminders, backup files in the cache and your sign-in from this phone.</Text>
      </Card>
      {session && (
        <Card>
          <TouchableOpacity style={[s.action, s.danger]} onPress={wipeCloud} disabled={busy} accessibilityRole="button"><Text style={[s.actionTxt, { color: Colors.red }]}>Delete my cloud copy</Text></TouchableOpacity>
          <Text style={s.help}>Removes the holdings and tracker data this app synced. Your account, and anything the website saved, stays.</Text>
          <TouchableOpacity style={[s.action, s.danger, { marginTop: Spacing.md }]} onPress={removeAccount} disabled={busy} accessibilityRole="button"><Text style={[s.actionTxt, { color: Colors.red }]}>Delete my account</Text></TouchableOpacity>
          <Text style={s.help}>Permanently deletes your sign-in and everything stored for it on the server.</Text>
        </Card>
      )}
      {status && (
        <View style={[s.status, { borderColor: (status.ok ? Colors.teal : Colors.red) + '66' }]} accessibilityLiveRegion="polite">
          <Text style={{ color: status.ok ? Colors.teal : Colors.red, fontWeight: '700', fontSize: 13 }}>{status.text}</Text>
        </View>
      )}

      <SectionLabel>WHO IS RESPONSIBLE</SectionLabel>
      <Card>
        <Text style={Typography.body}>
          {ENTITY.name ? ENTITY.name : 'Operator: not set yet — to be added before launch.'}
        </Text>
        <Text style={[Typography.caption, { marginTop: 4, lineHeight: 17 }]}>
          This notice describes what the app does today. It is a draft and has not been reviewed by a lawyer.
        </Text>
        <TouchableOpacity onPress={() => router.push('/terms' as any)} style={{ marginTop: Spacing.md }} accessibilityRole="button"><Text style={s.link}>Read the terms of use →</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/diagnostics' as any)} style={{ marginTop: Spacing.md }} accessibilityRole="button"><Text style={s.link}>Diagnostics and screen counts →</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/feedback' as any)} style={{ marginTop: Spacing.md }} accessibilityRole="button"><Text style={s.link}>Give feedback →</Text></TouchableOpacity>
      </Card>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  k: { ...Typography.label, marginTop: Spacing.sm, marginBottom: 2 },
  v: { ...Typography.caption, lineHeight: 17, color: Colors.textPrimary },
  action: { borderWidth: 1, borderColor: Colors.cyan + '66', borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center' },
  actionTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 14 },
  danger: { borderColor: Colors.red + '66' },
  help: { ...Typography.caption, marginTop: 6, lineHeight: 16 },
  link: { color: Colors.cyan, fontWeight: '800', fontSize: 13 },
  box: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, padding: Spacing.sm, color: Colors.textPrimary, fontSize: 11, minHeight: 120, maxHeight: 240, textAlignVertical: 'top' },
  status: { borderWidth: 1, borderRadius: Radii.md, padding: Spacing.md, marginBottom: Spacing.md },
});
