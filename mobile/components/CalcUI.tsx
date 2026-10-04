import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { inrShort } from '@/components/TrackerUI';

/** Parse what a person typed into a number ("₹ 12,50,000" → 1250000); anything unreadable is 0. */
export const toNum = (s: string) => {
  const v = parseFloat(String(s).replace(/[₹,\s]/g, ''));
  return Number.isFinite(v) ? v : 0;
};

/** Labelled number/text input that reports every keystroke (calculators recompute live, unlike the trackers' commit-on-blur fields). */
export function CalcField({ label, sub, value, onChange, prefix, suffix, text, placeholder, maxLength }: {
  label: string; sub?: string; value: string; onChange: (s: string) => void; prefix?: string; suffix?: string; text?: boolean; placeholder?: string; maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ flex: 1, marginBottom: Spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.inputWrap, focused && { borderColor: Colors.cyan }]}>
        {prefix ? <Text style={s.affix}>{prefix}</Text> : null}
        <TextInput
          style={s.input}
          value={value}
          onChangeText={t => onChange(text ? t : t.replace(/[^0-9.,]/g, ''))}
          keyboardType={text ? 'default' : 'decimal-pad'}
          placeholder={placeholder ?? '0'}
          placeholderTextColor={Colors.textDim}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          selectTextOnFocus
          maxLength={maxLength}
          accessibilityLabel={label}
        />
        {suffix ? <Text style={s.affix}>{suffix}</Text> : null}
      </View>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.chips}>
        {options.map(o => (
          <TouchableOpacity key={o.id} style={[s.chip, value === o.id && s.chipOn]} onPress={() => onChange(o.id)}
            accessibilityRole="button" accessibilityLabel={`${label}: ${o.label}`} accessibilityState={{ selected: value === o.id }}>
            <Text style={[s.chipTxt, value === o.id && s.chipTxtOn]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export function CheckRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.checkRow}>
      <Text style={[Typography.caption, { flex: 1, lineHeight: 17, color: Colors.textPrimary }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.cyan, false: Colors.borderMed }} accessibilityLabel={label} />
    </View>
  );
}

export function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={{ color: Colors.cyan, fontWeight: '700', fontSize: 13 }}>{open ? '▾' : '▸'} {title}</Text>
      </TouchableOpacity>
      {open ? <View style={{ marginTop: Spacing.sm }}>{children}</View> : null}
    </View>
  );
}

export function Bullet({ children }: { children: React.ReactNode }) {
  return <Text style={[Typography.caption, { lineHeight: 18, marginBottom: 6, color: Colors.textPrimary }]}>• {children}</Text>;
}

/** Two series over the same x values (e.g. net position by year). Zero line is drawn when the data crosses it. */
export function TwoLineChart({ a, b, labels, colorA, colorB, nameA, nameB, height = 150 }: {
  a: number[]; b: number[]; labels: string[]; colorA: string; colorB: string; nameA: string; nameB: string; height?: number;
}) {
  const [w, setW] = useState(0);
  const padL = 8, padR = 8, padT = 10, padB = 20;
  const all = [...a, ...b];
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const span = hi - lo || 1;
  const n = Math.max(a.length, 1);
  const x = (i: number) => padL + (n === 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
  const y = (v: number) => padT + (1 - (v - lo) / span) * (height - padT - padB);
  const pts = (arr: number[]) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: Spacing.lg, marginBottom: 4 }}>
        <Text style={{ color: colorA, fontSize: 11, fontWeight: '700' }}>● {nameA}</Text>
        <Text style={{ color: colorB, fontSize: 11, fontWeight: '700' }}>● {nameB}</Text>
      </View>
      <View style={{ height }} onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={height}>
            {lo < 0 && <Line x1={padL} x2={w - padR} y1={y(0)} y2={y(0)} stroke={Colors.borderMed} strokeDasharray="4 4" strokeWidth={1} />}
            <Polyline points={pts(a)} fill="none" stroke={colorA} strokeWidth={2.5} />
            <Polyline points={pts(b)} fill="none" stroke={colorB} strokeWidth={2.5} />
            <SvgText x={padL} y={height - 5} fill={Colors.textMuted} fontSize={10}>{labels[0]}</SvgText>
            <SvgText x={w - padR} y={height - 5} fill={Colors.textMuted} fontSize={10} textAnchor="end">{labels[labels.length - 1]}</SvgText>
          </Svg>
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={Typography.caption}>{inrShort(lo)}</Text>
        <Text style={Typography.caption}>{inrShort(hi)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { ...Typography.label, marginBottom: 6 },
  sub: { ...Typography.caption, marginTop: 4, lineHeight: 15 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: Spacing.md },
  affix: { color: Colors.textMuted, fontSize: 14, marginHorizontal: 2 },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 15, paddingVertical: 10, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg },
  chipOn: { borderColor: Colors.cyan + 'BB', backgroundColor: Colors.cyan + '22' },
  chipTxt: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  chipTxtOn: { color: Colors.cyan, fontWeight: '800' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
});
