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
import { eraseThisPhone } from '@/lib/eraseDeps';
import { reopenOnboarding } from '@/lib/onboardingStorage';
import { appInfo } from '@/lib/appInfo';
import { loadPersonaPrefs, savePersonaPrefs } from '@/lib/personaStorage';
import { getThemeChoice, setThemeChoice, useMode, type ThemeChoice } from '@/lib/theme';
import { DEFAULT_PREFS, HOURS, type ReminderPrefs } from '@/lib/reminders';
import { loadPrefs, savePrefs, syncReminders } from '@/lib/remindersStorage';
import { getPermission, requestPermission, cancelAll } from '@/lib/remindersNative';
import { NOTIFICATIONS_COPY, enableRemindersFlow } from '@/lib/permissions';
import { confirmPermission } from '@/lib/permissionPrompt';

function SettingRow({ label, sub, right }: { label: string; sub?: string; right: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 180 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <View style={{ flexShrink: 0, marginLeft: 'auto' }}>{right}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const { configured, session, signOut } = useAuth();
  const { syncing, syncError, lastSyncedAt, syncNow } = useHoldings();
  const trk = useTrackerSync();
  const lang = useLang();
  useMode();                                          // redraws the selected button when the appearance changes
  const themeChoice = getThemeChoice();
  const [hostIP, setHostIP]       = useState('');
  const [saving, setSaving]       = useState(false);
  const [rem, setRem]             = useState<ReminderPrefs>({ ...DEFAULT_PREFS });
  const [remMsg, setRemMsg]       = useState('');

  const [stripHidden, setStripHidden] = useState(true);
  React.useEffect(() => { loadPrefs().then(setRem); loadPersonaPrefs().then(p => setStripHidden(p.stripHidden)).catch(() => {}); }, []);
  const toggleStrip = () => { const next = !stripHidden; setStripHidden(next); savePersonaPrefs({ stripHidden: next }); };

  const changeRem = async (next: ReminderPrefs) => {
    setRem(next);
    await savePrefs(next);
    const r = await syncReminders();
    setRemMsg(!next.enabled ? '' : r.scheduled > 0 ? `${r.scheduled} reminder${r.scheduled === 1 ? '' : 's'} scheduled on this device.` : 'Nothing is due in the next few weeks, so nothing is scheduled yet.');
  };
  const toggleReminders = async () => {
    Haptics.selectionAsync();
    if (rem.enabled) { await changeRem({ ...rem, enabled: false }); await cancelAll(); setRemMsg(''); return; }
    // Explain first; the phone's own prompt appears only after the person agrees here.
    const r = await enableRemindersFlow({
      confirmed: await confirmPermission(NOTIFICATIONS_COPY),
      current: getPermission, request: requestPermission,
      enable: async () => { await changeRem({ ...rem, enabled: true }); },
    });
    if (r === 'unsupported') setRemMsg('Reminders are only available in the phone app.');
    else if (r === 'denied') setRemMsg('Notifications are turned off for FIN·OS. Turn them on in your phone\'s settings, then try again.');
  };

  const loadValues = useCallback(async () => {
    const pairs = await AsyncStorage.multiGet([
      'finos_host_ip',
    ]);
    const m = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? '']));
    setHostIP(m['finos_host_ip']);
  }, []);

  React.useEffect(() => { loadValues(); }, [loadValues]);

  const save = async () => {
    setSaving(true);
    Haptics.selectionAsync();
    await AsyncStorage.multiSet([
      ['finos_host_ip',        hostIP.trim()],
    ]);
    applyHost(hostIP);
    setSaving(false);
    Alert.alert('Saved', 'Your settings have been saved.');
  };

  const clearAll = () => {
    Alert.alert('Clear All Data', 'This removes everything FIN·OS keeps on this phone: your data, the app lock, reminders and your sign-in. Your cloud copy and any backup file you made are not touched. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          const r = await eraseThisPhone();
          setRem({ ...DEFAULT_PREFS });
          Alert.alert(r.ok ? 'Done' : 'Not everything was removed', r.ok ? 'All data cleared.' : `These steps failed: ${[...r.failed, ...(r.leftover.length ? [`${r.leftover.length} stored items`] : [])].join(', ')}. Try again.`);
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} hitSlop={12} style={styles.backSlot}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.headerTitle}>Settings</Text>
        <View style={styles.backSlot} />
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

      {/* ── Security ── */}
      <Text style={styles.sectionLabel}>SECURITY</Text>
      <View style={styles.card}>
        <SettingRow
          label="App lock and backup"
          sub="Lock the app with a PIN, and keep an encrypted backup you can restore here or on the website."
          right={<TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => router.push('/security' as any)}><Text style={styles.syncBtnTxt}>Open</Text></TouchableOpacity>}
        />
      </View>

      {/* ── Appearance ── */}
      <Text style={styles.sectionLabel}>APPEARANCE</Text>
      <View style={styles.card}>
        <SettingRow
          label="Theme"
          sub="Follow the phone, or choose dark or light."
          right={
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([['system', 'Auto'], ['dark', 'Dark'], ['light', 'Light']] as [ThemeChoice, string][]).map(([id, label]) => (
                <TouchableOpacity key={id} accessibilityRole="button" accessibilityState={{ selected: themeChoice === id }} accessibilityLabel={`Theme: ${label}`}
                  style={[styles.syncBtn, themeChoice === id && { backgroundColor: 'rgba(0,212,255,0.18)', borderColor: Colors.cyan }]} onPress={() => setThemeChoice(id)}>
                  <Text style={styles.syncBtnTxt}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          }
        />
      </View>

      <View style={[styles.card, { marginTop: Spacing.md }]}>
        <SettingRow
          label="Facts strip on Home"
          sub="Savings rate, net worth and Money Score, shown only when you have recorded them. Off by default, because the Home card already shows them. Turn it on here, and hide it again with the cross on Home."
          right={
            <TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: !stripHidden }} accessibilityLabel="Show the facts strip on Home"
              style={[styles.syncBtn, !stripHidden && { backgroundColor: 'rgba(0,212,255,0.18)', borderColor: Colors.cyan }]} onPress={toggleStrip}>
              <Text style={styles.syncBtnTxt}>{stripHidden ? 'Off' : 'On'}</Text>
            </TouchableOpacity>
          }
        />
      </View>

      {/* ── Reminders ── */}
      <Text style={styles.sectionLabel}>REMINDERS</Text>
      <View style={styles.card}>
        <SettingRow
          label="Remind me before things are due"
          sub="SIP debits, deposit maturities, insurance renewals, subscriptions, goal dates and tax deadlines from your Calendar. Scheduled on this device only: nothing is sent to a server."
          right={
            <TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: rem.enabled }} accessibilityLabel="Reminders"
              style={[styles.syncBtn, rem.enabled && { backgroundColor: 'rgba(0,212,255,0.18)', borderColor: Colors.cyan }]} onPress={toggleReminders}>
              <Text style={styles.syncBtnTxt}>{rem.enabled ? 'On' : 'Off'}</Text>
            </TouchableOpacity>
          }
        />
        {rem.enabled && (
          <>
            <SettingRow
              label="Time of day"
              sub="When the notice arrives."
              right={
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', maxWidth: 190, justifyContent: 'flex-end' }}>
                  {HOURS.map(h => (
                    <TouchableOpacity key={h} accessibilityRole="button" accessibilityState={{ selected: rem.hour === h }} accessibilityLabel={`${h}:00`}
                      style={[styles.syncBtn, rem.hour === h && { backgroundColor: 'rgba(0,212,255,0.18)', borderColor: Colors.cyan }]} onPress={() => changeRem({ ...rem, hour: h })}>
                      <Text style={styles.syncBtnTxt}>{`${h}:00`}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              }
            />
            <SettingRow
              label="Show details on the lock screen"
              sub="Off: the notice says only what kind of thing is due and when. On: it names it and shows the amount."
              right={
                <TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: rem.details }} accessibilityLabel="Show details on the lock screen"
                  style={[styles.syncBtn, rem.details && { backgroundColor: 'rgba(0,212,255,0.18)', borderColor: Colors.cyan }]} onPress={() => changeRem({ ...rem, details: !rem.details })}>
                  <Text style={styles.syncBtnTxt}>{rem.details ? 'On' : 'Off'}</Text>
                </TouchableOpacity>
              }
            />
          </>
        )}
        {remMsg ? <Text style={[styles.rowSub, { padding: Spacing.md }]}>{remMsg}</Text> : null}
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
          label="Your profile"
          sub="Name, age, income and dependents. They make the Money Score, retirement and insurance numbers fit you."
          right={<TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => router.push('/profile' as any)}><Text style={styles.syncBtnTxt}>Edit</Text></TouchableOpacity>}
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

      {/* ── Arya, PULSE and your own dates ── */}
      <Text style={styles.sectionLabel}>ARYA, PULSE AND YOUR DATES</Text>
      <View style={styles.card}>
        <SettingRow label="What Arya remembers" sub="See, edit or delete what Arya keeps, and exactly what is sent with a question. Memory and life events are off until you turn them on."
          right={<TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => router.push('/pulse/memory' as any)}><Text style={styles.syncBtnTxt}>Open</Text></TouchableOpacity>} />
        <SettingRow label="PULSE" sub="What matters for you today, ranked from what you have recorded."
          right={<TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => router.push('/pulse' as any)}><Text style={styles.syncBtnTxt}>Open</Text></TouchableOpacity>} />
        <SettingRow label="Your dates and calendar export" sub="Add your own dates (they join the calendar and reminders) and export the calendar to your phone's calendar app."
          right={<TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => router.push('/plan/mydates' as any)}><Text style={styles.syncBtnTxt}>Open</Text></TouchableOpacity>} />
      </View>

      {/* ── Help us improve ── */}
      <Text style={styles.sectionLabel}>FEEDBACK AND DIAGNOSTICS</Text>
      <View style={styles.card}>
        <SettingRow label="Feedback" sub="Tell us what to fix. Saved on this phone first; nothing is sent for you."
          right={<TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => router.push('/feedback' as any)}><Text style={styles.syncBtnTxt}>Open</Text></TouchableOpacity>} />
        <SettingRow label="Diagnostics and screen counts" sub="Crash notes and optional screen counts, kept on this phone. Read, delete or share them."
          right={<TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={() => router.push('/diagnostics' as any)}><Text style={styles.syncBtnTxt}>Open</Text></TouchableOpacity>} />
        <SettingRow label="Welcome tour" sub="What FIN·OS is and is not, and the optional first steps. Nothing is changed unless you answer."
          right={<TouchableOpacity accessibilityRole="button" style={styles.syncBtn} onPress={async () => { await reopenOnboarding(); router.push('/onboarding/welcome' as any); }}><Text style={styles.syncBtnTxt}>Open</Text></TouchableOpacity>} />
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
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.aboutName}>FIN·OS</Text>
            <Text style={styles.aboutSub}>Financial Operating System for India</Text>
            <Text style={styles.aboutVersion}>{`Mobile ${appInfo().appVersion === 'unknown' ? '(version not available)' : 'v' + appInfo().appVersion} · Web finos1.vercel.app`}</Text>
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

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  backSlot: { width: 80, minHeight: 44, justifyContent: 'center' },   // equal slots either side keep the title truly centred
  backBtn: { color: Colors.cyan, fontSize: 14, fontWeight: '600' },
  headerTitle: { ...Typography.h3 },

  sectionLabel: { ...Typography.label, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, marginTop: Spacing.md },
  card: { marginHorizontal: Spacing.lg, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.sm },

  // The text takes the width it needs and the control(s) move under it instead of squeezing it to a sliver (three theme pills used to leave ~120 px for the words)
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Spacing.md, rowGap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
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
