import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { parseTrackerMoney, parseTrackerNumber } from '@/lib/trackerInput';
import { canRenderLoadedTrackerData, getTrackerStorageStatus, subscribeTrackerStorageStatus, type TrackerStorageIssue } from '@/lib/trackerStorageStatus';

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const inrShort = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)}K`;
  return `${s}₹${Math.round(a).toLocaleString('en-IN')}`;
};

export const tierColor = (t: string) =>
  ({ ELITE: Colors.teal, GREAT: Colors.teal, GOOD: Colors.cyan, FAIR: Colors.gold, DANGER: Colors.red } as Record<string, string>)[t] ?? Colors.cyan;

export function TrackerStorageNotice() {
  const [issue, setIssue] = useState<TrackerStorageIssue | null>(getTrackerStorageStatus());
  useEffect(() => subscribeTrackerStorageStatus(setIssue), []);
  if (!issue) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: 'rgba(255,68,68,0.08)', borderColor: Colors.red, borderWidth: 1, borderRadius: Radii.md, padding: Spacing.md, marginBottom: Spacing.md }}>
      <Text style={{ color: Colors.red, fontSize: 13, lineHeight: 19 }}>{issue.message}</Text>
    </View>
  );
}

export function TrackerScreen({ title, subtitle, children, scrollRef }: { title: string; subtitle?: string; children: React.ReactNode; scrollRef?: React.RefObject<ScrollView | null> }) {
  const [issue, setIssue] = useState<TrackerStorageIssue | null>(getTrackerStorageStatus());
  useEffect(() => subscribeTrackerStorageStatus(setIssue), []);
  const insets = useSafeAreaInsets();       // the top inset is applied once by the root layout; the bottom one (home indicator) here
  return (
    <ScrollView ref={scrollRef} style={ui.root} contentContainerStyle={[ui.content, { paddingBottom: 80 + insets.bottom }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
      <View style={ui.header}>
        <TouchableOpacity accessibilityRole="button" style={ui.backBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))} hitSlop={12}>
          <Text style={ui.back}>← Back</Text>
        </TouchableOpacity>
      </View>
      {/* a heading for screen readers; at large text a long title shrinks (native) or wraps at a word, and is capped at 1.4x, instead of breaking mid-word */}
      <Text accessibilityRole="header" style={[Typography.h1, { flexShrink: 1 }]} maxFontSizeMultiplier={1.4}>{title}</Text>
      {subtitle ? <Text style={[Typography.caption, { marginTop: 4, marginBottom: Spacing.lg, lineHeight: 17 }]}>{subtitle}</Text> : <View style={{ height: Spacing.lg }} />}
      {issue && <TrackerStorageNotice />}
      {canRenderLoadedTrackerData(issue) && children}
    </ScrollView>
  );
}

/** A card that goes somewhere: title, one line of explanation and a chevron, so it reads as tappable (not as another static note). */
export function NavCard({ title, sub, onPress, accent = Colors.cyan, style }: { title: string; sub?: string; onPress: () => void; accent?: string; style?: ViewStyle }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} accessibilityRole="button" accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={[ui.navCard, { borderColor: accent + '44' }, style]}>
      <View style={{ flex: 1 }}>
        <Text style={ui.navTitle}>{title}</Text>
        {sub ? <Text style={ui.navSub}>{sub}</Text> : null}
      </View>
      <Text style={[ui.navChevron, { color: accent }]} accessibilityElementsHidden importantForAccessibility="no">›</Text>
    </TouchableOpacity>
  );
}

export function Card({ children, style, accent }: { children: React.ReactNode; style?: ViewStyle; accent?: string }) {
  return (
    <View style={[ui.card, style]}>
      {accent ? <View style={[ui.cardBar, { backgroundColor: accent }]} /> : null}
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={ui.sectionLabel}>{children}</Text>;
}

export function Bar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <View style={[ui.barTrack, { height }]}>
      <View style={{ width: `${p}%`, height: '100%', backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
      <Text style={ui.statLabel}>{label}</Text>
      <Text style={[ui.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

/**
 * ₹ amount field. Edits stay local while typing and are committed once, on blur / submit —
 * so storage and recomputation don't run on every keystroke.
 */
export function MoneyField({
  label, sub, value, onCommit, readOnly, suffix, icon,
}: { label: string; sub?: string; value: number; onCommit?: (n: number) => void; readOnly?: boolean; suffix?: string; icon?: string }) {
  const [text, setText] = useState(value ? String(Math.round(value * 100) / 100) : '');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastValue = useRef(value);

  // Follow external changes (other screens, reloads) unless the user is mid-edit
  useEffect(() => {
    if (!focused && value !== lastValue.current) {
      lastValue.current = value;
      setText(value ? String(Math.round(value * 100) / 100) : '');
      setError(null);
    }
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const parsed = parseTrackerMoney(text);
    if (!parsed.ok) { setError(parsed.error); return; }
    setError(null);
    setText(parsed.value ? String(parsed.value) : '');
    if (parsed.value !== value) onCommit?.(parsed.value);
  };

  return (
    <View style={ui.fieldRow}>
      {icon ? <Text style={ui.fieldIcon}>{icon}</Text> : null}
      <View style={{ flex: 1, paddingRight: Spacing.sm }}>
        <Text style={ui.fieldLabel}>{label}</Text>
        {sub ? <Text style={ui.fieldSub}>{sub}</Text> : null}
      </View>
      {readOnly ? (
        <Text style={ui.readOnlyValue}>{value > 0 ? inr(value) : '—'}</Text>
      ) : (
        <View style={[ui.inputWrap, focused && { borderColor: Colors.cyan }, error && { borderColor: Colors.red }]}>
          <Text style={ui.rupee}>₹</Text>
          <TextInput
            style={ui.input}
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={Colors.textDim}
            selectTextOnFocus
            accessibilityLabel={label}
          />
          {suffix ? <Text style={ui.suffix}>{suffix}</Text> : null}
        </View>
      )}
      {error ? <Text accessibilityLiveRegion="polite" style={{ color: Colors.red, fontSize: 11, marginTop: 4, textAlign: 'right' }}>{error}</Text> : null}
    </View>
  );
}

export const ui = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 80 },   // the notch inset is applied once by the root layout
  header: { marginBottom: Spacing.xs },
  back: { color: Colors.cyan, fontSize: 14, fontWeight: '600' },
  backBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md, overflow: 'hidden' },
  navCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  navTitle: { ...Typography.body, fontWeight: '700', marginBottom: 2 },
  navSub: { ...Typography.caption, lineHeight: 18 },
  navChevron: { fontSize: 28, lineHeight: 30, fontWeight: '300' },
  cardBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  sectionLabel: { ...Typography.label, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  barTrack: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' },
  statLabel: { ...Typography.caption, marginBottom: 2 },
  statValue: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  fieldIcon: { fontSize: 18, marginRight: Spacing.sm, minWidth: 24, flexShrink: 0, textAlign: 'center' },
  fieldLabel: { ...Typography.body, fontWeight: '600' },
  fieldSub: { ...Typography.caption, marginTop: 2 },
  inputWrap: { minHeight: 44, flexDirection: 'row', alignItems: 'center', width: 138, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: 10 },
  rupee: { color: Colors.textMuted, fontSize: 14, marginRight: 4 },
  // minWidth 0: on the web an <input> will not shrink below its default width, so a long figure was cut off at the right edge of the box
  input: { flex: 1, minWidth: 0, minHeight: 44, color: Colors.textPrimary, fontSize: 14, paddingVertical: 9, textAlign: 'right' },
  suffix: { color: Colors.textMuted, fontSize: 11, marginLeft: 4 },
  readOnlyValue: { color: Colors.textMuted, fontSize: 14, fontWeight: '700' },
});

/** Plain number field (age, percentages…). Invalid and out-of-range input is left visible and not saved. */
export function NumberField({ label, sub, value, onCommit, suffix, min = 0, max, icon }: {
  label: string; sub?: string; value: number; onCommit: (n: number) => void; suffix?: string; min?: number; max?: number; icon?: string;
}) {
  const [text, setText] = useState(value ? String(value) : '');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastValue = useRef(value);
  useEffect(() => {
    if (!focused && value !== lastValue.current) {
      lastValue.current = value;
      setText(value ? String(value) : '');
      setError(null);
    }
  }, [value, focused]);
  const commit = () => {
    setFocused(false);
    const parsed = parseTrackerNumber(text, min, max);
    if (!parsed.ok) { setError(parsed.error); return; }
    setError(null);
    setText(String(parsed.value));
    if (parsed.value !== value) onCommit(parsed.value);
  };
  return (
    <View style={ui.fieldRow}>
      {icon ? <Text style={ui.fieldIcon}>{icon}</Text> : null}
      <View style={{ flex: 1, paddingRight: Spacing.sm }}>
        <Text style={ui.fieldLabel}>{label}</Text>
        {sub ? <Text style={ui.fieldSub}>{sub}</Text> : null}
      </View>
      <View style={[ui.inputWrap, { width: 110 }, focused && { borderColor: Colors.cyan }, error && { borderColor: Colors.red }]}>
        <TextInput style={ui.input} value={text} onChangeText={setText} onFocus={() => setFocused(true)} onBlur={commit} onSubmitEditing={commit}
          keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} selectTextOnFocus accessibilityLabel={label} />
        {suffix ? <Text style={ui.suffix}>{suffix}</Text> : null}
      </View>
      {error ? <Text accessibilityLiveRegion="polite" style={{ color: Colors.red, fontSize: 11, marginTop: 4, textAlign: 'right' }}>{error}</Text> : null}
    </View>
  );
}

/** Text field with validation (e.g. dates). Invalid input shows the message and is NOT saved. */
export function TextField({ label, sub, value, onCommit, placeholder, validate, icon }: {
  label: string; sub?: string; value: string; onCommit: (s: string) => void; placeholder?: string; validate?: (s: string) => string | null; icon?: string;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Follow external changes only. (Depending on `focused` here would wipe the error message the moment the field loses focus.)
  useEffect(() => { setText(value); setError(null); }, [value]);
  const commit = () => {
    setFocused(false);
    const t = text.trim();
    const err = validate ? validate(t) : null;
    if (err) { setError(err); return; }
    setError(null);
    if (t !== value) onCommit(t);
  };
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.border }}>
      <View style={[ui.fieldRow, { borderBottomWidth: 0 }]}>
        {icon ? <Text style={ui.fieldIcon}>{icon}</Text> : null}
        <View style={{ flex: 1, paddingRight: Spacing.sm }}>
          <Text style={ui.fieldLabel}>{label}</Text>
          {sub ? <Text style={ui.fieldSub}>{sub}</Text> : null}
        </View>
        <View style={[ui.inputWrap, { width: 138 }, focused && { borderColor: Colors.cyan }, error ? { borderColor: Colors.red } : null]}>
          <TextInput style={ui.input} value={text} onChangeText={setText} onFocus={() => setFocused(true)} onBlur={commit} onSubmitEditing={commit}
            placeholder={placeholder} placeholderTextColor={Colors.textDim} autoCapitalize="none" autoCorrect={false} accessibilityLabel={label} />
        </View>
      </View>
      {error ? <Text style={{ color: Colors.red, fontSize: 12, paddingBottom: 8, textAlign: 'right' }} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}
