import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { ENDPOINTS, applyHost } from '@/constants/endpoints';
import { useAuth } from '@/hooks/useAuth';
import { useHoldings } from '@/hooks/useHoldings';
import { useTrackerSync } from '@/hooks/useTrackerSync';
import { LANGUAGES, setLang, useLang } from '@/lib/i18n';

function SettingRow({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

export default function SettingsScreen() {
  const { configured, session, signOut } = useAuth();
  const { syncing, syncError, lastSyncedAt, syncNow } = useHoldings();
  const trk = useTrackerSync();
  const lang = useLang();
  const [name, setName]           = useState('');
  const [income, setIncome]       = useState('');
  const [hostIP, setHostIP]       = useState('');
  const [saving, setSaving]       = useState(false);

  const loadValues = useCallback(async () => {
    const pairs = await AsyncStorage.multiGet([
      'finos_user_name', 'finos_monthly_income', 'finos_host_ip',
    ]);
    const m = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? '']));
    setName(m['finos_user_name']);
    setIncome(m['finos_monthly_income']);
    setHostIP(m['finos_host_ip']);
  }, []);

  React.useEffect(() => { loadValues(); }, [loadValues]);

  const save = async () => {
    setSaving(true);
    Haptics.selectionAsync();
    await AsyncStorage.multiSet([
      ['finos_user_name',      name],
      ['finos_monthly_income', income],
      ['finos_host_ip',        hostIP.trim()],
    ]);
    applyHost(hostIP);
    setSaving(false);
    Alert.alert('Saved', 'Your settings have been saved.');
  };

  const clearAll = () => {
    Alert.alert('Clear All Data', 'This will remove all locally stored FIN·OS data. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          await AsyncStorage.clear();
          Alert.alert('Done', 'All data cleared.');
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* ── Language ── */}
      <Text style={styles.sectionLabel}>LANGUAGE</Text>
      <View style={styles.card}>
        <SettingRow
          label="App language"
          sub="Menus, buttons and labels. Your numbers and notes are never translated. Some screens are still in English."
          right={
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {LANGUAGES.map(l => (
                <TouchableOpacity key={l.id} accessibilityRole="button" accessibilityState={{ selected: lang === l.id }}
                  style={[styles.syncBtn, lang === l.id && { backgroundColor: 'rgba(0,212,255,0.18)', borderColor: Colors.cyan }]} onPress={() => setLang(l.id)}>
                  <Text style={styles.syncBtnTxt}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          }
        />
      </View>

      {/* ── Account ── */}
      <Text style={styles.sectionLabel}>ACCOUNT & SYNC</Text>
      <View style={styles.card}>
        {!configured ? (
          <SettingRow
            label="Cloud sync not set up"
            sub="Add Supabase credentials to mobile/.env to sign in. Your data stays on this device until then."
            right={<Text style={{ color: Colors.textDim, fontSize: 12 }}>Off</Text>}
          />
        ) : !session ? (
          <SettingRow
            label="Sign in to sync"
            sub="Keep your portfolio in sync with the FIN·OS website and your other devices."
            right={
              <TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => router.push('/login')}>
                <Text style={styles.syncBtnTxt}>Sign in</Text>
              </TouchableOpacity>
            }
          />
        ) : (
          <>
            <SettingRow
              label={session.user.email ?? 'Signed in'}
              sub={syncError ? syncError
                : syncing ? 'Syncing…'
                : lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                : 'Not synced yet'}
              right={
                <TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => syncNow()} disabled={syncing}>
                  <Text style={styles.syncBtnTxt}>{syncing ? '…' : 'Sync now'}</Text>
                </TouchableOpacity>
              }
            />
            <SettingRow
              label="Trackers sync with the website"
              sub={trk.error ? trk.error
                : trk.syncing ? 'Syncing…'
                : trk.lastSyncAt ? `Budget, goals, subscriptions and the rest — last synced ${new Date(trk.lastSyncAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                : 'Budget, goals, subscriptions and the rest — not synced yet'}
              right={
                <TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => trk.syncNow()} disabled={trk.syncing}>
                  <Text style={styles.syncBtnTxt}>{trk.syncing ? '…' : 'Sync now'}</Text>
                </TouchableOpacity>
              }
            />
            {trk.conflicts.length > 0 && (
              <SettingRow
                label={`${trk.conflicts.filter(c => c.kind === 'cloud-won').length} value${trk.conflicts.filter(c => c.kind === 'cloud-won').length === 1 ? '' : 's'} changed on another device`}
                sub={`The newer copy from the cloud was kept: ${Array.from(new Set(trk.conflicts.filter(c => c.kind === 'cloud-won').map(c => c.key.replace(/^finos_/, '').replace(/_/g, ' ')))).slice(-4).join(', ') || 'none'}.`}
                right={null}
              />
            )}
            <SettingRow
              label="Sign out"
              sub="Your data stays on this device. It syncs again when you sign in."
              right={
                <TouchableOpacity accessibilityRole="button" style={[styles.syncBtn, { borderColor: 'rgba(255,68,68,0.4)' }]} onPress={() => signOut()}>
                  <Text style={[styles.syncBtnTxt, { color: Colors.red }]}>Sign out</Text>
                </TouchableOpacity>
              }
            />
          </>
        )}
      </View>

      {/* ── Profile ── */}
      <Text style={styles.sectionLabel}>PROFILE</Text>
      <View style={styles.card}>
        <SettingRow
          label="Your Name"
          sub="Used by Arya for personalized greetings"
          right={
            <TextInput accessibilityLabel="Your name"
              style={styles.inputSmall}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Vikas"
              placeholderTextColor={Colors.textDim}
            />
          }
        />
        <SettingRow
          label="Monthly Income"
          sub="Helps calculate savings rate and FIRE"
          right={
            <TextInput accessibilityLabel="Monthly income"
              style={styles.inputSmall}
              value={income}
              onChangeText={setIncome}
              placeholder="₹ amount"
              placeholderTextColor={Colors.textDim}
              keyboardType="numeric"
            />
          }
        />
      </View>

      {/* ── Backend ── */}
      <Text style={styles.sectionLabel}>BACKEND CONNECTION</Text>
      <View style={styles.card}>
        <SettingRow
          label="Host IP / ngrok URL"
          sub="Leave blank to auto-detect (the Mac running Expo). Set your Mac's LAN IP or an ngrok host to override."
          right={
            <TextInput accessibilityLabel="Backend host address"
              style={[styles.inputSmall, { width: 140 }]}
              value={hostIP}
              onChangeText={setHostIP}
              placeholder="auto"
              placeholderTextColor={Colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
            />
          }
        />
        <View style={styles.endpointList}>
          {Object.entries(ENDPOINTS).map(([key, url]) => (
            <View key={key} style={styles.endpointRow}>
              <Text style={styles.endpointKey}>{key}</Text>
              <Text style={styles.endpointUrl} numberOfLines={1}>{url}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Notifications ── */}
      <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
      <View style={styles.card}>
        <SettingRow
          label="Reminders"
          sub="Not available yet. The app asks for no notification permission, so nothing is sent to your phone. Due dates for SIPs, renewals and tax deadlines are in the Financial calendar."
          right={<TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => router.push('/tools/calendar' as any)}><Text style={styles.syncBtnTxt}>Calendar</Text></TouchableOpacity>}
        />
      </View>
      {/* ── Privacy & terms ── */}
      <Text style={styles.sectionLabel}>PRIVACY & TERMS</Text>
      <View style={styles.card}>
        <SettingRow label="Privacy & your data" sub="What is stored, what can leave your phone, export and delete"
          right={<TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => router.push('/privacy' as any)}><Text style={styles.syncBtnTxt}>Open</Text></TouchableOpacity>} />
        <SettingRow label="Terms of use" sub="The ground rules, in plain language"
          right={<TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => router.push('/terms' as any)}><Text style={styles.syncBtnTxt}>Read</Text></TouchableOpacity>} />
      </View>


      {/* ── About ── */}
      <Text style={styles.sectionLabel}>ABOUT</Text>
      <View style={styles.card}>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLogo}>⬡</Text>
          <View>
            <Text style={styles.aboutName}>FIN·OS</Text>
            <Text style={styles.aboutSub}>Financial Operating System for India</Text>
            <Text style={styles.aboutVersion}>Mobile v1.0.0 · Web finos1.vercel.app</Text>
          </View>
        </View>
      </View>

      {/* ── Save + Danger Zone ── */}
      <TouchableOpacity accessibilityRole="button" style={styles.saveBtn} onPress={save} disabled={saving}>
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Settings'}</Text>
      </TouchableOpacity>

      <TouchableOpacity accessibilityRole="button" style={styles.dangerBtn} onPress={clearAll}>
        <Text style={styles.dangerBtnText}>Clear All Local Data</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  syncBtn: { borderWidth: 1, borderColor: 'rgba(0,212,255,0.4)', borderRadius: Radii.full, paddingHorizontal: 14, paddingVertical: 7 },
  syncBtnTxt: { color: Colors.cyan, fontWeight: '700', fontSize: 12 },
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: 60 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, paddingTop: Spacing.xxl },
  backBtn: { color: Colors.cyan, fontSize: 14, fontWeight: '600' },
  headerTitle: { ...Typography.h3 },

  sectionLabel: { ...Typography.label, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, marginTop: Spacing.md },
  card: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.sm },

  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLabel: { ...Typography.body, fontWeight: '600', marginBottom: 2 },
  rowSub: { ...Typography.caption },
  inputSmall: { backgroundColor: Colors.overlay, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6, color: Colors.textPrimary, fontSize: 13, minWidth: 100, textAlign: 'right' },

  endpointList: { padding: Spacing.md, paddingTop: 0, gap: 4 },
  endpointRow: { flexDirection: 'row', gap: Spacing.sm },
  endpointKey: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, width: 70 },
  endpointUrl: { fontSize: 10, color: Colors.textDim, flex: 1 },

  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  aboutLogo: { fontSize: 36, color: Colors.cyan },
  aboutName: { ...Typography.h3 },
  aboutSub: { ...Typography.caption, marginTop: 2 },
  aboutVersion: { ...Typography.caption, color: Colors.textDim, marginTop: 2 },

  saveBtn: { margin: Spacing.lg, backgroundColor: Colors.purple, borderRadius: Radii.lg, padding: Spacing.md + 2, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dangerBtn: { marginHorizontal: Spacing.lg, borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)', borderRadius: Radii.lg, padding: Spacing.md, alignItems: 'center' },
  dangerBtnText: { color: Colors.red, fontSize: 13, fontWeight: '600' },
});
