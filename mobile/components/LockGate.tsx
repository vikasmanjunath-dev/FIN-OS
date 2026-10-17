import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { PIN_LENGTH, tryPin, secondsLeft, shouldRelock, NO_FAILS, type FailState, type LockMeta, DEFAULT_META } from '@/lib/appLock';
import { biometricPrompt, biometricsAvailable, loadFail, loadLockStatus, loadMeta, onLockRequested, saveFail, verifyPin } from '@/lib/appLockStorage';
import { eraseThisPhone } from '@/lib/eraseDeps';

type Phase = 'loading' | 'open' | 'locked';

/**
 * Covers the app with a PIN screen while it is locked. The app underneath stays mounted (so the screen you were on comes back)
 * but is hidden from touch and from screen readers.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [meta, setMeta] = useState<LockMeta>(DEFAULT_META);
  const [pin, setPin] = useState('');
  const [fail, setFail] = useState<FailState>(NO_FAILS);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState('');
  const [bio, setBio] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const [away, setAway] = useState(false);
  const verifying = useRef(false);
  const leftAt = useRef<number | null>(null);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  const lock = useCallback(async () => {
    const st = await loadLockStatus();
    if (st.state === 'unreadable') { setUnreadable(true); setFail(NO_FAILS); setPin(''); setMsg(''); setBio(false); setPhase('locked'); return; }   // fail closed
    setUnreadable(false);
    if (st.state === 'off') { setMeta(DEFAULT_META); setPhase('open'); return; }
    const m = st.meta;
    setMeta(m);
    setFail(await loadFail()); setPin(''); setMsg(''); setPhase('locked');
    if (m.biometrics && await biometricsAvailable()) { setBio(true); if (await biometricPrompt('Unlock FIN·OS')) setPhase('open'); } else setBio(false);
  }, []);

  useEffect(() => { lock(); }, [lock]);
  useEffect(() => onLockRequested(() => { lock(); }), [lock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async st => {
      if (st === 'active') {
        const m = await loadMeta();
        // cover first, decide second: the app is never visible for a moment on the way back in
        if (m.enabled && phase === 'open' && shouldRelock(leftAt.current, Date.now(), m.timeoutSec)) { setPhase('loading'); lock(); }
        leftAt.current = null;
        setAway(false);
      } else {
        setAway(true);                       // while the app is not in front the cover hides it in the phone's app switcher
        if (leftAt.current === null) leftAt.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [phase, lock]);

  useEffect(() => { if (phase !== 'locked' || secondsLeft(fail, now) === 0) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [phase, fail, now]);

  const wait = secondsLeft(fail, now);
  useEffect(() => { if (phase === 'locked' && fail.lockedUntil > 0 && wait === 0) setMsg(''); }, [phase, fail.lockedUntil, wait]);   // a finished wait leaves no stale message

  const submit = async (p: string) => {
    if (verifying.current) return;
    verifying.current = true;
    try {
      // Counted before it is checked, and from what is stored (not what this screen remembers): see lib/appLock.ts tryPin.
      const r = await tryPin(p, { load: loadFail, save: saveFail, verify: verifyPin, now: Date.now });
      setFail(r.fail); setNow(Date.now()); setPin('');
      if (r.ok) { setMsg(''); setPhase('open'); return; }
      if (r.refused) return;
      setMsg(r.waitSec > 0 ? 'Wrong PIN.' : `Wrong PIN. ${Math.max(0, 5 - r.fail.count)} tries before a wait.`);   // the countdown is the line above: one counter, not two that disagree
    } finally { verifying.current = false; }
  };
  const press = (d: string) => {
    if (wait > 0 || unreadable || verifying.current || pin.length >= PIN_LENGTH) return;
    const n = pin + d; setPin(n);
    if (n.length === PIN_LENGTH) submit(n);
  };

  const forgot = () => {
    // eraseThisPhone signs this phone out of the cloud FIRST: otherwise the next sync would pull the person's data straight back in.
    const go = async () => { await eraseThisPhone(); setFail(NO_FAILS); setPin(''); setUnreadable(false); setPhase('open'); };
    const text = 'This erases everything the app keeps on this phone, removes the lock and signs this phone out. Your cloud copy and any backup you made are not touched, and you can restore from them afterwards.';
    if (Platform.OS === 'web') { if (window.confirm(`Erase this phone's FIN·OS data?\n\n${text}`)) go(); return; }
    Alert.alert('Erase this phone\'s FIN·OS data?', text, [{ text: 'Cancel', style: 'cancel' }, { text: 'Erase and unlock', style: 'destructive', onPress: go }]);
  };

  const locked = phase !== 'open';
  const privacyCover = !locked && away && meta.enabled;          // only when a lock is on: nothing is hidden for people who did not ask for it
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} pointerEvents={locked ? 'none' : 'auto'} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={locked}>
        {children}
      </View>
      {privacyCover && (
        <View style={s.cover} pointerEvents="none"><Text style={s.logo}>⬡</Text><Text style={s.title}>FIN·OS</Text></View>
      )}
      {locked && (
        <View style={s.cover} accessibilityViewIsModal>
          {phase === 'locked' && (
            <>
              <Text style={s.logo}>⬡</Text>
              <Text accessibilityRole="header" style={s.title}>FIN·OS is locked</Text>
              <Text style={s.sub}>{unreadable ? 'The lock settings could not be read. Try again.' : wait > 0 ? `Too many wrong tries. Wait ${wait} second${wait === 1 ? '' : 's'}.` : 'Enter your PIN'}</Text>
              {unreadable && <TouchableOpacity accessibilityRole="button" onPress={() => { lock(); }} style={{ marginBottom: Spacing.md }}><Text style={s.forgot}>Try again</Text></TouchableOpacity>}
              <View style={s.dots} accessibilityLabel={`${pin.length} of ${PIN_LENGTH} digits entered`}>
                {Array.from({ length: PIN_LENGTH }).map((_, i) => <View key={i} style={[s.dot, i < pin.length && s.dotOn]} />)}
              </View>
              {msg ? <Text style={s.msg} accessibilityRole="alert">{msg}</Text> : <View style={{ height: 20 }} />}
              <View style={s.pad}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].map(k => (
                  k === 'bio'
                    ? <TouchableOpacity key={k} style={s.key} disabled={!bio} accessibilityRole="button" accessibilityLabel="Use fingerprint or face" onPress={async () => { if (await biometricPrompt('Unlock FIN·OS')) setPhase('open'); }}><Text style={s.keyTxt}>{bio ? '☝︎' : ''}</Text></TouchableOpacity>
                    : k === 'del'
                      ? <TouchableOpacity key={k} style={s.key} accessibilityRole="button" accessibilityLabel="Delete last digit" onPress={() => setPin(p => p.slice(0, -1))}><Text style={s.keyTxt}>⌫</Text></TouchableOpacity>
                      : <TouchableOpacity key={k} style={s.key} accessibilityRole="button" accessibilityLabel={k} onPress={() => press(k)}><Text style={s.keyTxt}>{k}</Text></TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity accessibilityRole="button" onPress={forgot} hitSlop={10}><Text style={s.forgot}>Forgot PIN?</Text></TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill as object, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  logo: { fontSize: 40, color: Colors.cyan },
  title: { ...Typography.h2, marginTop: Spacing.sm },
  sub: { ...Typography.caption, marginTop: 6, marginBottom: Spacing.lg, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.borderHi },
  dotOn: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  msg: { color: Colors.red, fontSize: 13, marginTop: Spacing.md, height: 20, textAlign: 'center' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 252, marginTop: Spacing.lg },
  key: { width: 84, height: 64, alignItems: 'center', justifyContent: 'center' },
  keyTxt: { fontSize: 26, fontWeight: '600', color: Colors.textPrimary },
  forgot: { color: Colors.textMuted, marginTop: Spacing.lg, fontSize: 13, textDecorationLine: 'underline' },
});
