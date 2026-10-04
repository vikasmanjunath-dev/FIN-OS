import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';

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

export function TrackerScreen({ title, subtitle, children, scrollRef }: { title: string; subtitle?: string; children: React.ReactNode; scrollRef?: React.RefObject<ScrollView | null> }) {
  return (
    <ScrollView ref={scrollRef} style={ui.root} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={ui.header}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))} hitSlop={12}>
          <Text style={ui.back}>← Back</Text>
        </TouchableOpacity>
      </View>
      <Text style={Typography.h1}>{title}</Text>
      {subtitle ? <Text style={[Typography.caption, { marginTop: 4, marginBottom: Spacing.lg, lineHeight: 17 }]}>{subtitle}</Text> : <View style={{ height: Spacing.lg }} />}
      {children}
    </ScrollView>
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
    <View style={{ flex: 1 }}>
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

  // Follow external changes (other screens, reloads) unless the user is mid-edit
  useEffect(() => { if (!focused) setText(value ? String(Math.round(value * 100) / 100) : ''); }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const n = parseFloat(text.replace(/[₹,\s]/g, ''));
    const next = Number.isFinite(n) && n >= 0 ? n : 0;
    if (next !== value) onCommit?.(next);
    else setText(value ? String(value) : '');
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
        <View style={[ui.inputWrap, focused && { borderColor: Colors.cyan }]}>
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
    </View>
  );
}

export const ui = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: 80 },
  header: { marginBottom: Spacing.md },
  back: { color: Colors.cyan, fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md, overflow: 'hidden' },
  cardBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  sectionLabel: { ...Typography.label, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  barTrack: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' },
  statLabel: { ...Typography.caption, marginBottom: 2 },
  statValue: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.border },
  fieldIcon: { fontSize: 18, marginRight: Spacing.sm, width: 24, textAlign: 'center' },
  fieldLabel: { ...Typography.body, fontWeight: '600' },
  fieldSub: { ...Typography.caption, marginTop: 2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', width: 138, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: 10 },
  rupee: { color: Colors.textMuted, fontSize: 14, marginRight: 4 },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 14, paddingVertical: 9, textAlign: 'right' },
  suffix: { color: Colors.textMuted, fontSize: 11, marginLeft: 4 },
  readOnlyValue: { color: Colors.textMuted, fontSize: 14, fontWeight: '700' },
});

/** Plain number field (age, percentages…). Commits on blur; out-of-range input snaps into [min, max]. */
export function NumberField({ label, sub, value, onCommit, suffix, min = 0, max, icon }: {
  label: string; sub?: string; value: number; onCommit: (n: number) => void; suffix?: string; min?: number; max?: number; icon?: string;
}) {
  const [text, setText] = useState(value ? String(value) : '');
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(value ? String(value) : ''); }, [value, focused]);
  const commit = () => {
    setFocused(false);
    let n = parseFloat(text);
    if (!Number.isFinite(n)) n = 0;
    n = Math.max(min, max != null ? Math.min(max, n) : n);
    if (n !== value) onCommit(n); else setText(value ? String(value) : '');
  };
  return (
    <View style={ui.fieldRow}>
      {icon ? <Text style={ui.fieldIcon}>{icon}</Text> : null}
      <View style={{ flex: 1, paddingRight: Spacing.sm }}>
        <Text style={ui.fieldLabel}>{label}</Text>
        {sub ? <Text style={ui.fieldSub}>{sub}</Text> : null}
      </View>
      <View style={[ui.inputWrap, { width: 110 }, focused && { borderColor: Colors.cyan }]}>
        <TextInput style={ui.input} value={text} onChangeText={setText} onFocus={() => setFocused(true)} onBlur={commit} onSubmitEditing={commit}
          keyboardType="decimal-pad" placeholder="0" placeholderTextColor={Colors.textDim} selectTextOnFocus accessibilityLabel={label} />
        {suffix ? <Text style={ui.suffix}>{suffix}</Text> : null}
      </View>
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
