import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mitra } from '@/components/reels/Mitra';
import { COPY, GOAL_OPTIONS, LANG_OPTIONS, LEVEL_OPTIONS, buildStart, goalIdOf, skippedStart, stepCount, stepText, welcomeSteps, langWasChosen, type GoalId, type StepId } from '@/lib/reels/coldstart';
import type { StartAnswers, StartLevel } from '@/lib/reels/reelsProfile';
import { LANG_KEY } from '@/lib/i18n';
import type { Lang } from '@/lib/i18nCore';
import { Colors, Radii, Spacing } from '@/constants/theme';

/** Whether the app has no language of its own yet (so the welcome should ask). Null until the phone has answered. */
export function useLangUnset(): boolean | null {
  const [unset, setUnset] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(LANG_KEY).then(v => { if (live) setUnset(!langWasChosen(v)); }, () => { if (live) setUnset(false); });
    return () => { live = false; };
  }, []);
  return unset;
}

/**
 * The first minute: one calm sheet, up to three questions, each answered with one tap, and a Skip that is always there. It says the answers
 * stay on the phone and can be changed later. Nothing is asked in a quiz style, nothing is required.
 * `initial` shows an earlier answer as chosen when the person comes back to change it.
 */
export function Welcome({ visible, lang, askLang, initial, onDone, onSkip, onPickLang }: {
  visible: boolean; lang: Lang; askLang: boolean; initial?: StartAnswers | null;
  onDone: (start: StartAnswers) => void; onSkip: (start: StartAnswers) => void; onPickLang: (l: Lang) => void;
}) {
  const steps = welcomeSteps(askLang);
  const [i, setI] = useState(0);
  const [goal, setGoal] = useState<GoalId | null>(goalIdOf(initial ?? undefined));
  useEffect(() => { if (visible) { setI(0); setGoal(goalIdOf(initial ?? undefined)); } }, [visible, initial]);
  const step: StepId = steps[Math.min(i, steps.length - 1)];
  const q = stepText(step)[lang];
  const advance = () => setI(n => Math.min(steps.length - 1, n + 1));
  const pickLevel = (level: StartLevel) => onDone(buildStart(goal ?? 'curious', level, new Date()));
  const chosenLevel = initial && !initial.skipped ? initial.level : null;

  return (
    <Modal visible={visible} animationType="none"onRequestClose={() => onSkip(skippedStart(new Date()))}>
      <View style={s.root} accessibilityViewIsModal>
        <View style={s.bar}>
          <Text style={s.count} maxFontSizeMultiplier={1.4} accessibilityLabel={stepCount(i + 1, steps.length)[lang]}>{stepCount(i + 1, steps.length)[lang]}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={COPY.skip[lang]} accessibilityHint={COPY.skipHint[lang]} style={s.skip} onPress={() => onSkip(skippedStart(new Date()))}>
            <Text style={s.skipTxt} maxFontSizeMultiplier={1.5}>{COPY.skip[lang]}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.owl}><Mitra mood="happy" t={1000} size={88} /></View>
          {i === 0 ? (
            <>
              <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>{COPY.title[lang]}</Text>
              <Text style={s.hello} maxFontSizeMultiplier={1.5}>{COPY.hello[lang]}</Text>
            </>
          ) : null}
          <Text style={s.q} accessibilityRole="header" maxFontSizeMultiplier={1.4}>{q}</Text>
          <View style={s.opts}>
            {step === 'lang' ? LANG_OPTIONS.map(o => (
              <Option key={o.id} label={o.label} selected={false} onPress={() => { onPickLang(o.id); advance(); }} />
            )) : null}
            {step === 'goal' ? GOAL_OPTIONS.map(o => (
              <Option key={o.id} label={o.label[lang]} selected={goal === o.id} onPress={() => { setGoal(o.id); advance(); }} />
            )) : null}
            {step === 'level' ? LEVEL_OPTIONS.map(o => (
              <Option key={o.id} label={o.label[lang]} hint={o.hint[lang]} selected={chosenLevel === o.id} onPress={() => pickLevel(o.id)} />
            )) : null}
          </View>
          {i > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel={COPY.back[lang]} style={s.back} onPress={() => setI(n => Math.max(0, n - 1))}>
              <Text style={s.backTxt} maxFontSizeMultiplier={1.5}>{`← ${COPY.back[lang]}`}</Text>
            </Pressable>
          ) : null}
          <Text style={s.privacy} maxFontSizeMultiplier={1.5}>{`🔒 ${COPY.privacy[lang]}`}</Text>
          <Text style={s.disc} maxFontSizeMultiplier={1.4}>{COPY.disclaimer[lang]}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Option({ label, hint, selected, onPress }: { label: string; hint?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={hint ? `${label}. ${hint}` : label} onPress={onPress} style={({ pressed }) => [s.opt, selected && s.optOn, pressed && s.optPressed]}>
      <Text style={s.optTxt} maxFontSizeMultiplier={1.6}>{label}</Text>
      {hint ? <Text style={s.optHint} maxFontSizeMultiplier={1.5}>{hint}</Text> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070A1A' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  count: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  skip: { minHeight: 44, minWidth: 64, paddingHorizontal: Spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)' },
  skipTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  page: { flexGrow: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xl, justifyContent: 'center' },
  owl: { alignItems: 'center', marginBottom: Spacing.sm },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center' },
  hello: { color: '#D8DEEC', fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: Spacing.sm },
  q: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: Spacing.lg },
  opts: { gap: Spacing.sm, marginTop: Spacing.md },
  opt: { minHeight: 56, paddingVertical: 10, paddingHorizontal: Spacing.md, borderRadius: Radii.lg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.07)', justifyContent: 'center' },
  optOn: { borderColor: Colors.cyan, backgroundColor: 'rgba(0,212,255,0.12)' },
  optPressed: { backgroundColor: 'rgba(255,255,255,0.16)' },
  optTxt: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  optHint: { color: '#B8C2DA', fontSize: 13, textAlign: 'center', marginTop: 2 },
  back: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  backTxt: { color: '#C4B5FD', fontSize: 15, fontWeight: '700' },
  privacy: { color: '#B8C2DA', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: Spacing.lg },
  disc: { color: Colors.textDim, fontSize: 11, textAlign: 'center', marginTop: Spacing.sm },
});
