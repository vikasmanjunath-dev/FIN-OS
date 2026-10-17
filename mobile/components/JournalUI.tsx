import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';
import { Colors, Spacing, Radii, Typography } from '@/constants/theme';
import { useThemed } from '@/lib/theme';
import { loadJournal, type JournalData } from '@/lib/tradeJournalStorage';
import { pnlText, type EquityPoint, type Group } from '@/lib/tradeJournal';

/** The journal, reloaded each time the screen comes into view. `data` is null while the first read is under way. */
export function useJournal() {
  const [data, setData] = useState<JournalData | null>(null);
  const reload = useCallback(async () => setData(await loadJournal()), []);
  useFocusEffect(useCallback(() => { let live = true; loadJournal().then(d => { if (live) setData(d); }); return () => { live = false; }; }, []));
  return { data, reload };
}

export const profitColor = (n: number | null | undefined) => (typeof n !== 'number' || n === 0 ? Colors.textPrimary : n > 0 ? Colors.teal : Colors.red);

export function Chips<T extends string>({ label, options, value, onChange, multi, allowClear = true }: {
  label: string; options: readonly { id: T; label: string }[]; value: T | '' | T[]; onChange: (v: any) => void; multi?: boolean; allowClear?: boolean;
}) {
  const on = (id: T) => (Array.isArray(value) ? value.includes(id) : value === id);
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <View style={s.chips}>
        {options.map(o => (
          <TouchableOpacity key={o.id} style={[s.chip, on(o.id) && s.chipOn]} accessibilityRole="button" accessibilityLabel={`${label}: ${o.label}`} accessibilityState={{ selected: on(o.id) }}
            onPress={() => {
              if (multi) { const cur = (value as T[]) ?? []; onChange(cur.includes(o.id) ? cur.filter(x => x !== o.id) : [...cur, o.id]); }
              else onChange(allowClear && value === o.id ? '' : o.id);
            }}>
            <Text style={[s.chipTxt, on(o.id) && s.chipTxtOn]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export function Tile({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={[s.tileValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {sub ? <Text style={s.tileSub}>{sub}</Text> : null}
    </View>
  );
}

export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  const c = tone === 'warn' ? Colors.orange : Colors.cyan;
  return <View style={[s.notice, { borderColor: c + '55', backgroundColor: c + '12' }]}><Text style={[Typography.caption, { color: Colors.textPrimary, lineHeight: 17 }]}>{children}</Text></View>;
}

export const NOT_ADVICE = 'This journal records and counts what you entered. It is not investment advice and does not compute tax.';

/** Running total of net profit, trade by trade, with the lowest-from-peak stretch shaded. */
export function EquityChart({ points, height = 170 }: { points: EquityPoint[]; height?: number }) {
  const T = useThemed();
  const [w, setW] = useState(0);
  if (points.length === 0) return null;
  const pl = 8, pr = 8, pt = 14, pb = 28;
  const vals = [0, ...points.map(p => p.equity)];
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1, n = vals.length;
  const x = (i: number) => pl + (n <= 1 ? 0 : (i / (n - 1)) * (w - pl - pr));
  const y = (v: number) => pt + (1 - (v - lo) / span) * (height - pt - pb);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1].equity;
  const col = T(last >= 0 ? Colors.teal : Colors.red);
  return (
    <View style={{ height }} onLayout={e => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="image"
      accessibilityLabel={`Equity curve over ${points.length} trades, from ${points[0].date} to ${points[points.length - 1].date}, ending at ${pnlText(last)}, lowest ${pnlText(lo)}, highest ${pnlText(hi)}`}>
      {w > 0 && (
        <Svg width={w} height={height}>
          <Line x1={pl} x2={w - pr} y1={y(0)} y2={y(0)} stroke={T(Colors.borderHi)} strokeDasharray="3 4" strokeWidth={1} />
          <Path d={line} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" />
          <SvgText x={pl} y={y(hi) - 3} fill={T(Colors.textMuted)} fontSize={10}>{pnlText(hi)}</SvgText>
          <SvgText x={pl} y={Math.min(height - pb - 2, y(lo) - 3)} fill={T(Colors.textMuted)} fontSize={10}>{pnlText(lo)}</SvgText>
          <SvgText x={pl} y={height - 8} fill={T(Colors.textMuted)} fontSize={10}>{points[0].date.slice(5)}</SvgText>
          <SvgText x={w - pr} y={height - 8} fill={T(Colors.textMuted)} fontSize={10} textAnchor="end">{points[points.length - 1].date.slice(5)}</SvgText>
        </Svg>
      )}
    </View>
  );
}

/** One row per group: label, a bar from the middle (right = gain, left = loss), the net and the count. */
export function GroupBars({ groups, empty }: { groups: Group[]; empty: string }) {
  const T = useThemed();
  if (!groups.length) return <Text style={Typography.caption}>{empty}</Text>;
  const max = Math.max(...groups.map(g => Math.abs(g.net)), 1);
  return (
    <View>
      {groups.map(g => (
        <View key={g.key} style={s.gRow} accessible accessibilityLabel={`${g.label}: ${g.count} trades, net ${pnlText(g.net)}, ${Math.round(g.winRate * 100)} percent won`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[Typography.body, { flex: 1 }]} numberOfLines={1}>{g.label}</Text>
            <Text style={[Typography.body, { fontWeight: '800', color: profitColor(g.net) }]}>{pnlText(g.net, { sign: true })}</Text>
          </View>
          <View style={s.track}><View style={{ position: 'absolute', left: g.net >= 0 ? '50%' : `${50 - (Math.abs(g.net) / max) * 50}%`, width: `${(Math.abs(g.net) / max) * 50}%`, height: '100%', backgroundColor: T(g.net >= 0 ? Colors.teal : Colors.red), borderRadius: 3 }} /></View>
          <Text style={Typography.caption}>{g.count} {g.count === 1 ? 'trade' : 'trades'} · {Math.round(g.winRate * 100)}% won · average {pnlText(g.avg, { sign: true })}{g.count < 5 ? ' · very few trades' : ''}</Text>
        </View>
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  label: { ...Typography.label, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.full, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg },
  chipOn: { borderColor: Colors.cyan + 'BB', backgroundColor: Colors.cyan + '22' },
  chipTxt: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  chipTxtOn: { color: Colors.cyan, fontWeight: '800' },
  tile: { flex: 1, minWidth: '30%', backgroundColor: Colors.bg, borderRadius: Radii.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm + 2 },
  tileLabel: { ...Typography.label, fontSize: 10 },
  tileValue: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  tileSub: { ...Typography.caption, fontSize: 10, marginTop: 2 },
  notice: { borderWidth: 1, borderRadius: Radii.md, padding: Spacing.md, marginBottom: Spacing.md },
  gRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  track: { height: 6, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, marginVertical: 5, overflow: 'hidden' },
  primary: { backgroundColor: Colors.cyan, borderRadius: Radii.md, paddingVertical: 14, alignItems: 'center' },
  primaryTxt: { color: Colors.bg, fontWeight: '800', fontSize: 14 },
  secondary: { borderWidth: 1, borderColor: Colors.cyan + '66', borderRadius: Radii.md, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.sm },
  secondaryTxt: { color: Colors.cyan, fontWeight: '800', fontSize: 14 },
  link: { color: Colors.cyan, fontWeight: '800', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  input: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderMed, borderRadius: Radii.md, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.textPrimary, fontSize: 14 },
});
