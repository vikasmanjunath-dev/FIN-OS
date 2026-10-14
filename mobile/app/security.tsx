import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Share, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackerScreen, Card, SectionLabel } from '@/components/TrackerUI';
import { CheckRow, Collapsible, Bullet } from '@/components/CalcUI';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { DEFAULT_META, PIN_LENGTH, TIMEOUTS, pinProblem, passphraseProblem, type LockMeta } from '@/lib/appLock';
import { BIOMETRIC_COPY } from '@/lib/permissions';
import { confirmPermission } from '@/lib/permissionPrompt';
import { deleteTempFile, sweepTempFiles } from '@/lib/tempFiles';
import { biometricPrompt, biometricsAvailable, clearLock, loadMeta, requestLock, saveMeta, setPin as storePin, verifyPin } from '@/lib/appLockStorage';
import { buildBackup, restoreBackup, summarise } from '@/lib/backup';
import { decryptBackup, encryptBackup, isEncryptedBackup, PHONE_ITER } from '@/lib/vaultCrypto';

const MIN_BACKUP_PASS = 8;
const day = () => new Date().toISOString().slice(0, 10);

function Field({ label, value, onChange, secure = true, numeric = false }: { label: string; value: string; onChange: (v: string) => void; secure?: boolean; numeric?: boolean }) {
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={Typography.label}>{label}</Text>
      <TextInput accessibilityLabel={label} style={s.input} value={value} onChangeText={t => onChange(numeric ? t.replace(/\D/g, '').slice(0, PIN_LENGTH) : t)}
        secureTextEntry={secure} keyboardType={numeric ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" importantForAutofill="no" spellCheck={false} placeholderTextColor={Colors.textDim} maxLength={numeric ? PIN_LENGTH : 128} />
    </View>
  );
}
const Btn = ({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) => (
  <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={[s.btn, danger && { borderColor: Colors.red }, disabled && { opacity: 0.5 }]}><Text style={[s.btnTxt, danger && { color: Colors.red }]}>{label}</Text></TouchableOpacity>
);

export default function SecurityScreen() {
  const [meta, setMeta] = useState<LockMeta>(DEFAULT_META);
  const [bioOk, setBioOk] = useState(false);
  const [mode, setMode] = useState<'none' | 'set' | 'change' | 'off'>('none');
  const [cur, setCur] = useState(''); const [p1, setP1] = useState(''); const [p2, setP2] = useState('');
  const [msg, setMsg] = useState('');

  const [pass, setPass] = useState(''); const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(''); const [bmsg, setBmsg] = useState('');
  const [file, setFile] = useState<any>(null); const [rpass, setRpass] = useState('');
  const [found, setFound] = useState<{ keys: number; exportedAt: string; source: string; offlineRecords: number } | null>(null);
  const [plain, setPlain] = useState<any>(null);

  useFocusEffect(useCallback(() => { loadMeta().then(setMeta); biometricsAvailable().then(setBioOk); }, []));
  useEffect(() => { setMsg(''); setCur(''); setP1(''); setP2(''); }, [mode]);

  // ── app lock ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const saveLock = async () => {
    if (mode === 'change' || mode === 'off') { if (!(await verifyPin(cur))) { setMsg('That is not your current PIN.'); return; } }
    if (mode === 'off') { await clearLock(); setMeta(DEFAULT_META); setMode('none'); return; }
    const prob = pinProblem(p1);
    if (prob) { setMsg(prob); return; }
    if (p1 !== p2) { setMsg('The two PINs are different.'); return; }
    await storePin(p1);
    setMeta(await loadMeta()); setMode('none'); setMsg('');
  };
  const update = async (patch: Partial<LockMeta>) => { const n = { ...meta, ...patch }; setMeta(n); await saveMeta(n); };
  // Fingerprint or face: explain first, then let the phone ask once, here, so a refusal or a failure shows now and not at the next lock.
  const setBiometrics = async (on: boolean) => {
    if (!on) { await update({ biometrics: false }); setMsg(''); return; }
    if (!(await confirmPermission(BIOMETRIC_COPY))) return;
    if (await biometricPrompt('Confirm to unlock FIN·OS with fingerprint or face')) { await update({ biometrics: true }); setBmsg('Fingerprint or face is on. The PIN always works too.'); }
    else setBmsg('That did not work, so it stays off. The PIN still locks the app.');
  };

  // ── backup ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const exportBackup = async () => {
    setBmsg('');
    const weak = passphraseProblem(pass, MIN_BACKUP_PASS);
    if (weak) { setBmsg(weak); return; }
    if (pass !== pass2) { setBmsg('The two passphrases are different.'); return; }
    setBusy('Encrypting… this can take up to a minute on an older phone.');
    try {
      const plainBackup = await buildBackup(AsyncStorage as any);
      const enc = await encryptBackup(plainBackup, pass, PHONE_ITER);
      const text = JSON.stringify(enc);
      const name = `finos-backup-${day()}.finos-backup.json`;
      if (Platform.OS === 'web') {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click();
      } else {
        const FS = require('expo-file-system'); const Sharing = require('expo-sharing');
        await sweepTempFiles();                         // older leftovers first
        const uri = `${FS.cacheDirectory}${name}`;
        await FS.writeAsStringAsync(uri, text);
        try {
          if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save your FIN·OS backup' });
          else await Share.share({ message: text, title: name });
        } finally {
          // iOS resolves when the sheet closes, so the copy can go now. Android may still be handing the file to the app you chose, so
          // it is removed at the next launch (and by "Delete everything on this phone") instead of risking a half-sent file.
          if (Platform.OS === 'ios') await deleteTempFile(uri);
        }
      }
      setBmsg(`Backup made: ${Object.keys(plainBackup.data).length} items. Keep the file and the passphrase safe: without the passphrase it cannot be opened.`);
      setPass(''); setPass2('');
    } catch (e: any) { setBmsg(e?.message ?? 'Could not make the backup.'); }
    setBusy('');
  };

  const pickFile = async () => {
    setBmsg(''); setFound(null); setPlain(null); setFile(null);
    try {
      const DP = require('expo-document-picker');
      const r = await DP.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      let text: string;
      try { text = Platform.OS === 'web' ? await (a.file as File).text() : await require('expo-file-system').readAsStringAsync(a.uri); }
      finally { if (Platform.OS !== 'web') await deleteTempFile(a.uri); }       // the picker's cache copy holds the whole backup: remove it now
      const obj = JSON.parse(text);
      if (isEncryptedBackup(obj)) { setFile(obj); setBmsg('Enter the passphrase this backup was made with.'); }
      else { const sm = summarise(obj); if (!sm) throw new Error('not a backup'); setPlain(obj); setFound(sm); }
    } catch { setBmsg('That file is not a FIN·OS backup.'); }
  };
  const openEncrypted = async () => {
    setBusy('Opening… this can take up to a minute on an older phone.'); setBmsg('');
    try { const p = await decryptBackup(file, rpass); const sm = summarise(p); if (!sm) throw new Error('This is not a FIN·OS backup.'); setPlain(p); setFound(sm); setFile(null); setRpass(''); }
    catch (e: any) { setBmsg(e?.message ?? 'Could not open the backup.'); }
    setBusy('');
  };
  const restore = async (replace: boolean) => {
    const go = async () => {
      try { const r = await restoreBackup(plain, AsyncStorage as any, { replace }); setBmsg(`Restored ${r.imported} items${r.skipped ? `, left ${r.skipped} as they were` : ''}. Reopen a screen to see them.`); setFound(null); setPlain(null); }
      catch (e: any) { setBmsg(e?.message ?? 'Could not restore.'); }
    };
    if (!replace) { go(); return; }
    if (Platform.OS === 'web') { if (window.confirm('Replace the values on this phone with the ones in the backup?')) go(); return; }
    Alert.alert('Replace what is on this phone?', 'Values in the backup overwrite the ones here.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace', style: 'destructive', onPress: go }]);
  };

  return (
    <TrackerScreen title="Security and backup" subtitle="Lock the app with a PIN, and keep an encrypted copy of your data.">
      <SectionLabel>APP LOCK</SectionLabel>
      <Card accent={meta.enabled ? Colors.teal : undefined}>
        <Text style={Typography.body}>{meta.enabled ? 'The app asks for your PIN when you open it and after it has been away.' : 'Off. Anyone who opens this app can see your numbers.'}</Text>
        {mode === 'none' && (
          <View style={{ marginTop: Spacing.md, gap: 10 }}>
            {!meta.enabled && <Btn label="Turn on app lock" onPress={() => setMode('set')} />}
            {meta.enabled && (
              <>
                <Text style={Typography.label}>LOCK AFTER</Text>
                <View style={s.chips}>
                  {TIMEOUTS.map(t => (
                    <TouchableOpacity key={t.sec} accessibilityRole="button" accessibilityState={{ selected: meta.timeoutSec === t.sec }} accessibilityLabel={`Lock after ${t.label}`}
                      style={[s.chip, meta.timeoutSec === t.sec && s.chipOn]} onPress={() => update({ timeoutSec: t.sec })}><Text style={[s.chipTxt, meta.timeoutSec === t.sec && { color: Colors.cyan }]}>{t.label}</Text></TouchableOpacity>
                  ))}
                </View>
                {bioOk && <CheckRow label="Unlock with fingerprint or face (the PIN always works too)" value={meta.biometrics} onChange={setBiometrics} />}
                <Btn label="Lock now" onPress={requestLock} />
                <Btn label="Change PIN" onPress={() => setMode('change')} />
                <Btn label="Turn off app lock" danger onPress={() => setMode('off')} />
              </>
            )}
          </View>
        )}
        {mode !== 'none' && (
          <View style={{ marginTop: Spacing.md }}>
            {(mode === 'change' || mode === 'off') && <Field label="CURRENT PIN" value={cur} onChange={setCur} numeric />}
            {mode !== 'off' && <><Field label={`NEW PIN (${PIN_LENGTH} DIGITS)`} value={p1} onChange={setP1} numeric /><Field label="REPEAT THE PIN" value={p2} onChange={setP2} numeric /></>}
            {msg ? <Text style={[Typography.caption, { color: Colors.red, marginBottom: Spacing.sm }]} accessibilityRole="alert">{msg}</Text> : null}
            <Btn label={mode === 'off' ? 'Turn off' : 'Save PIN'} onPress={saveLock} />
            <Btn label="Cancel" onPress={() => setMode('none')} />
          </View>
        )}
      </Card>
      <Collapsible title="What the lock is, and what it is not">
        <Bullet>It stops someone who picks up your phone from opening the app. Your data is protected at rest by your phone's own storage encryption and passcode: set one.</Bullet>
        <Bullet>A forgotten PIN cannot be recovered. "Forgot PIN" on the lock screen erases what this app keeps on the phone and removes the lock; restore from your cloud copy or a backup.</Bullet>
        <Bullet>After five wrong tries the app makes you wait, longer each time.</Bullet>
      </Collapsible>

      <SectionLabel>ENCRYPTED BACKUP</SectionLabel>
      <Card>
        <Text style={Typography.body}>Make a file with everything the app keeps on this phone, locked with a passphrase you choose. The same file opens in the FIN·OS website.</Text>
        <View style={{ marginTop: Spacing.md }}>
          <Field label={`PASSPHRASE (AT LEAST ${MIN_BACKUP_PASS} CHARACTERS)`} value={pass} onChange={setPass} />
          <Field label="REPEAT THE PASSPHRASE" value={pass2} onChange={setPass2} />
          <Btn label={busy && !file ? 'Working…' : 'Make encrypted backup'} onPress={exportBackup} disabled={!!busy} />
        </View>
      </Card>
      <Card>
        <Text style={Typography.body}>Restore from a backup made here or on the website.</Text>
        <View style={{ marginTop: Spacing.md, gap: 10 }}>
          <Btn label="Choose a backup file" onPress={pickFile} disabled={!!busy} />
          {file && (<><Field label="BACKUP PASSPHRASE" value={rpass} onChange={setRpass} /><Btn label="Open backup" onPress={openEncrypted} disabled={!!busy || !rpass} /></>)}
          {found && (
            <View>
              <Text style={Typography.body}>{`${found.keys} items from ${found.source}${found.exportedAt ? `, saved ${found.exportedAt.slice(0, 10)}` : ''}.`}</Text>
              {found.offlineRecords > 0 && <Text style={[Typography.caption, { marginTop: 4 }]}>{`${found.offlineRecords} offline records from the website's journal and documents are not restored on the phone.`}</Text>}
              <View style={{ marginTop: Spacing.sm, gap: 10 }}>
                <Btn label="Add what is missing (keeps what you have)" onPress={() => restore(false)} />
                <Btn label="Replace values on this phone" danger onPress={() => restore(true)} />
              </View>
            </View>
          )}
        </View>
      </Card>
      {busy ? <Text style={[Typography.caption, { textAlign: 'center' }]} accessibilityRole="alert">{busy}</Text> : null}
      {bmsg ? <Text style={[Typography.body, { textAlign: 'center', marginTop: Spacing.sm }]} accessibilityRole="alert">{bmsg}</Text> : null}
      <Collapsible title="About backups">
        <Bullet>The file is encrypted on this phone with AES-256 using a key made from your passphrase. We cannot open it and cannot recover a lost passphrase.</Bullet>
        <Bullet>Sign-in tokens, the app lock and this phone's own settings are never in it.</Bullet>
      </Collapsible>
    </TrackerScreen>
  );
}

const s = StyleSheet.create({
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.md, color: Colors.textPrimary, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, marginTop: 6 },
  btn: { borderWidth: 1, borderColor: 'rgba(0,212,255,0.4)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { borderColor: Colors.cyan, backgroundColor: 'rgba(0,212,255,0.12)' },
  chipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
});
