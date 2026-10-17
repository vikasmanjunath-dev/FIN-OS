import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import {
  STEPS, back as stepBack, finish, markDid, next as stepNext, resumeStep, skipAll, stepIndex, summaryLines,
  type OnboardingState, type StepId,
} from '@/lib/onboarding';
import { currentProfileValues, loadOnboarding, saveOnboarding, saveProfileAnswers } from '@/lib/onboardingStorage';
import { turnOnReminders } from '@/lib/onboardingActions';
import { EMPTY_PROFILE, USED_FOR, completeness, type Profile } from '@/lib/profile';
import { NOTIFICATIONS_COPY } from '@/lib/permissions';
import { loadMeta } from '@/lib/appLockStorage';
import { loadPrefs } from '@/lib/remindersStorage';
import { loadDna } from '@/lib/dnaStorage';
import { isComplete } from '@/lib/dna';
import { LANGUAGES, setLang, useLang } from '@/lib/i18n';
import { getThemeChoice, setThemeChoice, useMode, type ThemeChoice } from '@/lib/theme';

const COUNT = STEPS.length - 1;     // the last step is the summary, not a step to "complete"

export default function Onboarding() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [profile, setProfile] = useState<Profile>({ ...EMPTY_PROFILE });
  const [errors, setErrors] = useState<Partial<Record<keyof Profile, string>>>({});
  const [msg, setMsg] = useState('');
  const [facts, setFacts] = useState({ lockOn: false, remindersOn: false, dnaDone: false });
  const lang = useLang();
  useMode();
  const live = useRef<OnboardingState | null>(null);       // the persisted status stays as it was when this is only a visit

  const refreshFacts = useCallback(async () => {
    const [meta, prefs, dna] = await Promise.all([loadMeta().catch(() => null), loadPrefs().catch(() => null), loadDna().catch(() => null)]);
    setFacts({ lockOn: !!meta?.enabled, remindersOn: !!prefs?.enabled, dnaDone: !!dna && isComplete(dna.responses) });
  }, []);

  useEffect(() => {
    (async () => {
      const s = await loadOnboarding();
      const start = s.status === 'in_progress' ? { ...s, step: resumeStep(s) } : { ...s, step: 'welcome' as StepId };
      live.current = start; setState(start);
      setProfile(await currentProfileValues());
    })();
  }, []);
  useFocusEffect(useCallback(() => { refreshFacts(); }, [refreshFacts]));

  const persist = (s: OnboardingState) => {
    live.current = s; setState(s); setMsg('');
    if (s.status === 'in_progress' || s.status === 'done' || s.status === 'skipped') saveOnboarding(s);
  };
  // A visit that was not an in-progress run (a direct link): moving around does not change the stored status until it is finished or skipped.
  const move = (s: OnboardingState) => { live.current = s; setState(s); setMsg(''); if (s.status === 'in_progress') saveOnboarding(s); };

  if (!state) return <View style={s.root} />;

  const leave = (final: OnboardingState) => { persist(final); router.replace('/dashboard'); };
  const step = state.step;
  const idx = stepIndex(step);

  const Next = ({ label = 'Continue', onPress }: { label?: string; onPress?: () => void }) => (
    <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={onPress ?? (() => move(stepNext(state)))}><Text style={s.primaryTxt}>{label}</Text></TouchableOpacity>
  );
  const Later = ({ label = 'Not now' }: { label?: string }) => (
    <TouchableOpacity accessibilityRole="button" style={s.secondary} onPress={() => move(stepNext(state))}><Text style={s.secondaryTxt}>{label}</Text></TouchableOpacity>
  );

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={s.top}>
        {idx > 0 && step !== 'done' ? <TouchableOpacity accessibilityRole="button" onPress={() => move(stepBack(state))} hitSlop={12}><Text style={s.link}>← Back</Text></TouchableOpacity> : <View />}
        {step !== 'done' && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Skip the welcome for now" onPress={() => leave(skipAll(state, new Date()))} hitSlop={12}><Text style={s.muted}>Skip for now</Text></TouchableOpacity>}
      </View>

      {step !== 'done' && (
        <View style={s.dots} accessibilityLabel={`Step ${idx + 1} of ${COUNT}`}>
          {STEPS.slice(0, COUNT).map((id, i) => <View key={id} style={[s.dot, i <= idx && s.dotOn]} />)}
        </View>
      )}

      {step === 'welcome' && (
        <>
          <Text style={s.logo}>⬡</Text>
          <Text accessibilityRole="header" style={Typography.h1}>Welcome to FIN·OS</Text>
          <Text style={s.lead}>One place to see where your money stands, plan what comes next, and understand the rules that apply to you in India.</Text>
          <View style={s.card}>
            <Text style={s.cardTitle}>What it is</Text>
            <Text style={s.line}>• Trackers and calculators for spending, goals, tax, loans, retirement and more.</Text>
            <Text style={s.line}>• Your numbers stay on this phone unless you sign in to sync them.</Text>
            <Text style={s.line}>• Estimates you can check: each result says what it assumed.</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardTitle}>What it is not</Text>
            <Text style={s.line}>• Not financial, tax or legal advice, and not SEBI registered.</Text>
            <Text style={s.line}>• It does not move money, trade for you, or connect to your bank.</Text>
            <Text style={s.line}>• Prices and rules can be out of date. Check before you act.</Text>
          </View>
          <Text style={s.small}>Everything on the next few screens is optional. You can skip any of it and change it later in Settings.</Text>
          <Next label="Get started" />
        </>
      )}

      {step === 'profile' && (
        <>
          <Text accessibilityRole="header" style={Typography.h1}>A little about you</Text>
          <Text style={s.lead}>These make the Money Score, retirement and insurance numbers fit you. Leave out anything you would rather not say: nothing is filled in for you.</Text>
          {(['name', 'age', 'income', 'dependents'] as (keyof Profile)[]).map(k => (
            <View key={k} style={{ marginBottom: Spacing.md }}>
              <Text style={Typography.label}>{{ name: 'NAME', age: 'AGE', income: 'MONTHLY INCOME (₹)', dependents: 'PEOPLE WHO DEPEND ON YOUR INCOME' }[k]}</Text>
              <TextInput style={s.input} value={profile[k]} onChangeText={t => { setProfile(p => ({ ...p, [k]: t })); setErrors(e => ({ ...e, [k]: undefined })); }}
                accessibilityLabel={{ name: 'Your name', age: 'Your age', income: 'Your monthly income', dependents: 'Number of dependants' }[k]}
                keyboardType={k === 'name' ? 'default' : 'number-pad'} placeholder="Skip" placeholderTextColor={Colors.textDim} autoCorrect={false} maxLength={k === 'name' ? 60 : 10} />
              {errors[k] ? <Text style={s.err}>{errors[k]}</Text> : <Text style={s.help}>{USED_FOR[k]}</Text>}
            </View>
          ))}
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={async () => {
            const r = await saveProfileAnswers(profile);
            setErrors(r.errors);
            const bad = Object.keys(r.errors).length > 0;
            if (r.saved > 0) move(markDid(bad ? state : stepNext(state), 'profile')); else if (!bad) move(stepNext(state));
            if (bad) setMsg('Fix the highlighted field, or clear it to skip it.');
          }}><Text style={s.primaryTxt}>{completeness(profile) > 0 ? 'Save and continue' : 'Continue without saving'}</Text></TouchableOpacity>
          {msg ? <Text style={s.err} accessibilityRole="alert">{msg}</Text> : null}
        </>
      )}

      {step === 'dna' && (
        <>
          <Text accessibilityRole="header" style={Typography.h1}>Your money personality</Text>
          <Text style={s.lead}>A short quiz about how you save, spend and handle risk. It shapes the Health Score. About two minutes, and you can do it any time from Tools.</Text>
          {facts.dnaDone && <Text style={s.ok}>You have already completed it.</Text>}
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => { persist(markDid(state, 'dna')); router.push('/tools/dna' as any); }}><Text style={s.primaryTxt}>{facts.dnaDone ? 'See my result' : 'Take the quiz'}</Text></TouchableOpacity>
          <Later label="Maybe later" />
        </>
      )}

      {step === 'reminders' && (
        <>
          <Text accessibilityRole="header" style={Typography.h1}>{NOTIFICATIONS_COPY.title}</Text>
          <Text style={s.lead}>{NOTIFICATIONS_COPY.why}</Text>
          <View style={s.card}>
            <Text style={s.line}>{NOTIFICATIONS_COPY.whatHappens}</Text>
            <Text style={[s.line, { marginTop: 8 }]}>{NOTIFICATIONS_COPY.ifNo}</Text>
          </View>
          {facts.remindersOn ? <Text style={s.ok}>Reminders are on.</Text> : (
            <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={async () => {
              const r = await turnOnReminders();
              if (r === 'enabled') { await refreshFacts(); move(markDid(stepNext(state), 'reminders')); return; }
              setMsg(r === 'unsupported' ? 'Reminders are only available in the phone app.' : 'Your phone did not allow notifications. You can turn them on later in your phone\'s settings. Everything else works as before.');
            }}><Text style={s.primaryTxt}>{NOTIFICATIONS_COPY.ask}</Text></TouchableOpacity>
          )}
          {msg ? <Text style={s.help} accessibilityLiveRegion="polite">{msg}</Text> : null}
          {facts.remindersOn ? <Next /> : <Later label={NOTIFICATIONS_COPY.notNow} />}
        </>
      )}

      {step === 'lock' && (
        <>
          <Text accessibilityRole="header" style={Typography.h1}>Keep it private</Text>
          <Text style={s.lead}>An app lock asks for a 6-digit PIN when FIN·OS opens, so someone who picks up your phone cannot read your numbers.</Text>
          <View style={s.card}>
            <Text style={s.line}>• A forgotten PIN cannot be recovered; the way back is to erase the app's data on this phone and restore a backup or your cloud copy.</Text>
            <Text style={s.line}>• Fingerprint or face is optional and can be added in the same place.</Text>
          </View>
          {facts.lockOn ? <Text style={s.ok}>App lock is on.</Text> : (
            <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => { persist(markDid(state, 'lock')); router.push('/security' as any); }}><Text style={s.primaryTxt}>Set up app lock</Text></TouchableOpacity>
          )}
          {facts.lockOn ? <Next /> : <Later label="Not now" />}
        </>
      )}

      {step === 'look' && (
        <>
          <Text accessibilityRole="header" style={Typography.h1}>Language and look</Text>
          <Text style={s.lead}>Tap to choose. If you do not, the app keeps its defaults.</Text>
          <Text style={Typography.label}>LANGUAGE</Text>
          <View style={s.chips}>
            {LANGUAGES.map(l => (
              <TouchableOpacity key={l.id} accessibilityRole="button" accessibilityState={{ selected: lang === l.id }} accessibilityLabel={`Language: ${l.label}`}
                style={[s.chip, lang === l.id && s.chipOn]} onPress={() => { setLang(l.id); persist(markDid(state, 'look')); }}><Text style={[s.chipTxt, lang === l.id && { color: Colors.cyan }]}>{l.label}</Text></TouchableOpacity>
            ))}
          </View>
          <Text style={[Typography.label, { marginTop: Spacing.md }]}>APPEARANCE</Text>
          <View style={s.chips}>
            {([['system', 'Follow my phone'], ['dark', 'Dark'], ['light', 'Light']] as [ThemeChoice, string][]).map(([id, label]) => (
              <TouchableOpacity key={id} accessibilityRole="button" accessibilityState={{ selected: getThemeChoice() === id }} accessibilityLabel={`Appearance: ${label}`}
                style={[s.chip, getThemeChoice() === id && s.chipOn]} onPress={() => { setThemeChoice(id); persist(markDid(state, 'look')); }}><Text style={[s.chipTxt, getThemeChoice() === id && { color: Colors.cyan }]}>{label}</Text></TouchableOpacity>
            ))}
          </View>
          <Text style={s.small}>Hindi is a first translation that a native speaker has not reviewed yet. Some screens are still in English.</Text>
          <Next />
        </>
      )}

      {step === 'done' && (
        <>
          <Text style={s.logo}>⬡</Text>
          <Text accessibilityRole="header" style={Typography.h1}>You are set</Text>
          {(() => {
            const lines = summaryLines(state, { profileFields: completeness(profile), ...facts });
            return lines.length
              ? <View style={s.card}>{lines.map(l => <Text key={l} style={s.line}>✓ {l}</Text>)}</View>
              : <Text style={s.lead}>You skipped the optional steps, so nothing was filled in. Add what you like as you go.</Text>;
          })()}
          <Text style={s.small}>You can open this welcome again from Settings, and tell us what to fix from Settings → Feedback.</Text>
          <TouchableOpacity accessibilityRole="button" style={s.primary} onPress={() => leave(finish(state, new Date()))}><Text style={s.primaryTxt}>Open Home</Text></TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: 60, maxWidth: 560, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  link: { color: Colors.cyan, fontWeight: '700', fontSize: 14 },
  muted: { color: Colors.textMuted, fontSize: 14 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: Spacing.lg },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.borderMed },
  dotOn: { backgroundColor: Colors.cyan },
  logo: { fontSize: 40, color: Colors.cyan, marginBottom: Spacing.sm },
  lead: { ...Typography.body, color: Colors.textMuted, lineHeight: 21, marginTop: Spacing.sm, marginBottom: Spacing.lg },
  card: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.lg, padding: Spacing.md, marginBottom: Spacing.md },
  cardTitle: { ...Typography.h3, marginBottom: 6 },
  line: { ...Typography.body, lineHeight: 21, marginBottom: 4 },
  small: { ...Typography.caption, lineHeight: 17, marginBottom: Spacing.lg },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 12, color: Colors.textPrimary, fontSize: 15, marginTop: 6 },
  help: { ...Typography.caption, marginTop: 4, lineHeight: 16 },
  err: { color: Colors.red, fontSize: 12, marginTop: 4, lineHeight: 16 },
  ok: { color: Colors.teal, fontWeight: '700', marginBottom: Spacing.md },
  primary: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm },
  primaryTxt: { color: Colors.bg, fontWeight: '800', fontSize: 15 },
  secondary: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingVertical: 13, alignItems: 'center', marginTop: Spacing.sm },
  secondaryTxt: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radii.full, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { borderColor: Colors.cyan, backgroundColor: 'rgba(0,212,255,0.12)' },
  chipTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
});
